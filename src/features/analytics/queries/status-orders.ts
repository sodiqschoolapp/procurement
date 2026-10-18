import { sql } from "drizzle-orm";

import type { Period } from "@/domain/analytics";
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
// orders first submitted in the period at that status now; a `due` key the orders coming up or
// overdue now. The rows are those of `analytics_orders` under the same ordersWhere() as the
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
};

export type StatusOrders = {
  period: Period;
  today: BusinessDate;
  key: Extract<DrillKey, { kind: "status" | "due" }>;
  count: number;
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
};

async function statusOrdersIn(
  db: Executor,
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
  key: DrillKey,
  page: number | "all",
): Promise<StatusOrders> {
  if (key.kind !== "status" && key.kind !== "due") throw new PeriodRefusedError();
  const actor = await authorizeAnalytics(db, userId, filters);
  const { period } = await resolvePeriod(db, input);
  const day = today();
  const where =
    key.kind === "status"
      ? sql`${ordersWhere(actor, period, filters)} and analytics_orders.status = ${key.status}`
      : ordersWhere(actor, { due: key.due, today: day }, filters);

  const summary = await db.execute<{ count: string }>(sql`
    select count(*)::text as count from analytics_orders where ${where}`);
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
           analytics_orders.needed_by::text as needed_by
    from analytics_orders
    join orders o on o.id = analytics_orders.order_id
    join product_variants v on v.id = o.variant_id
    join products pr on pr.id = v.product_id
    join departments d on d.id = analytics_orders.department_id
    join branches b on b.id = analytics_orders.branch_id
    where ${where}
    order by analytics_orders.needed_by, o.number, analytics_orders.order_id
    ${limit}`);

  return {
    period,
    today: day,
    key,
    count: Number(summary.rows[0]!.count),
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
    })),
  };
}
