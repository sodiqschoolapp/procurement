import { sql } from "drizzle-orm";

import { type Change, type Period, changeAgainst } from "@/domain/analytics";
import type { BusinessDate } from "@/domain/business-date";
import { LIST_STATUSES, type ListStatus } from "@/domain/order-list";
import type { Executor } from "@/server/authorize";
import { today } from "@/server/clock";
import { readSnapshot } from "@/server/read-snapshot";

import type { AnalyticsFilters, PeriodInput } from "../period-params";
import { authorizeAnalytics } from "../authorize-filters";
import { ordersWhere } from "../orders-where";
import { resolvePeriod } from "../resolve-period";

// The Principal's Orders block (10-notifications-analytics-reports.md, Analytics page per role,
// Principal, Orders: "By status; needed-by dates coming up; overdue orders"; build-plan 6.5a), read
// from `analytics_orders` under ordersWhere(), the condition its drill-down
// (/analytics/order-status) and export share:
// - by status: the orders first submitted in the period, by their status now, each against the
//   same count of the period before (plan of 6.5a, decided item 2, Look first);
// - coming up and overdue: numbers of now on the clock's Tashkent today, with no change
//   (`isComingUp()`, `isOverdue()`; decided items 2 and 4).
// Under `data.view`, the branch and draft walls in the SQL, in one snapshot.

export type StatusCount = { status: ListStatus; count: number; change: Change };

export type OrderStatuses = {
  period: Period;
  before: Period;
  today: BusinessDate;
  /** Every status but Draft, in the order of LIST_STATUSES, each with a count in either period. */
  statuses: StatusCount[];
  total: { count: number; change: Change };
  comingUp: number;
  overdue: number;
};

export async function getOrderStatuses(
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<OrderStatuses> {
  return readSnapshot((db) => statusesIn(db, userId, input, filters));
}

async function statusesIn(
  db: Executor,
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<OrderStatuses> {
  const actor = await authorizeAnalytics(db, userId, filters);
  const { period, before } = await resolvePeriod(db, input);
  const day = today();
  const now = ordersWhere(actor, period, filters);
  const then = ordersWhere(actor, before, filters);

  const byStatus = await db.execute<{ status: ListStatus; now: string; before: string }>(sql`
    select status, count(*) filter (where ${now})::text as now,
           count(*) filter (where ${then})::text as before
    from analytics_orders
    where (${now}) or (${then})
    group by status`);
  const due = await db.execute<{ soon: string; overdue: string }>(sql`
    select count(*) filter (where ${ordersWhere(actor, { due: "soon", today: day }, filters)})::text
             as soon,
           count(*) filter (where ${ordersWhere(actor, { due: "overdue", today: day }, filters)})::text
             as overdue
    from analytics_orders`);

  const found = new Map(byStatus.rows.map((row) => [row.status, row]));
  let nowTotal = 0n;
  let beforeTotal = 0n;
  const statuses = LIST_STATUSES.flatMap((status) => {
    const row = found.get(status);
    if (!row) return [];
    const count = BigInt(row.now);
    nowTotal += count;
    beforeTotal += BigInt(row.before);
    return [{ status, count: Number(count), change: changeAgainst(count, BigInt(row.before)) }];
  });
  return {
    period,
    before,
    today: day,
    statuses,
    total: { count: Number(nowTotal), change: changeAgainst(nowTotal, beforeTotal) },
    comingUp: Number(due.rows[0]!.soon),
    overdue: Number(due.rows[0]!.overdue),
  };
}
