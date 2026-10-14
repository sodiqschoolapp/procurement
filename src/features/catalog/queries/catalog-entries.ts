import { and, asc, count, desc, eq, inArray, ilike, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import * as z from "zod";

import {
  CATALOG_CHOICES_MAX,
  CATALOG_KINDS,
  CATALOG_PAGE_SIZE,
  type CatalogKind,
  type CompanyKind,
  companyKindsFor,
} from "@/domain/catalogs";
import { authorize } from "@/server/authorize";
import { categories, companies, extraCostTypes, units } from "@/server/db/schema";

// The four small catalogs, read (build-plan 1.5; 04-catalogs.md rules 2 and 3). The Head's list
// and one entry are under "Manage catalogs, users, branches, settings": catalog.manage, Head only
// (03). The picker is under catalog.pick, every role (plan of 1.5, decision 2, Look first), and
// lists active entries only: "Inactive entries leave the pickers but stay visible in old records"
// (04 rule 2). No branch filter: a catalog is one list for the whole school.

export type CatalogEntry = { id: string; name: string; isActive: boolean } & Record<
  string,
  string | boolean | null
>;

export type CatalogPage = {
  rows: CatalogEntry[];
  page: number;
  pages: number;
  /** Every entry of the catalog, not only the search's. */
  active: number;
  inactive: number;
  /** How many match the search (all when there is none). */
  found: number;
};

export type CatalogChoice = { id: string; name: string } & Record<string, string | boolean | null>;

type Source = {
  table: typeof units | typeof categories | typeof extraCostTypes | typeof companies;
  id: AnyPgColumn;
  name: AnyPgColumn;
  isActive: AnyPgColumn;
  /** Every field the list and the form show, by its key in CATALOGS. */
  columns: Record<string, AnyPgColumn>;
  /** The fields a search reads besides the name (plan of 1.5, decision 13). */
  searched: AnyPgColumn[];
  /** What a picker shows besides the name. */
  choice: Record<string, AnyPgColumn>;
};

const SOURCES: Record<CatalogKind, Source> = {
  measures: {
    table: units,
    id: units.id,
    name: units.name,
    isActive: units.isActive,
    columns: { name: units.name, shortName: units.shortName, allowDecimal: units.allowDecimal },
    searched: [units.shortName],
    choice: { shortName: units.shortName, allowDecimal: units.allowDecimal },
  },
  categories: {
    table: categories,
    id: categories.id,
    name: categories.name,
    isActive: categories.isActive,
    columns: { name: categories.name },
    searched: [],
    choice: {},
  },
  "extra-costs": {
    table: extraCostTypes,
    id: extraCostTypes.id,
    name: extraCostTypes.name,
    isActive: extraCostTypes.isActive,
    columns: { name: extraCostTypes.name },
    searched: [],
    choice: {},
  },
  companies: {
    table: companies,
    id: companies.id,
    name: companies.name,
    isActive: companies.isActive,
    columns: {
      name: companies.name,
      kind: companies.kind,
      taxId: companies.taxId,
      phone: companies.phone,
      note: companies.note,
    },
    searched: [companies.taxId, companies.phone],
    choice: { kind: companies.kind },
  },
};

const kindInput = z.enum(CATALOG_KINDS);
const searchInput = z.string().trim().max(200).catch("");

/** `%`, `_` and `\` typed by a person are matched as themselves. */
function containing(text: string): string {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

function matching(source: Source, q: string): SQL | undefined {
  if (q === "") return undefined;
  const pattern = containing(q);
  return or(...[source.name, ...source.searched].map((column) => ilike(column, pattern)));
}

/**
 * One page of a catalog for the Head: active and inactive, active first, then by name; `q` finds
 * part of the name (and of the short name, tax ID or phone), any case. A page past the last gives
 * the last.
 */
export async function listCatalogEntries(
  userId: string,
  kind: CatalogKind,
  options: { page?: number; q?: string } = {},
): Promise<CatalogPage> {
  await authorize(userId, "catalog.manage");
  const source = SOURCES[kindInput.parse(kind)];
  const q = searchInput.parse(options.q ?? "");
  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  const { db } = await import("@/server/db/client");
  const where = matching(source, q);
  const [totals] = await db
    .select({
      active: sql<number>`count(*) filter (where ${source.isActive})::int`,
      all: count(),
      found: where ? sql<number>`count(*) filter (where ${where})::int` : count(),
    })
    .from(source.table);
  const active = totals?.active ?? 0;
  const all = totals?.all ?? 0;
  const found = totals?.found ?? 0;
  const pages = Math.max(1, Math.ceil(found / CATALOG_PAGE_SIZE));
  const asked = Number.isInteger(options.page) && options.page! >= 1 ? options.page! : 1;
  const page = Math.min(asked, pages);
  const rows = await db
    .select({ id: source.id, ...source.columns, isActive: source.isActive })
    .from(source.table)
    .where(where)
    .orderBy(desc(source.isActive), asc(source.name), asc(source.id))
    .limit(CATALOG_PAGE_SIZE)
    .offset((page - 1) * CATALOG_PAGE_SIZE);
  return {
    rows: rows as unknown as CatalogEntry[],
    page,
    pages,
    active,
    inactive: all - active,
    found,
  };
}

/** One entry, or `null` for an id that is unknown or not an id at all (the page: "not found"). */
export async function getCatalogEntry(
  userId: string,
  kind: CatalogKind,
  id: string,
): Promise<CatalogEntry | null> {
  await authorize(userId, "catalog.manage");
  const source = SOURCES[kindInput.parse(kind)];
  if (!z.uuid().safeParse(id).success) return null;
  const { db } = await import("@/server/db/client");
  const [row] = await db
    .select({ id: source.id, ...source.columns, isActive: source.isActive })
    .from(source.table)
    .where(eq(source.id, id));
  return (row as CatalogEntry | undefined) ?? null;
}

/** The active entries of each catalog, for the list of catalogs on /catalog (plan review, correction 2). */
export async function countActiveCatalogEntries(
  userId: string,
): Promise<Record<CatalogKind, number>> {
  await authorize(userId, "catalog.manage");
  const { db } = await import("@/server/db/client");
  const counted = await Promise.all(
    CATALOG_KINDS.map(async (kind) => {
      const source = SOURCES[kind];
      const [row] = await db
        .select({ active: count() })
        .from(source.table)
        .where(eq(source.isActive, true));
      return [kind, row?.active ?? 0] as const;
    }),
  );
  return Object.fromEntries(counted) as Record<CatalogKind, number>;
}

/**
 * A picker's entries: active only (04 rule 2), by name, at most 50, narrowed by `q`. For companies
 * `companyKind` asks for brands (BRAND and BOTH) or suppliers (SUPPLIER and BOTH).
 */
export async function listCatalogChoices(
  userId: string,
  kind: CatalogKind,
  options: { q?: string; companyKind?: Exclude<CompanyKind, "BOTH"> } = {},
): Promise<CatalogChoice[]> {
  await authorize(userId, "catalog.pick");
  const parsedKind = kindInput.parse(kind);
  const source = SOURCES[parsedKind];
  const q = searchInput.parse(options.q ?? "");
  const use = z.enum(["BRAND", "SUPPLIER"]).optional().parse(options.companyKind);
  const { db } = await import("@/server/db/client");
  const rows = await db
    .select({ id: source.id, name: source.name, ...source.choice })
    .from(source.table)
    .where(
      and(
        eq(source.isActive, true),
        matching(source, q),
        parsedKind === "companies" && use
          ? inArray(companies.kind, companyKindsFor(use))
          : undefined,
      ),
    )
    .orderBy(asc(source.name), asc(source.id))
    .limit(CATALOG_CHOICES_MAX);
  return rows as CatalogChoice[];
}
