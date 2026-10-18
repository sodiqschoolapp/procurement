import { asc, eq, sql } from "drizzle-orm";
import * as z from "zod";

import { businessDate } from "@/domain/business-date";
import { type ImportedStock, headerMatches, readStockRows } from "@/domain/imports";
import { DOCUMENT_LINES_MAX } from "@/domain/stock-documents";
import {
  type SavedImport,
  addImportErrors,
  importBaseInput,
  refusedImport,
} from "@/features/catalog/actions/imports";
import { everyImportTitles } from "@/features/catalog/imports/titles";
import { defineAction } from "@/server/action";
import { now } from "@/server/clock";
import { catalogImports, stockDocuments } from "@/server/db/schema";
import { createDocument } from "@/server/stock-documents";

import { type StockImportLine, checkStockImport } from "../imports/check";
import { type RecordedDirectEntry, lockDirectEntryBranch, recordDirectEntry } from "./direct-entry";

// Existing stock from an Excel file (09-warehouse.md, Direct entry by the Head 1: "Many items are
// imported from an Excel template, with the same preview and error check as catalog imports";
// 04-catalogs.md rule 7: "saves nothing unless every row is valid"; build-plan 5.9). Under
// `stock.enter_direct` on the branch the page names (the Head only, any branch; 03 Permission
// matrix; plan of 5.9, decided item 2, Look first: one file is one branch). The write:
//
//   1  the branch FOR SHARE and active (lockDirectEntryBranch() of ./direct-entry.ts)
//   2  checkStockImport() with `lock`: the products, then the subtypes FOR SHARE in the order of
//      their ids, every row checked by the direct-entry line rules, its cost typed or the
//      subtype's reference price (decided item 1, Look first); any error saves nothing
//   3  the `catalog_imports` row with the import's client key and branch, which answers a repeat
//      (developer-rules.md rule 8; review of the plan, must fix 1)
//   4  the lines in the order of their subtype ids, cut into documents of DOCUMENT_LINES_MAX
//      (decided item 4), so every balance of the file is locked in one ascending order (review
//      of the plan, should fix 1); each document a POSTED DIRECT_ENTRY by createDocument(), with
//      the reason EXISTING_STOCK and today's date (decided item 3), a client key of its own made
//      here (decided item 5) and the import's id, which a repeat reads its numbers back by
//      (must fix 2)
//
// The lock order of enterStockDirectly: branch, products, subtypes, then the ENT counter and the
// balances inside createDocument(). The history step writes each document's `direct_entry.create`
// audit row, as one typed in the form (09 Direct entry 2).

const input = importBaseInput.extend({ branchId: z.uuid() }).transform((typed, context) => {
  if (!headerMatches(typed.sheet.header, everyImportTitles("stock"))) {
    addImportErrors(context, [{ row: 0, column: "file", kind: "notTemplate" }], typed);
    return z.NEVER;
  }
  const { stock, errors } = readStockRows(typed.sheet);
  if (errors.length > 0) {
    addImportErrors(context, errors, typed);
    return z.NEVER;
  }
  return {
    clientKey: typed.clientKey,
    fileName: typed.fileName,
    branchId: typed.branchId,
    entries: stock as ImportedStock[],
  };
});

/** A saved stock import: its record, its rows and the numbers of its direct entries. */
export type SavedStockImport = SavedImport & { numbers: string[] };

type Written = SavedStockImport & { entries: RecordedDirectEntry[] };

/** The lines of a file in documents of at most DOCUMENT_LINES_MAX, in the order of subtype ids. */
function documentsOf(lines: readonly StockImportLine[]): StockImportLine[][] {
  const sorted = [...lines].sort((a, b) =>
    a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0,
  );
  const documents: StockImportLine[][] = [];
  for (let at = 0; at < sorted.length; at += DOCUMENT_LINES_MAX) {
    documents.push(sorted.slice(at, at + DOCUMENT_LINES_MAX));
  }
  return documents;
}

export const importStock = defineAction({
  name: "importStock",
  permission: "stock.enter_direct",
  input,
  // A create: the branch comes from the input and is authorized as such (decisions 0.7).
  async target({ input: typed }) {
    return { branchId: typed.branchId };
  },
  repeat: {
    clientKey: (typed) => typed.clientKey,
    async find(tx, clientKey) {
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
      const documents = await tx
        .select({ number: stockDocuments.number })
        .from(stockDocuments)
        .where(eq(stockDocuments.importId, row.id))
        // In the order they were made: the counter, which may grow past four digits.
        .orderBy(asc(sql`length(${stockDocuments.number})`), asc(stockDocuments.number));
      // The wrapper answers it only to its maker in its branch (developer-rules.md rule 8); the key
      // of a catalog import has no branch, so it is refused here too.
      return {
        result: {
          importId: row.id,
          rows: row.rows,
          numbers: documents.map((document) => document.number),
          entries: [],
        } satisfies Written,
        userId: row.userId,
        branchId: row.branchId,
      };
    },
  },
  async write({ tx, input: typed, userId }): Promise<Written> {
    await lockDirectEntryBranch(tx, typed.branchId);
    const { errors, lines } = await checkStockImport(tx, typed.entries, { lock: true });
    if (errors.length > 0) throw refusedImport(errors);
    const [record] = await tx
      .insert(catalogImports)
      .values({
        kind: "STOCK",
        fileName: typed.fileName,
        rowCount: lines.length,
        createdBy: userId,
        clientKey: typed.clientKey,
        branchId: typed.branchId,
        createdAt: now(),
      })
      .returning({ id: catalogImports.id });
    const docDate = businessDate(now());
    const entries: RecordedDirectEntry[] = [];
    for (const document of documentsOf(lines)) {
      const created = await createDocument(tx, {
        type: "DIRECT_ENTRY",
        branchId: typed.branchId,
        docDate,
        status: "POSTED",
        reason: "EXISTING_STOCK",
        comment: null,
        clientKey: crypto.randomUUID(),
        createdBy: userId,
        importId: record!.id,
        lines: document.map((line) => ({
          variantId: line.variantId,
          qty: line.qty,
          unitCost: line.cost,
        })),
      });
      entries.push({
        documentId: created.documentId,
        number: created.number,
        branchId: typed.branchId,
        docDate,
        reason: "EXISTING_STOCK",
        comment: null,
        lines: document.map((line) => ({
          variantId: line.variantId,
          qty: line.qty,
          unitCost: line.cost,
        })),
      });
    }
    return {
      importId: record!.id,
      rows: lines.length,
      numbers: entries.map((entry) => entry.number),
      entries,
    };
  },
  async history({ tx, userId }, { entries }) {
    for (const entry of entries) await recordDirectEntry(tx, userId, entry);
  },
});
