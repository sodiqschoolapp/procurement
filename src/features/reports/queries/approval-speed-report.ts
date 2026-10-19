import { sql } from "drizzle-orm";

import { type DateRange, averageHours } from "@/domain/analytics";
import type { ApprovalStep, StayDecision } from "@/domain/approval-stays";
import type { BusinessDate } from "@/domain/business-date";
import { STUCK_STATUSES } from "@/domain/order-steps";
import { readSnapshot } from "@/server/read-snapshot";

import { authorizeAnalytics } from "../../analytics/authorize-filters";
import { stepsWhere } from "../../analytics/steps-where";
import { REPORT_PAGE_SIZE, type ReportParams } from "../report-params";

// The Approval speed report (10-notifications-analytics-reports.md, Reports: "Average hours an
// order waits at each step"; 06-approval-workflow.md, Statuses; build-plan 6.9b). Read from
// `analytics_steps`, each row a stay of `approvalStays()` (6.4b decided item 6), under
// stepsWhere() with the dates: the stays decided (left) in them, the branch and draft walls in the
// SQL (plan of 6.9b, decided item 4, Look first). A stay still waiting has no length and is not
// here. SQL only adds whole seconds and counts; every average is `averageHours()` of a set's own
// sum and count, the "All my branches" row included, never a mean of the branch rows; a stay's
// own hours are `averageHours()` of one. So the report equals the Analytics block for the same
// dates and filters. Under `data.view`, in one snapshot; the stays 25 a page, newest decided
// first, or all for the file.

export type StepHours = { hours: string | null; count: number };

export type SpeedBranch = {
  branchId: string;
  name: string;
  isActive: boolean;
  steps: Record<ApprovalStep, StepHours>;
};

export type SpeedStay = {
  orderId: string;
  orderNumber: string;
  branchCode: string;
  step: ApprovalStep;
  enteredAt: Date;
  leftAt: Date;
  leftOn: BusinessDate;
  hours: string;
  /** The approver's decision that ended the stay. */
  decision: StayDecision;
};

export type ApprovalSpeedReport = {
  range: DateRange;
  /** Every branch of the user with a stay decided in the dates, by name. */
  branches: SpeedBranch[];
  all: Record<ApprovalStep, StepHours>;
  stayCount: number;
  page: number;
  pages: number;
  stays: SpeedStay[];
};

type Sum = { seconds: bigint; count: number };

const bySteps = <T>(make: (step: ApprovalStep) => T) =>
  Object.fromEntries(STUCK_STATUSES.map((step) => [step, make(step)])) as Record<ApprovalStep, T>;

const hoursOf = (sum: Sum): StepHours => ({
  hours: averageHours(sum.seconds, sum.count),
  count: sum.count,
});

/** Throws AuthorizationError for another branch's `branch` filter. */
export async function getApprovalSpeedReport(
  userId: string,
  params: Pick<ReportParams, "range" | "filters">,
  page: number | "all",
): Promise<ApprovalSpeedReport> {
  return readSnapshot(async (db) => {
    const actor = await authorizeAnalytics(db, userId, params.filters);
    const where = stepsWhere(actor, params.range, params.filters);
    const found = await db.execute<{
      order_id: string;
      order_number: string;
      branch_id: string;
      branch_name: string;
      branch_code: string;
      branch_active: boolean;
      step: ApprovalStep;
      entered_at: Date;
      left_at: Date;
      left_on: string;
      seconds: string;
      decision: StayDecision;
    }>(sql`
      select analytics_steps.order_id, o.number as order_number, analytics_steps.branch_id,
             b.name as branch_name, b.code as branch_code, b.is_active as branch_active,
             analytics_steps.step, analytics_steps.entered_at, analytics_steps.left_at,
             analytics_steps.left_on::text as left_on, analytics_steps.seconds::text as seconds,
             analytics_steps.decision::text as decision
      from analytics_steps
      join orders o on o.id = analytics_steps.order_id
      join branches b on b.id = analytics_steps.branch_id
      where ${where}
      order by analytics_steps.left_at desc, o.number, analytics_steps.step`);

    const branches = new Map<
      string,
      { name: string; isActive: boolean; sums: Record<ApprovalStep, Sum> }
    >();
    const all = bySteps((): Sum => ({ seconds: 0n, count: 0 }));
    const stays = found.rows.map((row): SpeedStay => {
      const seconds = BigInt(row.seconds);
      const entry = branches.get(row.branch_id) ?? {
        name: row.branch_name,
        isActive: row.branch_active,
        sums: bySteps((): Sum => ({ seconds: 0n, count: 0 })),
      };
      entry.sums[row.step] = {
        seconds: entry.sums[row.step].seconds + seconds,
        count: entry.sums[row.step].count + 1,
      };
      branches.set(row.branch_id, entry);
      all[row.step] = { seconds: all[row.step].seconds + seconds, count: all[row.step].count + 1 };
      return {
        orderId: row.order_id,
        orderNumber: row.order_number,
        branchCode: row.branch_code,
        step: row.step,
        enteredAt: new Date(row.entered_at),
        leftAt: new Date(row.left_at),
        leftOn: row.left_on,
        hours: averageHours(seconds, 1)!,
        decision: row.decision,
      };
    });

    const pages = Math.max(1, Math.ceil(stays.length / REPORT_PAGE_SIZE));
    const shown = page === "all" ? 1 : Math.min(page, pages);
    return {
      range: params.range,
      branches: [...branches.entries()]
        .map(([branchId, entry]) => ({
          branchId,
          name: entry.name,
          isActive: entry.isActive,
          steps: bySteps((step) => hoursOf(entry.sums[step])),
        }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.branchId.localeCompare(b.branchId)),
      all: bySteps((step) => hoursOf(all[step])),
      stayCount: stays.length,
      page: shown,
      pages,
      stays:
        page === "all"
          ? stays
          : stays.slice((shown - 1) * REPORT_PAGE_SIZE, shown * REPORT_PAGE_SIZE),
    };
  });
}
