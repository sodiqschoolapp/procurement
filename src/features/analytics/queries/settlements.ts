import { sql } from "drizzle-orm";

import { type Period, averageDays } from "@/domain/analytics";
import type { BusinessDate } from "@/domain/business-date";
import type { Executor } from "@/server/authorize";
import { readSnapshot } from "@/server/read-snapshot";

import { authorizeAnalytics } from "../authorize-filters";
import { type AnalyticsFilters, type PeriodInput, RECORDS_PAGE_SIZE } from "../period-params";
import { resolvePeriod } from "../resolve-period";
import { settlementsWhere } from "../settlements-where";

// /analytics/settlements, the settlements behind a Settlement speed number (10-notifications-
// analytics-reports.md, Analytics page per role, point 3; build-plan 6.6b; plan of 6.6b, decided
// item 8): the rows of `analytics_settlements` closed in the period, under the same
// settlementsWhere() as the number, so their count and `averageDays()` of their Σ seconds are the
// number clicked. Each row's days are `averageDays()` of its one settlement. The order, product,
// branch and owner are read live. Under `data.view`, the branch wall in the SQL, in one snapshot;
// newest close first, 50 a page, or every row for the export.

export type SettlementLine = {
  orderId: string;
  orderNumber: string;
  productName: string;
  subtypeName: string | null;
  branchName: string;
  ownerName: string;
  sentAt: Date;
  closedAt: Date;
  closedOn: BusinessDate;
  days: string;
};

export type SettlementList = {
  period: Period;
  count: number;
  /** The average of the settlements listed: the number clicked; `null` for none. */
  days: string | null;
  page: number;
  rows: SettlementLine[];
};

type Row = {
  order_id: string;
  number: string;
  product_name: string;
  subtype_name: string | null;
  branch_name: string;
  owner_name: string;
  sent_at: string;
  closed_at: string;
  closed_on: string;
  seconds: string;
};

/** Throws AuthorizationError for another branch's filter, PeriodRefusedError for a bad period. */
export async function getSettlements(
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
  page: number | "all",
): Promise<SettlementList> {
  return readSnapshot((db) => settlementsIn(db, userId, input, filters, page));
}

async function settlementsIn(
  db: Executor,
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
  page: number | "all",
): Promise<SettlementList> {
  const actor = await authorizeAnalytics(db, userId, filters);
  const { period } = await resolvePeriod(db, input);
  const where = settlementsWhere(actor, period, filters);
  const summary = await db.execute<{ count: string; seconds: string }>(sql`
    select count(*)::text as count, coalesce(sum(seconds), 0)::text as seconds
    from analytics_settlements where ${where}`);
  const found = await db.execute<Row>(sql`
    select analytics_settlements.order_id, o.number, pr.name as product_name,
           case when v.is_default then null else v.name end as subtype_name,
           b.name as branch_name, u.full_name as owner_name,
           to_json(analytics_settlements.sent_at)#>>'{}' as sent_at,
           to_json(analytics_settlements.closed_at)#>>'{}' as closed_at,
           analytics_settlements.closed_on::text as closed_on,
           analytics_settlements.seconds::text as seconds
    from analytics_settlements
    join orders o on o.id = analytics_settlements.order_id
    join product_variants v on v.id = o.variant_id
    join products pr on pr.id = v.product_id
    join branches b on b.id = analytics_settlements.branch_id
    join users u on u.id = analytics_settlements.owner_id
    where ${where}
    order by analytics_settlements.closed_at desc, o.number, analytics_settlements.order_id
    ${page === "all" ? sql`` : sql`limit ${RECORDS_PAGE_SIZE} offset ${(page - 1) * RECORDS_PAGE_SIZE}`}`);
  const count = Number(summary.rows[0]!.count);
  return {
    period,
    count,
    days: averageDays(BigInt(summary.rows[0]!.seconds), count),
    page: page === "all" ? 1 : page,
    rows: found.rows.map((row) => ({
      orderId: row.order_id,
      orderNumber: row.number,
      productName: row.product_name,
      subtypeName: row.subtype_name,
      branchName: row.branch_name,
      ownerName: row.owner_name,
      sentAt: new Date(row.sent_at),
      closedAt: new Date(row.closed_at),
      closedOn: row.closed_on,
      days: averageDays(BigInt(row.seconds), 1)!,
    })),
  };
}
