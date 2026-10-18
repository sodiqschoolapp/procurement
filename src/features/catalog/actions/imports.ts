import { eq } from "drizzle-orm";
import * as z from "zod";

import { isClientKey } from "@/components/client-key";
import {
  type ImportError,
  type ImportKind,
  type ImportSheet,
  type ImportedDepartment,
  type ImportedPrice,
  type ImportedProduct,
  headerMatches,
  importErrorKey,
  readDepartmentRows,
  readPriceRows,
  readProductRows,
} from "@/domain/imports";
import { ActionError, GLOBAL_TARGET, type FirstResult, defineAction } from "@/server/action";
import type { FieldMessageKey } from "@/server/action-result";
import type { Executor } from "@/server/authorize";
import { now } from "@/server/clock";
import { catalogImports } from "@/server/db/schema";

import { checkDepartmentImport, checkPriceImport, checkProductImport } from "../imports/check";
import { PRODUCT_TYPE_WORDS, everyImportTitles } from "../imports/titles";
import { insertDepartment, lockDepartments, recordDepartmentCreate } from "./departments";
import { recordPriceAdd, setHeadPrice } from "./price-rows";
import { insertProduct, lockProducts, recordProductCreate } from "./products";
import { type Created, addSubtype, lockSubtypes, recordSubtypeCreate } from "./subtypes";

// The Excel import of products with their subtypes and of departments (04-catalogs.md rule 7:
// "saves nothing unless every row is valid"; build-plan 1.10: "saving only when every row is valid,
// in one transaction"), under catalog.manage (Head only, global; 03 Permission matrix, "Manage
// catalogs, users, branches, settings"); and of new prices (build-plan 1.11), under price.add (see
// importPrices below).
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

/** The input every import takes; the stock import adds its branch (plan of 5.9). */
export const importBaseInput = z.object({
  clientKey: z.string().refine(isClientKey),
  fileName: z
    .string()
    .transform((name) => name.trim())
    .refine((name) => Array.from(name).length >= 1 && Array.from(name).length <= 255),
  sheet: sheetInput,
});

type Context = z.core.$RefinementCtx;

/** Each error as an issue that names its kind (src/server/action-input.ts). */
export function addImportErrors(context: Context, errors: readonly ImportError[], input: unknown) {
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
  kind: ImportKind,
  read: (sheet: ImportSheet) => { entries: Entry[]; errors: ImportError[] },
) {
  return importBaseInput.transform((input, context) => {
    if (!headerMatches(input.sheet.header, everyImportTitles(kind))) {
      addImportErrors(context, [{ row: 0, column: "file", kind: "notTemplate" }], input);
      return z.NEVER;
    }
    const { entries, errors } = read(input.sheet as ImportSheet);
    if (errors.length > 0) {
      addImportErrors(context, errors, input);
      return z.NEVER;
    }
    return { clientKey: input.clientKey, fileName: input.fileName, entries };
  });
}

/** The check's errors as the wrapper's field errors. */
export function refusedImport(errors: readonly ImportError[]): ActionError {
  const fields: Record<string, FieldMessageKey> = {};
  for (const error of errors) {
    const key = importErrorKey(error);
    fields[key] ??= `errors.field.${error.kind}`;
  }
  return new ActionError("invalid_input", fields);
}

/**
 * What a saved import gives back: its record and how many rows it had; a stock import also the
 * numbers of its direct entries (plan of 5.9, decided item 9).
 */
export type SavedImport = { importId: string; rows: number; numbers?: string[] };

type Written<Entry> = SavedImport & { written: Entry[] };

/** The first import of a client key, given back to its maker only (developer-rules.md rule 8). */
// The key is unique across kinds: the same key sent with the other kind finds this first result
// too, rather than failing at the insert after every row was written (spec review, nit 2).
function findImport<Entry>() {
  return async (tx: Executor, clientKey: string): Promise<FirstResult<Written<Entry>> | null> => {
    const [row] = await tx
      .select({
        id: catalogImports.id,
        rows: catalogImports.rowCount,
        userId: catalogImports.createdBy,
        branchId: catalogImports.branchId,
      })
      .from(catalogImports)
      .where(eq(catalogImports.clientKey, clientKey));
    if (!row) return null;
    // A stock import's key has its branch, so the wrapper refuses it here (permission review of
    // 5.9, should fix 1).
    return {
      result: { importId: row.id, rows: row.rows, written: [] },
      userId: row.userId,
      branchId: row.branchId,
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
    find: findImport<WrittenProduct>(),
  },
  async write({ tx, input, userId }): Promise<Written<WrittenProduct>> {
    // The products' lock, then the subtypes', as every write of those tables takes them.
    await lockProducts(tx);
    await lockSubtypes(tx);
    const { errors, refs } = await checkProductImport(tx, input.entries, { lock: true });
    if (errors.length > 0) throw refusedImport(errors);
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
    find: findImport<WrittenDepartment>(),
  },
  async write({ tx, input, userId }): Promise<Written<WrittenDepartment>> {
    await lockDepartments(tx);
    const { errors, branchIds } = await checkDepartmentImport(tx, input.entries, { lock: true });
    if (errors.length > 0) throw refusedImport(errors);
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

/** A new price written, with what its audit row needs (review of the plan of 1.11, correction 3). */
type WrittenPrice = {
  variantId: string;
  productId: string;
  product: string;
  before: bigint | null;
  price: bigint;
  note: string;
};

// New prices of many subtypes at once (04-catalogs.md rule 4: "New prices for many products can be
// loaded at once from Excel"; build-plan 1.11). Under price.add, the matrix row "Add a new price for
// a product" (Head only, global; plan of 1.11, decision 4, Look first). Each row is a price added by
// hand: the subtype's `reference_price`, its HEAD row with the row's note and the Head as `set_by`,
// and the `price.add` audit row, through the same setHeadPrice() and recordPriceAdd() as addPrice
// (decision 1, Look first). The same price again, and an inactive product or subtype, are recorded
// as by hand (decision 3). Every subtype is resolved and locked FOR UPDATE, in the order of its id,
// by one query (check.ts; decision 5); a row it cannot resolve is that row's field error, never a
// bare refusal (review of the plan, correction 1), and any error saves nothing (04 rule 7).
export const importPrices = defineAction({
  name: "importPrices",
  permission: "price.add",
  input: importInput("prices", (sheet) => {
    const { prices, errors } = readPriceRows(sheet);
    return { entries: prices as ImportedPrice[], errors };
  }),
  async target() {
    return GLOBAL_TARGET;
  },
  repeat: {
    clientKey: (input) => input.clientKey,
    find: findImport<WrittenPrice>(),
  },
  async write({ tx, input, userId }): Promise<Written<WrittenPrice>> {
    const { errors, targets } = await checkPriceImport(tx, input.entries, { lock: true });
    if (errors.length > 0) throw refusedImport(errors);
    const written: WrittenPrice[] = [];
    for (const [at, entry] of input.entries.entries()) {
      const target = targets[at]!;
      await setHeadPrice(tx, userId, {
        variantId: target.variantId,
        price: entry.price,
        note: entry.note,
        clientKey: null,
      });
      written.push({
        variantId: target.variantId,
        productId: target.productId,
        product: target.product,
        before: target.referencePrice,
        price: entry.price,
        note: entry.note,
      });
    }
    const [record] = await tx
      .insert(catalogImports)
      .values({
        kind: "PRICES",
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
    for (const price of written) await recordPriceAdd(tx, userId, price);
  },
});
