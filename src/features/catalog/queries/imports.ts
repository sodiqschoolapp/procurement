import {
  IMPORT_COLUMNS,
  type ImportCell,
  type ImportError,
  type ImportKind,
  type ImportSheet,
  headerMatches,
  readDepartmentRows,
  readProductRows,
} from "@/domain/imports";
import { authorize } from "@/server/authorize";
import { db } from "@/server/db/client";

import { checkDepartmentImport, checkProductImport } from "../imports/check";
import { PRODUCT_TYPE_WORDS, everyImportTitles } from "../imports/titles";

// The preview of an Excel import (04-catalogs.md rule 7: "The import shows a preview with errors
// per row"; build-plan 1.10). Under catalog.manage (Head only; 03, "Manage catalogs …"). It reads
// the rows with the same domain functions and checks them against the catalog with the same
// queries as the save, without locks, and writes nothing. The save checks everything again (plan
// of 1.10, decision 5): the preview is advice, the save the gate.

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

/** The preview of one sheet for the Head. */
export async function previewImport(
  userId: string,
  kind: ImportKind,
  sheet: ImportSheet,
): Promise<ImportPreview> {
  await authorize(userId, "catalog.manage");
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
