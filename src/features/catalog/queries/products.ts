import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import * as z from "zod";

import { CATALOG_PAGE_SIZE } from "@/domain/catalogs";
import { PRODUCT_TYPES, type ProductType } from "@/domain/products";
import { authorize } from "@/server/authorize";
import { categories, companies, products, units } from "@/server/db/schema";

import { productInUse } from "../actions/product-uses";

// Products and services, read (build-plan 1.7; 04-catalogs.md rules 2 and 3). The Head's list,
// one product and the choices of its form are under "Manage catalogs, users, branches, settings":
// catalog.manage, Head only (03). No branch filter: a catalog is one list for the whole school.
// Inactive products stay in the list (04 rule 2). The product picker of a request line comes with
// the task that needs it (plan of 1.7, Left out).

export type ProductRow = {
  id: string;
  name: string;
  type: ProductType;
  categoryId: string;
  categoryName: string;
  unitId: string;
  unitName: string;
  unitShortName: string;
  photoFileId: string | null;
  referencePrice: bigint | null;
  isActive: boolean;
};

export type ProductPage = {
  rows: ProductRow[];
  page: number;
  pages: number;
  /** Every product, not only the filter's. */
  active: number;
  inactive: number;
  /** How many match the search and the filters (all when there are none). */
  found: number;
};

export type ProductDetail = ProductRow & {
  categoryActive: boolean;
  unitActive: boolean;
  defaultCompanyId: string | null;
  defaultCompanyName: string | null;
  defaultCompanyActive: boolean | null;
  description: string | null;
  /** Type and measure are locked (04 Catalogs table; plan of 1.7, decision 1). */
  inUse: boolean;
};

export type Choice = { id: string; name: string; isActive: boolean };

export type ProductChoices = {
  categories: Choice[];
  units: (Choice & { shortName: string })[];
  companies: Choice[];
};

const searchInput = z.string().trim().max(200).catch("");
const categoryInput = z.uuid().nullable().catch(null);
const typeInput = z.enum(PRODUCT_TYPES).nullable().catch(null);

const columns = {
  id: products.id,
  name: products.name,
  type: products.type,
  categoryId: products.categoryId,
  categoryName: categories.name,
  unitId: products.unitId,
  unitName: units.name,
  unitShortName: units.shortName,
  photoFileId: products.photoFileId,
  referencePrice: products.referencePrice,
  isActive: products.isActive,
};

/** `%`, `_` and `\` typed by a person are matched as themselves (as 1.5, decision 13). */
function containing(text: string): string {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/**
 * One page of products for the Head: active first, then by name (plan of 1.7, decision 12). `q`
 * finds part of the name, any case; `categoryId` and `type` narrow it. A page past the last gives
 * the last; a filter that is not a category id or a type is ignored.
 */
export async function listProducts(
  userId: string,
  options: { page?: number; q?: string; categoryId?: string | null; type?: string | null } = {},
): Promise<ProductPage> {
  await authorize(userId, "catalog.manage");
  const q = searchInput.parse(options.q ?? "");
  const categoryId = categoryInput.parse(options.categoryId ?? null);
  const type = typeInput.parse(options.type ?? null);
  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  const { db } = await import("@/server/db/client");
  const where = and(
    q === "" ? undefined : ilike(products.name, containing(q)),
    categoryId ? eq(products.categoryId, categoryId) : undefined,
    type ? eq(products.type, type) : undefined,
  );
  const [totals] = await db
    .select({
      active: sql<number>`count(*) filter (where ${products.isActive})::int`,
      all: count(),
      found: where ? sql<number>`count(*) filter (where ${where})::int` : count(),
    })
    .from(products);
  const active = totals?.active ?? 0;
  const all = totals?.all ?? 0;
  const found = totals?.found ?? 0;
  const pages = Math.max(1, Math.ceil(found / CATALOG_PAGE_SIZE));
  const asked = Number.isInteger(options.page) && options.page! >= 1 ? options.page! : 1;
  const page = Math.min(asked, pages);
  const rows = await db
    .select(columns)
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .innerJoin(units, eq(units.id, products.unitId))
    .where(where)
    .orderBy(desc(products.isActive), asc(products.name), asc(products.id))
    .limit(CATALOG_PAGE_SIZE)
    .offset((page - 1) * CATALOG_PAGE_SIZE);
  return { rows, page, pages, active, inactive: all - active, found };
}

/** One product, or `null` for an id that is unknown or not an id at all (the page: "not found"). */
export async function getProduct(userId: string, id: string): Promise<ProductDetail | null> {
  await authorize(userId, "catalog.manage");
  if (!z.uuid().safeParse(id).success) return null;
  const { db } = await import("@/server/db/client");
  const [row] = await db
    .select({
      ...columns,
      categoryActive: categories.isActive,
      unitActive: units.isActive,
      defaultCompanyId: products.defaultCompanyId,
      defaultCompanyName: companies.name,
      defaultCompanyActive: companies.isActive,
      description: products.description,
    })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .innerJoin(units, eq(units.id, products.unitId))
    .leftJoin(companies, eq(companies.id, products.defaultCompanyId))
    .where(eq(products.id, id));
  return row ? { ...row, inUse: await productInUse(db, row.id) } : null;
}

/**
 * What the product form offers: every active category, measure and company by name, and the
 * product's own current ones when they are inactive (shown, not offered anew; 04 rule 2). The
 * picker of 1.5 gives at most 50 entries; a select of the Head's form needs them all.
 */
export async function listProductChoices(
  userId: string,
  current: { categoryId?: string; unitId?: string; defaultCompanyId?: string | null } = {},
): Promise<ProductChoices> {
  await authorize(userId, "catalog.manage");
  const { db } = await import("@/server/db/client");
  const shown = (table: typeof categories | typeof units | typeof companies, id?: string | null) =>
    id && z.uuid().safeParse(id).success
      ? or(eq(table.isActive, true), eq(table.id, id))
      : eq(table.isActive, true);
  const [categoryRows, unitRows, companyRows] = await Promise.all([
    db
      .select({ id: categories.id, name: categories.name, isActive: categories.isActive })
      .from(categories)
      .where(shown(categories, current.categoryId))
      .orderBy(asc(categories.name), asc(categories.id)),
    db
      .select({
        id: units.id,
        name: units.name,
        isActive: units.isActive,
        shortName: units.shortName,
      })
      .from(units)
      .where(shown(units, current.unitId))
      .orderBy(asc(units.name), asc(units.id)),
    db
      .select({ id: companies.id, name: companies.name, isActive: companies.isActive })
      .from(companies)
      .where(shown(companies, current.defaultCompanyId))
      .orderBy(asc(companies.name), asc(companies.id)),
  ]);
  return { categories: categoryRows, units: unitRows, companies: companyRows };
}

/**
 * The category filter of the list: every category, inactive ones too, so old products can still
 * be found (plan of 1.7, decision 12; plan review, Should fix 10).
 */
export async function listCategoryFilter(userId: string): Promise<Choice[]> {
  await authorize(userId, "catalog.manage");
  const { db } = await import("@/server/db/client");
  return db
    .select({ id: categories.id, name: categories.name, isActive: categories.isActive })
    .from(categories)
    .orderBy(desc(categories.isActive), asc(categories.name), asc(categories.id));
}
