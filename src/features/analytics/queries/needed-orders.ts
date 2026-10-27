import { sql } from "drizzle-orm";

import type { BusinessDate } from "@/domain/business-date";
import type { RequestStatus } from "@/domain/request-status";
import type { Executor } from "@/server/authorize";
import { readSnapshot } from "@/server/read-snapshot";

import { authorizeAnalytics } from "../authorize-filters";
import { neededWhere } from "../needed-where";
import {
  type AnalyticsFilters,
  type ApprovalStatus,
  type NeededStage,
  RECORDS_PAGE_SIZE,
} from "../period-params";

// /analytics/cash-needed, the orders behind a Cash needed soon number (10-notifications-analytics-
// reports.md, Analytics page per role, point 3; build-plan 6.6a; plan of 6.6a, decided items 4, 5
// and 10): the rows of `analytics_orders` under the same neededWhere() as the number, nearest
// needed-by date first, so their Σ is the number clicked. Names and numbers are read live. Under
// `data.view`, the branch wall and the live status in the SQL, in one snapshot; 25 a page, or
// every row for the export.

export type NeededOrder = {
  orderId: string;
  orderNumber: string;
  productName: string;
  subtypeName: string | null;
  branchName: string;
  ownerName: string;
  status: RequestStatus;
  neededBy: BusinessDate;
  /** `null` for an order without a planned price (the `unpriced` list only). */
  plannedCash: bigint | null;
  handed: bigint;
  needed: bigint;
};

export type NeededOrders = {
  stage: NeededStage;
  step: ApprovalStatus | null;
  /** The orders of the stage without a planned price (plan of 2.5d-c). */
  unpriced: boolean;
  count: number;
  total: bigint;
  page: number;
  rows: NeededOrder[];
};

type Row = {
  order_id: string;
  number: string;
  product_name: string;
  subtype_name: string | null;
  branch_name: string;
  owner_name: string;
  status: RequestStatus;
  needed_by: string;
  planned_cash: string | null;
  cash_handed: string;
  cash_needed: string | null;
};

/** Throws AuthorizationError for another branch's filter. */
export async function getNeededOrders(
  userId: string,
  filters: AnalyticsFilters,
  stage: NeededStage,
  step: ApprovalStatus | null,
  page: number | "all",
  unpriced = false,
): Promise<NeededOrders> {
  return readSnapshot((db) => ordersIn(db, userId, filters, stage, step, page, unpriced));
}

async function ordersIn(
  db: Executor,
  userId: string,
  filters: AnalyticsFilters,
  stage: NeededStage,
  step: ApprovalStatus | null,
  page: number | "all",
  unpriced: boolean,
): Promise<NeededOrders> {
  const actor = await authorizeAnalytics(db, userId, filters);
  const where = neededWhere(actor, filters, stage, step, unpriced);
  const summary = await db.execute<{ count: number; total: string }>(sql`
    select count(*)::int as count, coalesce(sum(cash_needed), 0)::text as total
    from analytics_orders where ${where}`);
  const found = await db.execute<Row>(sql`
    select analytics_orders.order_id, o.number, pr.name as product_name,
           case when v.is_default then null else v.name end as subtype_name,
           b.name as branch_name, u.full_name as owner_name, o.status,
           analytics_orders.needed_by::text as needed_by,
           analytics_orders.planned_cash::text as planned_cash,
           analytics_orders.cash_handed::text as cash_handed,
           analytics_orders.cash_needed::text as cash_needed
    from analytics_orders
    join orders o on o.id = analytics_orders.order_id
    join product_variants v on v.id = o.variant_id
    join products pr on pr.id = v.product_id
    join branches b on b.id = analytics_orders.branch_id
    join users u on u.id = analytics_orders.owner_id
    where ${where}
    order by analytics_orders.needed_by, o.number, analytics_orders.order_id
    ${page === "all" ? sql`` : sql`limit ${RECORDS_PAGE_SIZE} offset ${(page - 1) * RECORDS_PAGE_SIZE}`}`);
  return {
    stage,
    step,
    unpriced,
    count: summary.rows[0]!.count,
    total: BigInt(summary.rows[0]!.total),
    page: page === "all" ? 1 : page,
    rows: found.rows.map((row) => ({
      orderId: row.order_id,
      orderNumber: row.number,
      productName: row.product_name,
      subtypeName: row.subtype_name,
      branchName: row.branch_name,
      ownerName: row.owner_name,
      status: row.status,
      neededBy: row.needed_by,
      // Empty only in the list of the orders without a planned price (plan of 2.5d-c): elsewhere
      // cash_needed > 0, which cashNeeded() never gives without planned cash (2.5d-b, item 9).
      plannedCash: row.planned_cash === null ? null : BigInt(row.planned_cash),
      handed: BigInt(row.cash_handed),
      // An order of that list needs an amount nobody knows; it adds 0 to the list's sum.
      needed: row.cash_needed === null ? 0n : BigInt(row.cash_needed),
    })),
  };
}
