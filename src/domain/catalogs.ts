// The rules of the four small catalogs: measures, categories, extra cost types, companies and
// brands (04-catalogs.md, Catalogs table; rules 2, 3, 9; build-plan 1.5). Pure: the shared
// actions of src/features/catalog/actions/catalog-entries.ts and the shared form read them, and the
// database holds the unique names and the non-blank values as its last defence (14-data-model.md,
// units, categories, companies, extra_cost_types; migration 0010).

/** The four catalogs, by the segment of their address (plan of 1.5, decision 12). */
export const CATALOG_KINDS = ["measures", "categories", "extra-costs", "companies"] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];

export function isCatalogKind(value: unknown): value is CatalogKind {
  return typeof value === "string" && (CATALOG_KINDS as readonly string[]).includes(value);
}

/** "One list serves both the brand on a request and the supplier on a purchase" (04). */
export const COMPANY_KINDS = ["BRAND", "SUPPLIER", "BOTH"] as const;
export type CompanyKind = (typeof COMPANY_KINDS)[number];

export function isCompanyKind(value: unknown): value is CompanyKind {
  return typeof value === "string" && (COMPANY_KINDS as readonly string[]).includes(value);
}

/** The kinds a picker of brands or of suppliers lists: the one asked for, and BOTH. */
export function companyKindsFor(use: "BRAND" | "SUPPLIER"): CompanyKind[] {
  return [use, "BOTH"];
}

/** The longest values, counted by code point (plan of 1.5, "What will exist"). */
export const CATALOG_NAME_MAX = 120;
export const SHORT_NAME_MAX = 20;
export const NOTE_MAX = 1000;

/** "25 rows per page, loaded from the server" (11-screens-and-ux.md rule 8). */
export const CATALOG_PAGE_SIZE = 25;

/** The most entries a picker returns at once (plan of 1.5, decision 13). */
export const CATALOG_CHOICES_MAX = 50;

/**
 * A name as it is stored: trimmed, inner spaces collapsed to one (04 rule 3, "ignoring capital
 * letters and extra spaces"; the reading of 1.2 for branches). Uniqueness itself is compared in
 * the database, with the unique index's own expression.
 */
export function catalogName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function lengthOf(value: string): number {
  return Array.from(value).length;
}

function isStoredName(value: unknown, max: number): value is string {
  if (typeof value !== "string" || catalogName(value) !== value) return false;
  const length = lengthOf(value);
  return length >= 1 && length <= max;
}

/** A stored name: 1 to 120 code points, already in the form of catalogName(). */
export function isCatalogName(value: unknown): value is string {
  return isStoredName(value, CATALOG_NAME_MAX);
}

/** A measure's short name ("kg", "pcs"): 1 to 20 code points, in the form of catalogName(). */
export function isShortName(value: unknown): value is string {
  return isStoredName(value, SHORT_NAME_MAX);
}

/** A company's note: trimmed, 1 to 1000 code points (an empty note is stored as null). */
export function isNote(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value) return false;
  const length = lengthOf(value);
  return length >= 1 && length <= NOTE_MAX;
}

/**
 * A company's tax ID: 9 digits (a company's STIR) or 14 (a person's PINFL). Optional, not unique;
 * checked in the domain and the form only (plan of 1.5, decision 5).
 */
export function isTaxId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9]{9}([0-9]{5})?$/.test(value);
}

/** The fields of `sent` whose value differs from `current`, in the order of `fields`. */
export function changedCatalogFields<Fields extends Record<string, unknown>>(
  fields: readonly (keyof Fields & string)[],
  current: Fields,
  sent: Partial<Fields>,
): (keyof Fields & string)[] {
  return fields.filter((field) => sent[field] !== undefined && sent[field] !== current[field]);
}

/**
 * How a field is typed and shown: a one-line text, a short text, a yes/no box, the company kind,
 * or a long text. `optional`: may be left empty (stored as null).
 */
export type CatalogFieldType = "text" | "short" | "boolean" | "companyKind" | "long";
export type CatalogFieldKey =
  "name" | "shortName" | "allowDecimal" | "kind" | "taxId" | "phone" | "note";
export type CatalogField = { key: CatalogFieldKey; type: CatalogFieldType; optional?: boolean };

/**
 * The fields of each catalog, in the order of 04's Catalogs table, and its table: the audit
 * entity is the table's name (plan of 1.5, decision 10). One description serves the shared actions,
 * queries, form and list (build-plan 1.5: "one shared catalog component").
 */
export const CATALOGS = {
  measures: {
    entity: "units",
    fields: [
      { key: "name", type: "text" },
      { key: "shortName", type: "short" },
      { key: "allowDecimal", type: "boolean" },
    ],
  },
  categories: { entity: "categories", fields: [{ key: "name", type: "text" }] },
  "extra-costs": { entity: "extra_cost_types", fields: [{ key: "name", type: "text" }] },
  companies: {
    entity: "companies",
    fields: [
      { key: "name", type: "text" },
      { key: "kind", type: "companyKind" },
      { key: "taxId", type: "short", optional: true },
      { key: "phone", type: "short", optional: true },
      { key: "note", type: "long", optional: true },
    ],
  },
} as const satisfies Record<CatalogKind, { entity: string; fields: readonly CatalogField[] }>;
