import { sql } from "drizzle-orm";

import { type Period, averageHours, shareChange, shareOf } from "@/domain/analytics";
import type { StayDecision } from "@/domain/approval-stays";
import type { Executor } from "@/server/authorize";
import { readSnapshot } from "@/server/read-snapshot";

import type { AnalyticsFilters, PeriodInput } from "../period-params";
import { authorizeAnalytics } from "../authorize-filters";
import { mineOf, withoutManager } from "../mine";
import { ordersWhere } from "../orders-where";
import { resolvePeriod } from "../resolve-period";
import { type StatusCounts, statusCountsIn } from "../status-counts";
import { stepsWhere } from "../steps-where";
import { type Reason, topReasonsIn } from "../top-reasons";
import type { Hours } from "./approval-speed";

// The Manager's My orders block (10-notifications-analytics-reports.md, Analytics page per role,
// Manager, My orders: "By status; average time to full approval; share sent back, with reasons";
// build-plan 6.5b). The user's own orders only (plan of 6.5b, decided item 7, Look first):
// - by status: my orders first submitted in the period by their status now, each against the
//   period before, read as the Principal's Orders block reads it (`statusCountsIn()`; decided
//   item 3);
// - average time to full approval: `averageHours()` of Σ seconds and count of my orders that
//   first entered Open in the period, first submit to Open (`analytics_orders.approval_seconds`),
//   its change in hours (decided item 1, Look first);
// - share sent back: of the approvers' decisions on my orders in the period, with its change in
//   points, and the most common send-back reasons (`topReasonsIn()`; decided item 2, Look first).
// Under `data.view`, the branch and draft walls in the SQL of each builder, in one snapshot.

export type MyOrders = StatusCounts & {
  period: Period;
  before: Period;
  approval: Hours;
  /** Every decision of an approver on my orders in the period. */
  decisions: number;
  sentBack: { count: number; share: string | null; change: string | null };
  reasons: Reason[];
};

export async function getMyOrders(
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<MyOrders> {
  return readSnapshot((db) => myOrdersIn(db, userId, input, filters));
}

async function myOrdersIn(
  db: Executor,
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<MyOrders> {
  const actor = await authorizeAnalytics(db, userId, withoutManager(filters));
  const { period, before } = await resolvePeriod(db, input);
  const mine = mineOf(filters, userId);

  const counts = await statusCountsIn(
    db,
    ordersWhere(actor, period, mine),
    ordersWhere(actor, before, mine),
  );

  const openedNow = ordersWhere(actor, { opened: period }, mine);
  const openedBefore = ordersWhere(actor, { opened: before }, mine);
  const sums = await db.execute<{
    now_seconds: string;
    now_count: string;
    before_seconds: string;
    before_count: string;
  }>(sql`
    select coalesce(sum(approval_seconds) filter (where ${openedNow}), 0)::text as now_seconds,
           count(*) filter (where ${openedNow})::text as now_count,
           coalesce(sum(approval_seconds) filter (where ${openedBefore}), 0)::text
             as before_seconds,
           count(*) filter (where ${openedBefore})::text as before_count
    from analytics_orders
    where (${openedNow}) or (${openedBefore})`);
  const sum = sums.rows[0]!;
  const hours = averageHours(BigInt(sum.now_seconds), Number(sum.now_count));

  const nowWhere = stepsWhere(actor, period, mine);
  const beforeWhere = stepsWhere(actor, before, mine);
  const decided = await db.execute<{ decision: StayDecision; within: boolean; count: string }>(sql`
    select analytics_steps.decision, (${nowWhere}) as within, count(*)::text as count
    from analytics_steps
    where (${nowWhere}) or (${beforeWhere})
    group by analytics_steps.decision, within`);
  const tally = { now: { all: 0, sentBack: 0 }, before: { all: 0, sentBack: 0 } };
  for (const row of decided.rows) {
    const side = row.within ? tally.now : tally.before;
    side.all += Number(row.count);
    if (row.decision === "SEND_BACK") side.sentBack += Number(row.count);
  }
  const share = shareOf(tally.now.sentBack, tally.now.all);

  return {
    period,
    before,
    ...counts,
    approval: {
      hours,
      count: Number(sum.now_count),
      change: shareChange(
        hours,
        averageHours(BigInt(sum.before_seconds), Number(sum.before_count)),
      ),
    },
    decisions: tally.now.all,
    sentBack: {
      count: tally.now.sentBack,
      share,
      change: shareChange(share, shareOf(tally.before.sentBack, tally.before.all)),
    },
    reasons: (await topReasonsIn(db, nowWhere, beforeWhere)).SEND_BACK,
  };
}
