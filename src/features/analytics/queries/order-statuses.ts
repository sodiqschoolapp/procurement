import { sql } from "drizzle-orm";

import type { Period } from "@/domain/analytics";
import type { BusinessDate } from "@/domain/business-date";
import type { Executor } from "@/server/authorize";
import { today } from "@/server/clock";
import { readSnapshot } from "@/server/read-snapshot";

import type { AnalyticsFilters, PeriodInput } from "../period-params";
import { authorizeAnalytics } from "../authorize-filters";
import { ordersWhere } from "../orders-where";
import { resolvePeriod } from "../resolve-period";
import { type StatusCounts, statusCountsIn } from "../status-counts";

// The Principal's Orders block (10-notifications-analytics-reports.md, Analytics page per role,
// Principal, Orders: "By status; needed-by dates coming up; overdue orders"; build-plan 6.5a), read
// from `analytics_orders` under ordersWhere(), the condition its drill-down
// (/analytics/order-status) and export share:
// - by status: the orders first submitted in the period, by their status now, each against the
//   same count of the period before (plan of 6.5a, decided item 2, Look first);
// - coming up and overdue: numbers of now on the clock's Tashkent today, with no change
//   (`isComingUp()`, `isOverdue()`; decided items 2 and 4).
// Under `data.view`, the branch and draft walls in the SQL, in one snapshot.

export type OrderStatuses = StatusCounts & {
  period: Period;
  before: Period;
  today: BusinessDate;
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

  const counts = await statusCountsIn(db, now, then);
  const due = await db.execute<{ soon: string; overdue: string }>(sql`
    select count(*) filter (where ${ordersWhere(actor, { due: "soon", today: day }, filters)})::text
             as soon,
           count(*) filter (where ${ordersWhere(actor, { due: "overdue", today: day }, filters)})::text
             as overdue
    from analytics_orders`);

  return {
    period,
    before,
    today: day,
    ...counts,
    comingUp: Number(due.rows[0]!.soon),
    overdue: Number(due.rows[0]!.overdue),
  };
}
