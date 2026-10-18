import { and, asc, count, eq, ilike, or, sql } from "drizzle-orm";
import * as z from "zod";

import { addsDraftsIn } from "@/domain/drafts";
import { decide } from "@/domain/permissions";
import { STOCK_PAGE_SIZE, isLow, stockValue } from "@/domain/stock";
import { authorize, authorizeList, branchFilter } from "@/server/authorize";
import {
  branches,
  categories,
  productVariants,
  products,
  stockBalances,
  stockMinimums,
  units,
} from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";

// Stock on hand, /warehouse/stock (09-warehouse.md, Stock screens: Stock on hand; 11-screens-and-
// ux.md, Screens and rule 8; plan of 5.2). Under `data.view` with the branch inside the SQL (03
// matrix "See orders, stock and reports": Head all branches, Manager own branches, Principal own
// branch, Finance own branches; developer-rules.md rule 4). One row per branch and subtype with a
// balance row, at 0 too (decided items 3 and 4); services are never listed (09, Definitions
// "Stock"). Each row's value is stockValue() (decided item 1, Look first), never computed in SQL.
// Each row carries its minimum and isLow() (plan of 5.10); "Low stock only" filters in the SQL
// with the same "at or below" (paging needs it there; its test puts the boundary rows side by
// side, review of the plan, should fix 3), and each row says whether the user may set its minimum
// or add a draft of it; the server asks again.

export type StockRow = {
  branchId: string;
  branchCode: string;
  variantId: string;
  productName: string;
  /** The subtype's name; null for the hidden default subtype of a product without subtypes. */
  subtypeName: string | null;
  photoFileId: string | null;
  /** numeric(14,3) text as stored ("2.500"); the formatter drops the trailing zeros (11 rule 10). */
  quantity: string;
  unitName: string;
  unitShortName: string;
  /** Whole so'm: stockValue() of the quantity and the moving average cost. */
  value: bigint;
  /** The minimum as stored ("5.000"), null for none (plan of 5.10). */
  minimum: string | null;
  /** isLow() of the quantity and the minimum (09 Low stock). */
  low: boolean;
  /** `stock.set_minimums` on the row's branch. */
  canSetMinimum: boolean;
  /** addsDraftsIn() of the row's branch, for "Add to draft" (plan of 5.10, decided item 8). */
  canAddDraft: boolean;
};

export type StockPage = { rows: StockRow[]; page: number; pages: number; found: number };

export type StockFilters = {
  branch?: string | null;
  q?: string;
  category?: string | null;
  /** "Low stock only" (09 Stock screens). */
  low?: boolean;
};

export type StockCategoryChoice = { id: string; name: string; isActive: boolean };

const searchInput = z.string().trim().max(200).catch("");
const idInput = z.uuid().nullable().catch(null);

/** `%`, `_` and `\` typed by a person are matched as themselves (as 1.5, decision 13). */
function containing(text: string): string {
  return `%${text.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/**
 * One page of the stock the user sees: by product name, the default subtype first and then the
 * subtypes by name, then branch code (decided item 8). `q` finds part of the product's or a real
 * subtype's name, any case; the hidden default subtype's stored name is never matched (review of
 * the plan, correction 1). `branch` is authorized: another branch is "Not found" (03 rule 1). A
 * page past the last gives the last; a filter that is not an id is ignored.
 */
export async function listStockOnHand(
  userId: string,
  filters: StockFilters = {},
  page = 1,
): Promise<StockPage> {
  const actor = await authorizeList(userId, "data.view");
  const branch = idInput.parse(filters.branch ?? null);
  const category = idInput.parse(filters.category ?? null);
  const q = searchInput.parse(filters.q ?? "");
  if (branch) await authorize(userId, "data.view", { branchId: branch });

  const pattern = containing(q);
  const where = and(
    eq(products.type, "GOODS"),
    branchFilter(actor, stockBalances.branchId),
    branch ? eq(stockBalances.branchId, branch) : undefined,
    category ? eq(products.categoryId, category) : undefined,
    q === ""
      ? undefined
      : or(
          ilike(products.name, pattern),
          and(eq(productVariants.isDefault, false), ilike(productVariants.name, pattern)),
        ),
    // Low: at or below the minimum, none never (09 Low stock; isLow() of src/domain/stock.ts).
    filters.low === true
      ? sql`${stockMinimums.minQty} is not null and ${stockBalances.qty} <= ${stockMinimums.minQty}`
      : undefined,
  );
  const minimumJoin = and(
    eq(stockMinimums.branchId, stockBalances.branchId),
    eq(stockMinimums.variantId, stockBalances.variantId),
  );

  return readSnapshot(async (db) => {
    const [total] = await db
      .select({ found: count() })
      .from(stockBalances)
      .innerJoin(productVariants, eq(productVariants.id, stockBalances.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .leftJoin(stockMinimums, minimumJoin)
      .where(where);
    const found = total?.found ?? 0;
    const pages = Math.max(1, Math.ceil(found / STOCK_PAGE_SIZE));
    const shown = Math.min(Number.isInteger(page) && page >= 1 ? page : 1, pages);
    const rows = await db
      .select({
        branchId: stockBalances.branchId,
        branchCode: branches.code,
        branchIsActive: branches.isActive,
        variantId: stockBalances.variantId,
        productName: products.name,
        variantName: productVariants.name,
        variantIsDefault: productVariants.isDefault,
        photoFileId: products.photoFileId,
        qty: stockBalances.qty,
        avgCost: stockBalances.avgCost,
        minimum: stockMinimums.minQty,
        unitName: units.name,
        unitShortName: units.shortName,
      })
      .from(stockBalances)
      .innerJoin(branches, eq(branches.id, stockBalances.branchId))
      .innerJoin(productVariants, eq(productVariants.id, stockBalances.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(units, eq(units.id, products.unitId))
      .leftJoin(stockMinimums, minimumJoin)
      .where(where)
      .orderBy(
        asc(products.name),
        asc(products.id),
        sql`${productVariants.isDefault} desc`,
        asc(productVariants.name),
        asc(productVariants.id),
        asc(branches.code),
        asc(branches.id),
      )
      .limit(STOCK_PAGE_SIZE)
      .offset((shown - 1) * STOCK_PAGE_SIZE);
    return {
      rows: rows.map((row) => ({
        branchId: row.branchId,
        branchCode: row.branchCode,
        variantId: row.variantId,
        productName: row.productName,
        subtypeName: row.variantIsDefault ? null : row.variantName,
        photoFileId: row.photoFileId,
        quantity: row.qty,
        unitName: row.unitName,
        unitShortName: row.unitShortName,
        value: stockValue(row.qty, row.avgCost),
        minimum: row.minimum,
        low: isLow(row.qty, row.minimum),
        canSetMinimum: decide("stock.set_minimums", actor, { branchId: row.branchId }) === "allow",
        canAddDraft: addsDraftsIn(actor, { id: row.branchId, isActive: row.branchIsActive }),
      })),
      page: shown,
      pages,
      found,
    };
  });
}

/**
 * The category filter's choices: every category, by name (a catalog is one list for the school,
 * so no branch filter, as the order list's filter; decided item 6).
 */
export async function stockCategoryChoices(userId: string): Promise<StockCategoryChoice[]> {
  await authorizeList(userId, "data.view");
  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  const { db } = await import("@/server/db/client");
  return db
    .select({ id: categories.id, name: categories.name, isActive: categories.isActive })
    .from(categories)
    .orderBy(asc(categories.name), asc(categories.id));
}
