import { sql } from "drizzle-orm";

import { ninetyDaysSince } from "@/domain/analytics";
import type { BusinessDate } from "@/domain/business-date";
import type { Executor } from "@/server/authorize";
import { today } from "@/server/clock";
import { readSnapshot } from "@/server/read-snapshot";

import { type AnalyticsFilters, RECORDS_PAGE_SIZE, type StockView } from "../period-params";
import { authorizeAnalytics } from "../authorize-filters";
import { stockWhere } from "../stock-where";

// /analytics/stock, the stock lines behind a Warehouse number of now (10-notifications-analytics-
// reports.md, Analytics page per role, point 3; build-plan 6.4d; plan of 6.4d, decided items 1, 3,
// 7 and 9): the rows of `analytics_stock` under the same stockWhere() as the number, so their
// count and their Σ value are the number clicked. Names are read live. Under `data.view`, the
// branch wall in the SQL, in one snapshot; 50 a page, or every row for the export.

export type StockLine = {
  branchId: string;
  variantId: string;
  branchName: string;
  productName: string;
  /** `null` for the hidden default subtype of a product without subtypes. */
  subtypeName: string | null;
  /** numeric(14,3) text as stored. */
  quantity: string;
  unitShortName: string;
  minimum: string | null;
  avgCost: bigint;
  value: bigint;
  lastMovedOn: BusinessDate | null;
};

export type StockLines = {
  view: StockView;
  stillSince: BusinessDate;
  count: number;
  total: bigint;
  page: number;
  rows: StockLine[];
};

type Row = {
  branch_id: string;
  variant_id: string;
  branch_name: string;
  product_name: string;
  subtype_name: string | null;
  qty: string;
  unit_short_name: string;
  min_qty: string | null;
  avg_cost: string;
  value: string;
  last_moved_on: string | null;
};

/** Throws AuthorizationError for another branch's filter. */
export async function getStockLines(
  userId: string,
  view: StockView,
  filters: AnalyticsFilters,
  page: number | "all",
): Promise<StockLines> {
  return readSnapshot((db) => linesIn(db, userId, view, filters, page));
}

async function linesIn(
  db: Executor,
  userId: string,
  view: StockView,
  filters: AnalyticsFilters,
  page: number | "all",
): Promise<StockLines> {
  const actor = await authorizeAnalytics(db, userId, filters);
  const stillSince = ninetyDaysSince(today());
  const where = stockWhere(actor, filters, view, stillSince);
  const summary = await db.execute<{ count: string; total: string }>(sql`
    select count(*)::text as count, coalesce(sum(analytics_stock.value), 0)::text as total
    from analytics_stock where ${where}`);
  const limit =
    page === "all"
      ? sql``
      : sql`limit ${RECORDS_PAGE_SIZE} offset ${(page - 1) * RECORDS_PAGE_SIZE}`;
  // The largest value first; the still lines the longest still first (decided item 7).
  const order =
    view === "still"
      ? sql`analytics_stock.last_moved_on, analytics_stock.value desc`
      : sql`analytics_stock.value desc`;
  const found = await db.execute<Row>(sql`
    select analytics_stock.branch_id, analytics_stock.variant_id, b.name as branch_name,
           pr.name as product_name,
           case when v.is_default then null else v.name end as subtype_name,
           analytics_stock.qty::text as qty, u.short_name as unit_short_name,
           analytics_stock.min_qty::text as min_qty, analytics_stock.avg_cost::text as avg_cost,
           analytics_stock.value::text as value,
           analytics_stock.last_moved_on::text as last_moved_on
    from analytics_stock
    join branches b on b.id = analytics_stock.branch_id
    join product_variants v on v.id = analytics_stock.variant_id
    join products pr on pr.id = v.product_id
    join units u on u.id = pr.unit_id
    where ${where}
    order by ${order}, pr.name, v.name, b.code, analytics_stock.variant_id
    ${limit}`);
  return {
    view,
    stillSince,
    count: Number(summary.rows[0]!.count),
    total: BigInt(summary.rows[0]!.total),
    page: page === "all" ? 1 : page,
    rows: found.rows.map((row) => ({
      branchId: row.branch_id,
      variantId: row.variant_id,
      branchName: row.branch_name,
      productName: row.product_name,
      subtypeName: row.subtype_name,
      quantity: row.qty,
      unitShortName: row.unit_short_name,
      minimum: row.min_qty,
      avgCost: BigInt(row.avg_cost),
      value: BigInt(row.value),
      lastMovedOn: row.last_moved_on,
    })),
  };
}
