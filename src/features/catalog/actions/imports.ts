import { and, eq } from "drizzle-orm";
import * as z from "zod";

import { isClientKey } from "@/components/client-key";
import {
  type ImportError,
  type ImportSheet,
  type ImportedDepartment,
  type ImportedProduct,
  headerMatches,
  importErrorKey,
  readDepartmentRows,
  readProductRows,
} from "@/domain/imports";
import { ActionError, GLOBAL_TARGET, type FirstResult, defineAction } from "@/server/action";
import type { FieldMessageKey } from "@/server/action-result";
import type { Executor } from "@/server/authorize";
import { now } from "@/server/clock";
import { catalogImports } from "@/server/db/schema";

import { checkDepartmentImport, checkProductImport } from "../imports/check";
import { PRODUCT_TYPE_WORDS, everyImportTitles } from "../imports/titles";
import { insertDepartment, lockDepartments, recordDepartmentCreate } from "./departments";
import { insertProduct, lockProducts, recordProductCreate } from "./products";
import { type Created, addSubtype, lockSubtypes, recordSubtypeCreate } from "./subtypes";

// The Excel import of products with their subtypes, and of departments (04-catalogs.md rule 7:
// "saves nothing unless every row is valid"; build-plan 1.10: "saving only when every row is valid,
// in one transaction"). Under catalog.manage (Head only, global; 03 Permission matrix, "Manage
// catalogs, users, branches, settings").
//
// - The input is the sheet as src/server/excel.ts read it; its check runs the whole domain row
//   check again (field rules, grouping, consistency of a product's rows, duplicates in the file,
//   the row limit), each error a field `<row>:<column>` with its kind (spec review of the plan,
//   Should fix 2).
// - The write takes the tables' advisory locks, checks every row against the catalog again with
//   every named entry held FOR SHARE (check.ts), and refuses all rows on any error. Then each entry
//   is written through the same path as the form: the factory's insert and history for products
//   and departments, addSubtype for subtypes (plan of 1.10, decision 12, Look first), one after
//   another in the one transaction; any throw saves nothing (developer-rules.md rule 3).
// - Entries made here have no client key; the `catalog_imports` row holds the import's, and a
//   repeat returns the first result to its maker only (rule 8; decision 13).

const cell = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("empty") }),
  z.object({ kind: z.literal("text"), text: z.string().max(10_000) }),
  z.object({ kind: z.literal("number"), value: z.number() }),
  z.object({ kind: z.literal("other") }),
]);

const sheetInput = z.object({
  header: z.array(cell).max(26),
  rows: z
    .array(z.object({ row: z.number().int().min(2), cells: z.array(cell).max(26) }))
    .max(5_000),
});

const baseInput = z.object({
  clientKey: z.string().refine(isClientKey),
  fileName: z
    .string()
    .transform((name) => name.trim())
    .refine((name) => Array.from(name).length >= 1 && Array.from(name).length <= 255),
  sheet: sheetInput,
});

type Context = z.core.$RefinementCtx;

/** Each error as an issue that names its kind (src/server/action-input.ts). */
function addErrors(context: Context, errors: readonly ImportError[], input: unknown) {
  for (const error of errors) {
    context.addIssue({
      code: "custom",
      message: error.kind,
      path: [importErrorKey(error)],
      params: { fieldError: error.kind },
      input,
    });
  }
}

/** The domain's row check of one kind, as the action's input check. */
function importInput<Entry>(
  kind: "products" | "departments",
  read: (sheet: ImportSheet) => { entries: Entry[]; errors: ImportError[] },
) {
  return baseInput.transform((input, context) => {
    if (!headerMatches(input.sheet.header, everyImportTitles(kind))) {
      addErrors(context, [{ row: 0, column: "file", kind: "notTemplate" }], input);
      return z.NEVER;
    }
    const { entries, errors } = read(input.sheet as ImportSheet);
    if (errors.length > 0) {
      addErrors(context, errors, input);
      return z.NEVER;
    }
    return { clientKey: input.clientKey, fileName: input.fileName, entries };
  });
}

/** The check's errors as the wrapper's field errors. */
function refused(errors: readonly ImportError[]): ActionError {
  const fields: Record<string, FieldMessageKey> = {};
  for (const error of errors) {
    const key = importErrorKey(error);
    fields[key] ??= `errors.field.${error.kind}`;
  }
  return new ActionError("invalid_input", fields);
}

/** What a saved import gives back: its record and how many rows it had. */
export type SavedImport = { importId: string; rows: number };

type Written<Entry> = SavedImport & { written: Entry[] };

/** The first import of a client key, given back to its maker only (developer-rules.md rule 8). */
function findImport<Entry>(kind: "PRODUCTS" | "DEPARTMENTS") {
  return async (tx: Executor, clientKey: string): Promise<FirstResult<Written<Entry>> | null> => {
    const [row] = await tx
      .select({
        id: catalogImports.id,
        rows: catalogImports.rowCount,
        userId: catalogImports.createdBy,
      })
      .from(catalogImports)
      .where(and(eq(catalogImports.clientKey, clientKey), eq(catalogImports.kind, kind)));
    if (!row) return null;
    return {
      result: { importId: row.id, rows: row.rows, written: [] },
      userId: row.userId,
      branchId: null,
    };
  };
}

type WrittenProduct = { product: Awaited<ReturnType<typeof insertProduct>>; subtypes: Created[] };

/** The rows a product took in the file: one, or one per subtype. */
function rowsOf(product: ImportedProduct): number {
  return Math.max(1, product.subtypes.length);
}

export const importProducts = defineAction({
  name: "importProducts",
  permission: "catalog.manage",
  input: importInput("products", (sheet) => {
    const { products, errors } = readProductRows(sheet, PRODUCT_TYPE_WORDS);
    return { entries: products, errors };
  }),
  async target() {
    return GLOBAL_TARGET;
  },
  repeat: {
    clientKey: (input) => input.clientKey,
    find: findImport<WrittenProduct>("PRODUCTS"),
  },
  async write({ tx, input, userId }): Promise<Written<WrittenProduct>> {
    // The products' lock, then the subtypes', as every write of those tables takes them.
    await lockProducts(tx);
    await lockSubtypes(tx);
    const { errors, refs } = await checkProductImport(tx, input.entries, { lock: true });
    if (errors.length > 0) throw refused(errors);
    const written: WrittenProduct[] = [];
    for (const [at, entry] of input.entries.entries()) {
      const ref = refs[at]!;
      const product = await insertProduct(
        tx,
        userId,
        {
          name: entry.name,
          type: entry.type,
          categoryId: ref.categoryId,
          unitId: ref.unitId,
          defaultCompanyId: ref.defaultCompanyId,
          // A product with subtypes has none; each subtype takes its own (decision 2, Look first).
          referencePrice: entry.price,
          description: entry.description,
          photoFileId: null,
        },
        null,
      );
      const subtypes: Created[] = [];
      for (const subtype of entry.subtypes) {
        subtypes.push(
          await addSubtype(
            tx,
            userId,
            {
              productId: product.id,
              name: subtype.name,
              referencePrice: subtype.price,
              photoFileId: null,
            },
            null,
          ),
        );
      }
      written.push({ product, subtypes });
    }
    const rows = input.entries.reduce((sum, entry) => sum + rowsOf(entry), 0);
    const [record] = await tx
      .insert(catalogImports)
      .values({
        kind: "PRODUCTS",
        fileName: input.fileName,
        rowCount: rows,
        createdBy: userId,
        clientKey: input.clientKey,
        createdAt: now(),
      })
      .returning({ id: catalogImports.id });
    return { importId: record!.id, rows, written };
  },
  // Each entry's own create row, as one made by hand (04 rule 9).
  async history({ tx, userId }, { written }) {
    for (const { product, subtypes } of written) {
      await recordProductCreate(tx, userId, product);
      for (const subtype of subtypes) await recordSubtypeCreate(tx, userId, subtype);
    }
  },
});

type WrittenDepartment = Awaited<ReturnType<typeof insertDepartment>>;

export const importDepartments = defineAction({
  name: "importDepartments",
  permission: "catalog.manage",
  input: importInput("departments", (sheet) => {
    const { departments, errors } = readDepartmentRows(sheet);
    return { entries: departments as ImportedDepartment[], errors };
  }),
  async target() {
    return GLOBAL_TARGET;
  },
  repeat: {
    clientKey: (input) => input.clientKey,
    find: findImport<WrittenDepartment>("DEPARTMENTS"),
  },
  async write({ tx, input, userId }): Promise<Written<WrittenDepartment>> {
    await lockDepartments(tx);
    const { errors, branchIds } = await checkDepartmentImport(tx, input.entries, { lock: true });
    if (errors.length > 0) throw refused(errors);
    const written: WrittenDepartment[] = [];
    for (const [at, entry] of input.entries.entries()) {
      written.push(
        await insertDepartment(
          tx,
          userId,
          {
            branchId: branchIds[at]!,
            name: entry.name,
            responsibleName: entry.responsibleName,
            responsiblePhone: entry.responsiblePhone,
          },
          null,
        ),
      );
    }
    const [record] = await tx
      .insert(catalogImports)
      .values({
        kind: "DEPARTMENTS",
        fileName: input.fileName,
        rowCount: written.length,
        createdBy: userId,
        clientKey: input.clientKey,
        createdAt: now(),
      })
      .returning({ id: catalogImports.id });
    return { importId: record!.id, rows: written.length, written };
  },
  async history({ tx, userId }, { written }) {
    for (const department of written) await recordDepartmentCreate(tx, userId, department);
  },
});
