import type { ImportCell, ImportKind, ImportSheet } from "@/domain/imports";
import { importTitles } from "@/features/catalog/imports/titles";
import type { Locale } from "@/i18n/locale";

// Sheets of a catalog import for tests (plan of 1.10): the template's header in one language, and
// rows from plain values, numbered from 2 as Excel shows them under the header.

export type Value = string | number | null | ImportCell;

function cellOf(value: Value): ImportCell {
  if (value === null || value === "") return { kind: "empty" };
  if (typeof value === "string") return { kind: "text", text: value };
  if (typeof value === "number") return { kind: "number", value };
  return value;
}

export function importSheet(
  kind: ImportKind,
  rows: readonly Value[][],
  locale: Locale = "en",
): ImportSheet {
  return {
    header: importTitles(kind, locale).map((title) => ({ kind: "text", text: title })),
    rows: rows.map((cells, at) => ({ row: at + 2, cells: cells.map(cellOf) })),
  };
}

/** A product row: name, type, category, measure, company, description, subtype, price. */
export function productRow(
  name: string,
  refs: { category: string; measure: string; company?: string },
  rest: { type?: string; description?: string; subtype?: string; price?: Value } = {},
): Value[] {
  return [
    name,
    rest.type ?? "",
    refs.category,
    refs.measure,
    refs.company ?? "",
    rest.description ?? "",
    rest.subtype ?? "",
    rest.price ?? null,
  ];
}
