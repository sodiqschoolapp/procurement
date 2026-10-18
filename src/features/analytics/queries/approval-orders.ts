import { type SQL, sql } from "drizzle-orm";

import { type Period, averageHours, waitingGroup } from "@/domain/analytics";
import type { ApprovalStep, StayDecision } from "@/domain/approval-stays";
import type { Executor } from "@/server/authorize";
import { now } from "@/server/clock";
import { readSnapshot } from "@/server/read-snapshot";

import {
  type AnalyticsFilters,
  type DrillKey,
  type PeriodInput,
  RECORDS_PAGE_SIZE,
} from "../period-params";
import { authorizeAnalytics } from "../authorize-filters";
import { PeriodRefusedError, resolvePeriod } from "../resolve-period";
import { stepsWhere } from "../steps-where";

// The list behind an Approval speed number, /analytics/approvals (10-notifications-analytics-
// reports.md, Analytics page per role, point 3: "Every number can be traced to its source";
// build-plan 6.4b; plan of 6.4b, decided item 12). A `step` key lists the stays decided in the
// period at a step (or every step), of one decision, of one reason key; a `waiting` key the orders
// waiting now at a step in an age group; a `mine` key the stays the user decided in the period,
// the Principal's "my average time to decide" (plan of 6.5a, decided item 3). The rows are those of `analytics_steps` under the same
// stepsWhere() as the number, branch and draft walls in the SQL, so their count is the number
// clicked and their average its hours. Names read live. 50 a page (developer-rules.md rule 12), or
// every row for the export. Under `data.view`, in one snapshot.

export type ApprovalRow = {
  orderId: string;
  orderNumber: string;
  productName: string;
  subtypeName: string | null;
  branchName: string;
  step: ApprovalStep;
  enteredAt: Date;
  /** `null` for an order waiting now. */
  leftAt: Date | null;
  /** The stay's hours, or how long it has waited now. */
  hours: string;
  decision: StayDecision | null;
  reason: string | null;
};

export type ApprovalOrders = {
  period: Period;
  key: Extract<DrillKey, { kind: "step" | "waiting" | "mine" }>;
  reason: string | null;
  count: number;
  /** The average hours of the stays listed (`averageHours()` of their sum and count). */
  hours: string | null;
  page: number;
  rows: ApprovalRow[];
};

type Row = {
  order_id: string;
  number: string;
  product_name: string;
  subtype_name: string | null;
  branch_name: string;
  step: ApprovalStep;
  entered_at: Date;
  left_at: Date | null;
  seconds: string | null;
  decision: StayDecision | null;
  reason: string | null;
};

/**
 * Throws AuthorizationError for another branch's filter, PeriodRefusedError for a key that names
 * no Approval speed number.
 */
export async function getApprovalOrders(
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
  key: DrillKey,
  reason: string | null,
  page: number | "all",
): Promise<ApprovalOrders> {
  return readSnapshot((db) => ordersIn(db, userId, input, filters, key, reason, page));
}

async function ordersIn(
  db: Executor,
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
  key: DrillKey,
  reason: string | null,
  page: number | "all",
): Promise<ApprovalOrders> {
  if (key.kind !== "step" && key.kind !== "waiting" && key.kind !== "mine") {
    throw new PeriodRefusedError();
  }
  if (
    reason !== null &&
    (key.kind !== "step" || key.decision === null || key.decision === "APPROVE")
  ) {
    throw new PeriodRefusedError();
  }
  const actor = await authorizeAnalytics(db, userId, filters);
  const { period } = await resolvePeriod(db, input);
  const where = sql.join(
    [
      stepsWhere(actor, key.kind === "waiting" ? "open" : period, filters) ?? sql`true`,
      key.kind !== "mine" && key.step ? sql`analytics_steps.step = ${key.step}` : sql`true`,
      // The stays the user decided: "my average time to decide" (plan of 6.5a, decided item 3).
      key.kind === "mine" ? sql`analytics_steps.decided_by = ${userId}` : sql`true`,
      key.kind === "step" && key.decision
        ? sql`analytics_steps.decision = ${key.decision}`
        : sql`true`,
      reason ? sql`analytics_steps.reason_key = ${reason}` : sql`true`,
    ],
    sql` and `,
  );
  const select = (rest: SQL) =>
    db.execute<Row>(sql`
    select analytics_steps.order_id, o.number, pr.name as product_name,
           case when v.is_default then null else v.name end as subtype_name,
           b.name as branch_name, analytics_steps.step, analytics_steps.entered_at,
           analytics_steps.left_at, analytics_steps.seconds::text as seconds,
           analytics_steps.decision, analytics_steps.reason
    from analytics_steps
    join orders o on o.id = analytics_steps.order_id
    join product_variants v on v.id = o.variant_id
    join products pr on pr.id = v.product_id
    join branches b on b.id = analytics_steps.branch_id
    where ${where}
    ${rest}`);
  const pageNumber = page === "all" ? 1 : page;
  const moment = now();
  const rowOf = (row: Row): ApprovalRow => ({
    orderId: row.order_id,
    orderNumber: row.number,
    productName: row.product_name,
    subtypeName: row.subtype_name,
    branchName: row.branch_name,
    step: row.step,
    enteredAt: new Date(row.entered_at),
    leftAt: row.left_at ? new Date(row.left_at) : null,
    hours:
      averageHours(
        row.seconds !== null
          ? BigInt(row.seconds)
          : BigInt(Math.floor((moment.getTime() - new Date(row.entered_at).getTime()) / 1000)),
        1,
      ) ?? "0.0",
    decision: row.decision,
    reason: row.reason,
  });
  const slice = <T>(list: T[]) =>
    page === "all" ? list : list.slice((page - 1) * RECORDS_PAGE_SIZE, page * RECORDS_PAGE_SIZE);

  if (key.kind === "waiting") {
    // The open stays are few (the orders at a Waiting step now); the age group is waitingGroup()'s,
    // so the list is filtered here and never by a second copy of its edges in SQL.
    const found = await select(
      sql`order by analytics_steps.entered_at, o.number, analytics_steps.order_id`,
    );
    const inGroup = found.rows.filter(
      (row) => key.group === null || waitingGroup(new Date(row.entered_at), moment) === key.group,
    );
    return {
      period,
      key,
      reason,
      count: inGroup.length,
      hours: null,
      page: pageNumber,
      rows: slice(inGroup).map(rowOf),
    };
  }

  const summary = await db.execute<{ count: string; seconds: string }>(sql`
    select count(*)::text as count, coalesce(sum(analytics_steps.seconds), 0)::text as seconds
    from analytics_steps where ${where}`);
  const count = Number(summary.rows[0]!.count);
  const limit =
    page === "all"
      ? sql``
      : sql`limit ${RECORDS_PAGE_SIZE} offset ${(page - 1) * RECORDS_PAGE_SIZE}`;
  const found = await select(
    sql`order by analytics_steps.left_at desc, o.number, analytics_steps.order_id ${limit}`,
  );
  return {
    period,
    key,
    reason,
    count,
    hours: averageHours(BigInt(summary.rows[0]!.seconds), count),
    page: pageNumber,
    rows: found.rows.map(rowOf),
  };
}
