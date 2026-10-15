import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import * as z from "zod";

import { CATALOG_PAGE_SIZE } from "@/domain/catalogs";
import type { PriceSource } from "@/domain/prices";
import { authorize } from "@/server/authorize";
import { priceHistory, productVariants, products, users } from "@/server/db/schema";

// Prices, read (build-plan 1.9: "a price-history view per subtype; under Admin, a Prices list of
// every subtype with its current price"; 04-catalogs.md rule 4; A14). Under "Manage catalogs,
// users, branches, settings": catalog.manage, Head only, as every Admin page (03; plan of 1.9,
// decision 4, Look first). No branch filter: one price per subtype for the whole school. The
// current price is `product_variants.reference_price`, which the deferred check `price_recorded`
// of migration 0014 keeps equal to the newest HEAD row; "set on" and "set by" are that row's.
// Inactive subtypes and products stay in the list, marked (decision 12; 04 rule 2).
// From 3.2 the history also holds PURCHASE rows, which come from one branch's purchases. Before
// getPriceHistory is given to a role other than the Head, or shown on a screen such a role can
// reach, it needs branchFilter() on those rows: otherwise one branch's purchases would show to
// another (developer-rules.md rule 4; permission review of 1.9).

export type PriceRow = {
  variantId: string;
  productId: string;
  productName: string;
  /** null for the hidden default of a product without subtypes: shown as its product alone. */
  subtypeName: string | null;
  referencePrice: bigint | null;
  /** The product and the subtype are both active. */
  isActive: boolean;
  setAt: Date | null;
  setByName: string | null;
};

export type PricePage = { rows: PriceRow[]; page: number; pages: number; found: number };

export type PriceHistoryRow = {
  id: string;
  price: bigint;
  source: PriceSource;
  note: string | null;
  setByName: string;
  createdAt: Date;
};

export type PriceHistory = {
  variantId: string;
  productId: string;
  productName: string;
  subtypeName: string | null;
  isActive: boolean;
  referencePrice: bigint | null;
  rows: PriceHistoryRow[];
  page: number;
  pages: number;
};

const searchInput = z.string().trim().max(200).catch("");
const isId = (value: string) => z.uuid().safeParse(value).success;

/** `%`, `_` and `\` typed by a person are matched as themselves (as 1.5, decision 13). */
function containing(text: string): string {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

function pageOf(asked: number | undefined, found: number) {
  const pages = Math.max(1, Math.ceil(found / CATALOG_PAGE_SIZE));
  const wanted = Number.isInteger(asked) && asked! >= 1 ? asked! : 1;
  return { page: Math.min(wanted, pages), pages };
}

const isActive = sql<boolean>`(${products.isActive} and ${productVariants.isActive})`;

/** The newest HEAD row of the subtype, by `seq` (plan review of 1.9, Must fix 1). */
const newest = (column: unknown) => sql`(select ${column} from ${priceHistory}
  join ${users} on ${users.id} = ${priceHistory.setBy}
  where ${priceHistory.variantId} = ${productVariants.id} and ${priceHistory.source} = 'HEAD'
  order by ${priceHistory.seq} desc limit 1)`;

/**
 * One page of every subtype with its current price: active first, then by product and subtype
 * name. `q` finds part of the product's or a real subtype's name, any case. A page past the last
 * gives the last.
 */
export async function listPrices(
  userId: string,
  options: { page?: number; q?: string } = {},
): Promise<PricePage> {
  await authorize(userId, "catalog.manage");
  const q = searchInput.parse(options.q ?? "");
  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  const { db } = await import("@/server/db/client");
  const where =
    q === ""
      ? undefined
      : or(
          ilike(products.name, containing(q)),
          and(eq(productVariants.isDefault, false), ilike(productVariants.name, containing(q))),
        );
  const [totals] = await db
    .select({ found: count() })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(where);
  const found = totals?.found ?? 0;
  const { page, pages } = pageOf(options.page, found);
  const rows = await db
    .select({
      variantId: productVariants.id,
      productId: products.id,
      productName: products.name,
      subtypeName: sql<
        string | null
      >`case when ${productVariants.isDefault} then null else ${productVariants.name} end`,
      referencePrice: productVariants.referencePrice,
      isActive,
      setAt: newest(priceHistory.createdAt).mapWith(priceHistory.createdAt),
      setByName: newest(users.fullName).mapWith(String),
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(where)
    .orderBy(desc(isActive), asc(products.name), asc(productVariants.name), asc(productVariants.id))
    .limit(CATALOG_PAGE_SIZE)
    .offset((page - 1) * CATALOG_PAGE_SIZE);
  return { rows, page, pages, found };
}

/**
 * One subtype (the hidden default included) with its current price and one page of its price
 * history, newest first, with the name of who set each; `null` for an unknown id or one that is
 * not an id (the page: "not found").
 */
export async function getPriceHistory(
  userId: string,
  variantId: string,
  options: { page?: number } = {},
): Promise<PriceHistory | null> {
  await authorize(userId, "catalog.manage");
  if (!isId(variantId)) return null;
  const { db } = await import("@/server/db/client");
  const [subtype] = await db
    .select({
      variantId: productVariants.id,
      productId: products.id,
      productName: products.name,
      subtypeName: sql<
        string | null
      >`case when ${productVariants.isDefault} then null else ${productVariants.name} end`,
      isActive,
      referencePrice: productVariants.referencePrice,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(productVariants.id, variantId));
  if (!subtype) return null;
  const [totals] = await db
    .select({ found: count() })
    .from(priceHistory)
    .where(eq(priceHistory.variantId, variantId));
  const { page, pages } = pageOf(options.page, totals?.found ?? 0);
  const rows = await db
    .select({
      id: priceHistory.id,
      price: priceHistory.price,
      source: priceHistory.source,
      note: priceHistory.note,
      setByName: users.fullName,
      createdAt: priceHistory.createdAt,
    })
    .from(priceHistory)
    .innerJoin(users, eq(users.id, priceHistory.setBy))
    .where(eq(priceHistory.variantId, variantId))
    .orderBy(desc(priceHistory.seq))
    .limit(CATALOG_PAGE_SIZE)
    .offset((page - 1) * CATALOG_PAGE_SIZE);
  return { ...subtype, rows, page, pages };
}
