import { sql } from "drizzle-orm";

import {
  type Period,
  WAITING_GROUP_KEYS,
  type WaitingGroup,
  averageHours,
  shareChange,
  waitingGroup,
} from "@/domain/analytics";
import type { Executor } from "@/server/authorize";
import { now } from "@/server/clock";
import { readSnapshot } from "@/server/read-snapshot";

import type { AnalyticsFilters, PeriodInput } from "../period-params";
import { authorizeAnalytics } from "../authorize-filters";
import { resolvePeriod } from "../resolve-period";
import { stepsWhere } from "../steps-where";
import type { Hours } from "./approval-speed";

// The Principal's My approvals block (10-notifications-analytics-reports.md, Analytics page per
// role, Principal, My approvals: "Waiting now; my average time to decide"; build-plan 6.5a), read
// from `analytics_steps` under stepsWhere(), the condition its drill-downs and export share, with
// the branch and draft walls in the SQL:
// - waiting now: the open stays at Waiting for Principal, by waitingGroup() with the injected
//   clock; it ignores the period (plan of 6.5a, decided item 5; plan of 6.4b, decided item 8);
// - my average time to decide: `averageHours()` of Σ seconds and count of the stays this user
//   decided (`decided_by`) in the period, never a mean of means, its change in hours against the
//   period before (`shareChange()`; decided item 3, Look first).
// Under `data.view`, in one snapshot.

export type MyApprovals = {
  period: Period;
  before: Period;
  waiting: Record<WaitingGroup | "all", number>;
  mine: Hours;
};

export async function getMyApprovals(
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<MyApprovals> {
  return readSnapshot((db) => myApprovalsIn(db, userId, input, filters));
}

async function myApprovalsIn(
  db: Executor,
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<MyApprovals> {
  const actor = await authorizeAnalytics(db, userId, filters);
  const { period, before } = await resolvePeriod(db, input);
  const nowWhere = stepsWhere(actor, period, filters);
  const beforeWhere = stepsWhere(actor, before, filters);

  const open = await db.execute<{ entered_at: Date }>(sql`
    select analytics_steps.entered_at from analytics_steps
    where ${stepsWhere(actor, "open", filters)} and analytics_steps.step = 'PENDING_PRINCIPAL'`);
  const moment = now();
  const waiting = Object.fromEntries(
    [...WAITING_GROUP_KEYS, "all"].map((group) => [group, 0]),
  ) as Record<WaitingGroup | "all", number>;
  for (const row of open.rows) {
    waiting[waitingGroup(new Date(row.entered_at), moment)] += 1;
    waiting.all += 1;
  }

  const sums = await db.execute<{
    now_seconds: string;
    now_count: string;
    before_seconds: string;
    before_count: string;
  }>(sql`
    select coalesce(sum(seconds) filter (where ${nowWhere}), 0)::text as now_seconds,
           count(*) filter (where ${nowWhere})::text as now_count,
           coalesce(sum(seconds) filter (where ${beforeWhere}), 0)::text as before_seconds,
           count(*) filter (where ${beforeWhere})::text as before_count
    from analytics_steps
    where analytics_steps.decided_by = ${userId}`);
  const sum = sums.rows[0]!;
  const hours = averageHours(BigInt(sum.now_seconds), Number(sum.now_count));
  return {
    period,
    before,
    waiting,
    mine: {
      hours,
      count: Number(sum.now_count),
      change: shareChange(
        hours,
        averageHours(BigInt(sum.before_seconds), Number(sum.before_count)),
      ),
    },
  };
}
