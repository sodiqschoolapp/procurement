import { sql } from "drizzle-orm";

import {
  type Period,
  WAITING_GROUP_KEYS,
  type WaitingGroup,
  averageHours,
  shareChange,
  shareOf,
  waitingGroup,
} from "@/domain/analytics";
import { type ApprovalStep, type StayDecision } from "@/domain/approval-stays";
import { STUCK_STATUSES } from "@/domain/order-steps";
import type { Executor } from "@/server/authorize";
import { now } from "@/server/clock";
import { readSnapshot } from "@/server/read-snapshot";

import type { AnalyticsFilters, PeriodInput } from "../period-params";
import { authorizeAnalytics } from "../authorize-filters";
import { resolvePeriod } from "../resolve-period";
import { stepsWhere } from "../steps-where";
import { type Reason, type ReasonDecision, topReasonsIn } from "../top-reasons";

// The Approval speed block of the Head's Analytics page (10-notifications-analytics-reports.md,
// Analytics page per role, Head: "Average hours at each step per branch; orders waiting now, by
// age; share sent back or rejected, with the most common reasons"; build-plan 6.4b). Read from
// `analytics_steps`, each row a stay of `approvalStays()` (plan of 6.4b, decided item 6, Look
// first), under stepsWhere(), the condition its drill-down and export share, with the branch and
// draft walls in the SQL. SQL only adds whole seconds and counts; every average is
// `averageHours()` of a set's own sum and count, the "All branches" row and the "in all" shares
// included, never a mean of the rows (review of the plan, correction 2). Every number of the
// period carries its change against the period before (10 point 1): hours and shares as the
// difference of two one-decimal numbers (`shareChange()`), a count by `changeAgainst()`. "Waiting
// now" ignores the period: the open stays, grouped by `waitingGroup()` with the injected clock
// (decided item 8). Under `data.view`, in one snapshot.

/** An average of hours and its change in hours; `null` when the set has no stay. */
export type Hours = { hours: string | null; count: number; change: string | null };

export type BranchHours = {
  branchId: string;
  name: string;
  isActive: boolean;
  steps: Record<ApprovalStep, Hours>;
};

export type DecisionShares = {
  decisions: number;
  sentBack: { count: number; share: string | null; change: string | null };
  rejected: { count: number; share: string | null; change: string | null };
};

export type ApprovalSpeed = {
  period: Period;
  before: Period;
  /** Every branch of the user with a stay in either period, by name. */
  branches: BranchHours[];
  /** Every stay of each step in the user's branches together. */
  all: Record<ApprovalStep, Hours>;
  /** Per step, then every step together (`all`). */
  waiting: Record<ApprovalStep | "all", Record<WaitingGroup | "all", number>>;
  shares: Record<ApprovalStep | "all", DecisionShares>;
  reasons: Record<ReasonDecision, Reason[]>;
};

export async function getApprovalSpeed(
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<ApprovalSpeed> {
  return readSnapshot((db) => speedIn(db, userId, input, filters));
}

type Sum = { seconds: bigint; count: number };
const NO_SUM: Sum = { seconds: 0n, count: 0 };
const add = (a: Sum, b: Sum): Sum => ({ seconds: a.seconds + b.seconds, count: a.count + b.count });

function hoursOf(now: Sum, before: Sum): Hours {
  const hours = averageHours(now.seconds, now.count);
  return {
    hours,
    count: now.count,
    change: shareChange(hours, averageHours(before.seconds, before.count)),
  };
}

const bySteps = <T>(make: (step: ApprovalStep) => T) =>
  Object.fromEntries(STUCK_STATUSES.map((step) => [step, make(step)])) as Record<ApprovalStep, T>;

async function speedIn(
  db: Executor,
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<ApprovalSpeed> {
  const actor = await authorizeAnalytics(db, userId, filters);
  const { period, before } = await resolvePeriod(db, input);
  const nowWhere = stepsWhere(actor, period, filters);
  const beforeWhere = stepsWhere(actor, before, filters);

  // Hours per branch and step, in the period and before.
  const sums = await db.execute<{
    branch_id: string;
    name: string;
    is_active: boolean;
    step: ApprovalStep;
    within: boolean;
    seconds: string;
    count: string;
  }>(sql`
    select analytics_steps.branch_id, b.name, b.is_active, analytics_steps.step,
           (${nowWhere}) as within, sum(analytics_steps.seconds)::text as seconds,
           count(*)::text as count
    from analytics_steps join branches b on b.id = analytics_steps.branch_id
    where (${nowWhere}) or (${beforeWhere})
    group by analytics_steps.branch_id, b.name, b.is_active, analytics_steps.step, within
    order by b.name`);
  const branches = new Map<
    string,
    {
      name: string;
      isActive: boolean;
      now: Record<ApprovalStep, Sum>;
      before: Record<ApprovalStep, Sum>;
    }
  >();
  const allNow = bySteps(() => NO_SUM);
  const allBefore = bySteps(() => NO_SUM);
  for (const row of sums.rows) {
    const entry = branches.get(row.branch_id) ?? {
      name: row.name,
      isActive: row.is_active,
      now: bySteps(() => NO_SUM),
      before: bySteps(() => NO_SUM),
    };
    const sum = { seconds: BigInt(row.seconds), count: Number(row.count) };
    const side = row.within ? entry.now : entry.before;
    side[row.step] = add(side[row.step], sum);
    const all = row.within ? allNow : allBefore;
    all[row.step] = add(all[row.step], sum);
    branches.set(row.branch_id, entry);
  }

  // The orders waiting now: one open stay each (decided item 8).
  const open = await db.execute<{ step: ApprovalStep; entered_at: Date }>(sql`
    select analytics_steps.step, analytics_steps.entered_at from analytics_steps
    where ${stepsWhere(actor, "open", filters)}`);
  const groups = () =>
    Object.fromEntries([...WAITING_GROUP_KEYS, "all"].map((group) => [group, 0])) as Record<
      WaitingGroup | "all",
      number
    >;
  const waiting = {
    ...bySteps(groups),
    all: groups(),
  } as ApprovalSpeed["waiting"];
  const moment = now();
  for (const row of open.rows) {
    const group = waitingGroup(new Date(row.entered_at), moment);
    for (const step of [row.step, "all"] as const) {
      waiting[step][group] += 1;
      waiting[step].all += 1;
    }
  }

  // The decisions of each step, in the period and before (decided item 9).
  const decided = await db.execute<{
    step: ApprovalStep;
    decision: StayDecision;
    within: boolean;
    count: string;
  }>(sql`
    select analytics_steps.step, analytics_steps.decision, (${nowWhere}) as within,
           count(*)::text as count
    from analytics_steps
    where (${nowWhere}) or (${beforeWhere})
    group by analytics_steps.step, analytics_steps.decision, within`);
  type Tally = Record<StayDecision, number>;
  const tally = (): Tally => ({ APPROVE: 0, SEND_BACK: 0, REJECT: 0 });
  const nowTally = { ...bySteps(tally), all: tally() };
  const beforeTally = { ...bySteps(tally), all: tally() };
  for (const row of decided.rows) {
    const side = row.within ? nowTally : beforeTally;
    side[row.step][row.decision] += Number(row.count);
    side.all[row.decision] += Number(row.count);
  }
  const sharesOf = (step: ApprovalStep | "all"): DecisionShares => {
    const n = nowTally[step];
    const b = beforeTally[step];
    const whole = n.APPROVE + n.SEND_BACK + n.REJECT;
    const wholeBefore = b.APPROVE + b.SEND_BACK + b.REJECT;
    const part = (decision: "SEND_BACK" | "REJECT") => {
      const share = shareOf(n[decision], whole);
      return {
        count: n[decision],
        share,
        change: shareChange(share, shareOf(b[decision], wholeBefore)),
      };
    };
    return { decisions: whole, sentBack: part("SEND_BACK"), rejected: part("REJECT") };
  };

  // The most common reasons (decided item 10).
  const reasons = await topReasonsIn(db, nowWhere, beforeWhere);

  return {
    period,
    before,
    branches: [...branches.entries()].map(([branchId, entry]) => ({
      branchId,
      name: entry.name,
      isActive: entry.isActive,
      steps: bySteps((step) => hoursOf(entry.now[step], entry.before[step])),
    })),
    all: bySteps((step) => hoursOf(allNow[step], allBefore[step])),
    waiting,
    shares: { ...bySteps(sharesOf), all: sharesOf("all") },
    reasons,
  };
}
