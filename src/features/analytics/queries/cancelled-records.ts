import { sql } from "drizzle-orm";

import type { Period } from "@/domain/analytics";
import type { BusinessDate } from "@/domain/business-date";
import type { Executor } from "@/server/authorize";
import { readSnapshot } from "@/server/read-snapshot";

import { type AnalyticsFilters, type PeriodInput, RECORDS_PAGE_SIZE } from "../period-params";
import { authorizeAnalytics } from "../authorize-filters";
import { cancelledWhere } from "../cancelled-where";
import { resolvePeriod } from "../resolve-period";

// /analytics/cancelled, the records behind a "cancelled purchase records" number of the Managers
// block (10-notifications-analytics-reports.md, Analytics page per role, point 3; build-plan 6.4c;
// plan of 6.4c, decided items 5 and 7). The rows of `analytics_cancelled` under the same
// cancelledWhere() as the number, so their count is the number clicked; a Manager cell sets the
// Manager filter, "Other owners" sets `otherOwners`. Who cancelled and why are read live from the
// record (its cancel fields are written once, Decided ahead, question 3). Under `data.view`, the
// branch wall in the SQL, in one snapshot; 50 a page, or every row for the export.

export type CancelledRecord = {
  purchaseId: string;
  orderId: string;
  orderNumber: string;
  productName: string;
  /** The subtype bought, `null` for a product without subtypes. */
  subtypeName: string | null;
  branchName: string;
  purchasedOn: BusinessDate;
  supplierName: string | null;
  cancelledOn: BusinessDate;
  cancelledByName: string;
  reason: string;
  /** The record's total as it was entered. */
  amount: bigint;
};

export type CancelledRecords = {
  period: Period;
  count: number;
  total: bigint;
  page: number;
  rows: CancelledRecord[];
};

type Row = {
  purchase_id: string;
  order_id: string;
  number: string;
  product_name: string;
  subtype_name: string | null;
  branch_name: string;
  purchased_on: string;
  supplier_name: string | null;
  cancelled_on: string;
  cancelled_by_name: string;
  reason: string;
  amount: string;
};

/** Throws AuthorizationError for another branch's filter, PeriodRefusedError for a bad period. */
export async function getCancelledRecords(
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
  otherOwners: boolean,
  page: number | "all",
): Promise<CancelledRecords> {
  return readSnapshot((db) => recordsIn(db, userId, input, filters, otherOwners, page));
}

async function recordsIn(
  db: Executor,
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
  otherOwners: boolean,
  page: number | "all",
): Promise<CancelledRecords> {
  const actor = await authorizeAnalytics(db, userId, filters);
  const { period } = await resolvePeriod(db, input);
  const where = cancelledWhere(actor, period, filters, otherOwners);
  const summary = await db.execute<{ count: string; total: string }>(sql`
    select count(*)::text as count, coalesce(sum(analytics_cancelled.amount), 0)::text as total
    from analytics_cancelled where ${where}`);
  const limit =
    page === "all"
      ? sql``
      : sql`limit ${RECORDS_PAGE_SIZE} offset ${(page - 1) * RECORDS_PAGE_SIZE}`;
  const found = await db.execute<Row>(sql`
    select analytics_cancelled.purchase_id, analytics_cancelled.order_id, o.number,
           pr.name as product_name,
           case when v.is_default then null else v.name end as subtype_name,
           b.name as branch_name, t.purchased_on::text as purchased_on,
           c.name as supplier_name, analytics_cancelled.cancelled_on::text as cancelled_on,
           by_user.full_name as cancelled_by_name, p.cancel_reason as reason,
           analytics_cancelled.amount::text as amount
    from analytics_cancelled
    join purchases p on p.id = analytics_cancelled.purchase_id
    join purchase_trips t on t.id = p.trip_id
    join orders o on o.id = analytics_cancelled.order_id
    join product_variants v on v.id = p.variant_id
    join products pr on pr.id = v.product_id
    join branches b on b.id = analytics_cancelled.branch_id
    join users by_user on by_user.id = p.cancelled_by
    left join companies c on c.id = analytics_cancelled.supplier_id
    where ${where}
    order by analytics_cancelled.cancelled_on desc, o.number, analytics_cancelled.purchase_id
    ${limit}`);
  return {
    period,
    count: Number(summary.rows[0]!.count),
    total: BigInt(summary.rows[0]!.total),
    page: page === "all" ? 1 : page,
    rows: found.rows.map((row) => ({
      purchaseId: row.purchase_id,
      orderId: row.order_id,
      orderNumber: row.number,
      productName: row.product_name,
      subtypeName: row.subtype_name,
      branchName: row.branch_name,
      purchasedOn: row.purchased_on,
      supplierName: row.supplier_name,
      cancelledOn: row.cancelled_on,
      cancelledByName: row.cancelled_by_name,
      reason: row.reason,
      amount: BigInt(row.amount),
    })),
  };
}
