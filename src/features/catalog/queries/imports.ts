import {
  IMPORT_COLUMNS,
  IMPORT_PERMISSIONS,
  type ImportCell,
  type ImportError,
  type ImportKind,
  type ImportSheet,
  headerMatches,
  readDepartmentRows,
  readPriceRows,
  readProductRows,
  readStockRows,
} from "@/domain/imports";
import { PERMISSIONS } from "@/domain/permissions";
import { checkStockImport } from "@/features/warehouse/imports/check";
import { authorize, authorizeList } from "@/server/authorize";
import { db } from "@/server/db/client";

import { checkDepartmentImport, checkPriceImport, checkProductImport } from "../imports/check";
import { PRODUCT_TYPE_WORDS, everyImportTitles } from "../imports/titles";

// The preview of an Excel import (04-catalogs.md rule 7: "The import shows a preview with errors
// per row"; build-plans 1.10 and 1.11). Under the kind's permission: catalog.manage for products
// and departments, price.add for prices (Head only; 03 Permission matrix; plan of 1.11, decision 4,
// Look first). It reads the rows with the same domain functions and checks them against the
// catalog with the same queries as the save, without locks, and writes nothing. The save checks
// everything again (plan of 1.10, decision 5): the preview is advice, the save the gate. Existing
// stock (plan of 5.9) is one branch's: its preview is asked of that branch, under
// stock.enter_direct, the permission of its save.

/**
 * Whether the user may open an import of this kind at all, for its page and its template: a
 * global permission by authorize(), a branch one (stock) by authorizeList(), since the page names
 * no branch yet (plan of 5.9). Throws AuthorizationError otherwise.
 */
export async function authorizeImportKind(userId: string, kind: ImportKind): Promise<void> {
  const permission = IMPORT_PERMISSIONS[kind];
  if (PERMISSIONS[permission].scope === "branch") await authorizeList(userId, permission);
  else await authorize(userId, permission);
}

/** A row as the preview shows it: its number and each column's text as typed. */
export type PreviewRow = { row: number; texts: string[] };

export type ImportPreview = {
  kind: ImportKind;
  rows: PreviewRow[];
  /** Every error, the file's first, then by row and column. */
  errors: ImportError[];
};

function shown(cell: ImportCell | undefined): string {
  if (!cell) return "";
  if (cell.kind === "text") return cell.text.trim();
  if (cell.kind === "number") return String(cell.value);
  return "";
}

/** The preview of one sheet for the Head; a stock import names its branch. */
export async function previewImport(
  userId: string,
  kind: ImportKind,
  sheet: ImportSheet,
  branchId?: string,
): Promise<ImportPreview> {
  if (kind === "stock") {
    if (!branchId) throw new RangeError("A stock import names its branch.");
    await authorize(userId, IMPORT_PERMISSIONS.stock, { branchId });
  } else {
    await authorize(userId, IMPORT_PERMISSIONS[kind]);
  }
  const width = IMPORT_COLUMNS[kind].length;
  const rows = sheet.rows
    .map((row) => ({
      row: row.row,
      texts: Array.from({ length: width }, (_, at) => shown(row.cells[at])),
    }))
    .filter((row) => row.texts.some((text) => text !== ""));
  if (!headerMatches(sheet.header, everyImportTitles(kind))) {
    return { kind, rows: [], errors: [{ row: 0, column: "file", kind: "notTemplate" }] };
  }

  if (kind === "products") {
    const read = readProductRows(sheet, PRODUCT_TYPE_WORDS);
    if (read.errors.some((error) => error.column === "file")) {
      return { kind, rows: [], errors: read.errors };
    }
    const checked = await checkProductImport(db, read.products, { lock: false });
    return { kind, rows, errors: ordered([...read.errors, ...checked.errors], kind) };
  }
  if (kind === "stock") {
    const read = readStockRows(sheet);
    if (read.errors.some((error) => error.column === "file")) {
      return { kind, rows: [], errors: read.errors };
    }
    const checked = await checkStockImport(db, read.named, { lock: false });
    // A cell the reader refused is not reported twice by the line rules.
    const known = new Set(read.errors.map((error) => `${error.row}:${error.column}`));
    const more = checked.errors.filter((error) => !known.has(`${error.row}:${error.column}`));
    return { kind, rows, errors: ordered([...read.errors, ...more], kind) };
  }
  if (kind === "prices") {
    const read = readPriceRows(sheet);
    if (read.errors.some((error) => error.column === "file")) {
      return { kind, rows: [], errors: read.errors };
    }
    const checked = await checkPriceImport(db, read.named, { lock: false });
    return { kind, rows, errors: ordered([...read.errors, ...checked.errors], kind) };
  }
  const read = readDepartmentRows(sheet);
  if (read.errors.some((error) => error.column === "file")) {
    return { kind, rows: [], errors: read.errors };
  }
  const checked = await checkDepartmentImport(db, read.departments, { lock: false });
  return { kind, rows, errors: ordered([...read.errors, ...checked.errors], kind) };
}

function ordered(errors: ImportError[], kind: ImportKind): ImportError[] {
  const columns = IMPORT_COLUMNS[kind] as readonly string[];
  return [...errors].sort(
    (a, b) => a.row - b.row || columns.indexOf(a.column) - columns.indexOf(b.column),
  );
}
