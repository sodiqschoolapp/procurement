import { sql } from "drizzle-orm";

import { type Period, averageHours } from "@/domain/analytics";
import type { BusinessDate } from "@/domain/business-date";
import type { ListStatus } from "@/domain/order-list";
import { isOverdue } from "@/domain/order-steps";
import type { OrderProgress } from "@/domain/purchases";
import type { Executor } from "@/server/authorize";
import { today } from "@/server/clock";
import { readSnapshot } from "@/server/read-snapshot";

import {
  type AnalyticsFilters,
  type DrillKey,
  type PeriodInput,
  RECORDS_PAGE_SIZE,
} from "../period-params";
import { authorizeAnalytics } from "../authorize-filters";
import { ordersWhere } from "../orders-where";
import { PeriodRefusedError, resolvePeriod } from "../resolve-period";

// The list behind an Orders number of the Principal's page, /analytics/order-status
// (10-notifications-analytics-reports.md, Analytics page per role, point 3: "Every number can be
// traced to its source"; build-plan 6.5a; plan of 6.5a, decided item 6). A `status` key lists the
// orders first submitted in the period at that status now, or at any status for `status:all`, the
// Orders total (build-plan 6.5a-2); a `due` key the orders coming up or
// overdue now; the Manager's `approved` key (build-plan 6.5b; plan of 6.5b, decided items 1 and 8)
// the orders that first entered Open in the period, each with its hours from the first submit,
// and their average `averageHours()` of Σ seconds and count, the number clicked. The rows are those of `analytics_orders` under the same ordersWhere() as the
// number, branch and draft walls in the SQL, so their count is the number clicked. Names read
// live. 50 a page (developer-rules.md rule 12), or every row for the export. Under `data.view`, in
// one snapshot.

export type StatusOrderRow = {
  orderId: string;
  orderNumber: string;
  productName: string;
  subtypeName: string | null;
  departmentName: string;
  branchName: string;
  status: ListStatus;
  submittedOn: BusinessDate;
  neededBy: BusinessDate;
  /** The order shows "Overdue" (isOverdue() on the clock's today). */
  overdue: boolean;
  /** Of the `approved` key: the day it first entered Open and its hours from the first submit. */
  openedOn: BusinessDate | null;
  approvalHours: string | null;
};

export type StatusOrders = {
  period: Period;
  today: BusinessDate;
  key: Extract<DrillKey, { kind: "status" | "due" | "approved" }>;
  count: number;
  /** Of the `approved` key: the average hours of the listed orders. */
  hours: string | null;
  page: number;
  rows: StatusOrderRow[];
};

/**
 * The orders behind one number. `page: "all"` gives every row (the export). Throws
 * AuthorizationError for another branch's filter, PeriodRefusedError for a key of another list.
 */
export async function getStatusOrders(
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
  key: DrillKey,
  page: number | "all",
): Promise<StatusOrders> {
  return readSnapshot((db) => statusOrdersIn(db, userId, input, filters, key, page));
}

type Row = {
  order_id: string;
  number: string;
  product_name: string;
  subtype_name: string | null;
  department_name: string;
  branch_name: string;
  status: ListStatus;
  progress: OrderProgress;
  submitted_on: string;
  needed_by: string;
  opened_on: string | null;
  approval_seconds: string | null;
};

async function statusOrdersIn(
  db: Executor,
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
  key: DrillKey,
  page: number | "all",
): Promise<StatusOrders> {
  if (key.kind !== "status" && key.kind !== "due" && key.kind !== "approved") {
    throw new PeriodRefusedError();
  }
  const actor = await authorizeAnalytics(db, userId, filters);
  const { period } = await resolvePeriod(db, input);
  const day = today();
  const where =
    key.kind === "status"
      ? key.status === null
        ? ordersWhere(actor, period, filters)
        : sql`${ordersWhere(actor, period, filters)} and analytics_orders.status = ${key.status}`
      : key.kind === "approved"
        ? ordersWhere(actor, { opened: period }, filters)
        : ordersWhere(actor, { due: key.due, today: day }, filters);

  const summary = await db.execute<{ count: string; seconds: string }>(sql`
    select count(*)::text as count, coalesce(sum(approval_seconds), 0)::text as seconds
    from analytics_orders where ${where}`);
  const count = Number(summary.rows[0]!.count);
  const pageNumber = page === "all" ? 1 : page;
  const limit =
    page === "all"
      ? sql``
      : sql`limit ${RECORDS_PAGE_SIZE} offset ${(page - 1) * RECORDS_PAGE_SIZE}`;
  const found = await db.execute<Row>(sql`
    select analytics_orders.order_id, o.number, pr.name as product_name,
           case when v.is_default then null else v.name end as subtype_name,
           d.name as department_name, b.name as branch_name, analytics_orders.status,
           analytics_orders.progress, analytics_orders.submitted_on::text as submitted_on,
           analytics_orders.needed_by::text as needed_by,
           analytics_orders.opened_on::text as opened_on,
           analytics_orders.approval_seconds::text as approval_seconds
    from analytics_orders
    join orders o on o.id = analytics_orders.order_id
    join product_variants v on v.id = o.variant_id
    join products pr on pr.id = v.product_id
    join departments d on d.id = analytics_orders.department_id
    join branches b on b.id = analytics_orders.branch_id
    where ${where}
    order by ${key.kind === "approved" ? sql`analytics_orders.opened_on desc,` : sql``}
             analytics_orders.needed_by, o.number, analytics_orders.order_id
    ${limit}`);

  return {
    period,
    today: day,
    key,
    count,
    hours: key.kind === "approved" ? averageHours(BigInt(summary.rows[0]!.seconds), count) : null,
    page: pageNumber,
    rows: found.rows.map((row) => ({
      orderId: row.order_id,
      orderNumber: row.number,
      productName: row.product_name,
      subtypeName: row.subtype_name,
      departmentName: row.department_name,
      branchName: row.branch_name,
      status: row.status,
      submittedOn: row.submitted_on,
      neededBy: row.needed_by,
      overdue: isOverdue(row.status, row.progress, row.needed_by, day),
      openedOn: key.kind === "approved" ? row.opened_on : null,
      approvalHours:
        key.kind === "approved" && row.approval_seconds !== null
          ? averageHours(BigInt(row.approval_seconds), 1)
          : null,
    })),
  };
}
