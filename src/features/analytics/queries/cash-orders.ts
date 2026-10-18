import { sql } from "drizzle-orm";

import { daysOf } from "@/domain/analytics";
import type { BusinessDate } from "@/domain/business-date";
import { managerCashBalance } from "@/domain/money-ledger";
import type { RequestStatus } from "@/domain/request-status";
import type { Executor } from "@/server/authorize";
import { today } from "@/server/clock";
import { readSnapshot } from "@/server/read-snapshot";

import { type AnalyticsFilters, RECORDS_PAGE_SIZE } from "../period-params";
import { authorizeAnalytics } from "../authorize-filters";
import { cashWhere } from "../cash-where";

// /analytics/cash, the orders behind a "cash held" number of the Managers block (10-notifications-
// analytics-reports.md, Analytics page per role, point 3; build-plan 6.4c; plan of 6.4c, decided
// items 4 and 7). The rows of `analytics_cash` under the same cashWhere() as the number, oldest
// first as Money with managers lists them; the held amount is `managerCashBalance()` of them all,
// "held for" from the oldest since, so the summary is the number clicked. A number of now: no
// period. Under `data.view`, the branch wall and the live status in the SQL, in one snapshot; the
// rows are few (open orders holding cash), so they are read whole and paged here, 50 a page.

export type CashOrder = {
  orderId: string;
  orderNumber: string;
  productName: string;
  subtypeName: string | null;
  branchName: string;
  ownerName: string;
  status: RequestStatus;
  cashCount: bigint;
  since: BusinessDate;
};

export type CashOrders = {
  count: number;
  held: bigint;
  heldSince: BusinessDate | null;
  heldDays: number | null;
  page: number;
  rows: CashOrder[];
};

type Row = {
  order_id: string;
  number: string;
  product_name: string;
  subtype_name: string | null;
  branch_name: string;
  owner_name: string;
  status: RequestStatus;
  cash_count: string;
  since: string;
};

/** Throws AuthorizationError for another branch's filter. */
export async function getCashOrders(
  userId: string,
  filters: AnalyticsFilters,
  otherOwners: boolean,
  page: number | "all",
): Promise<CashOrders> {
  return readSnapshot((db) => ordersIn(db, userId, filters, otherOwners, page));
}

async function ordersIn(
  db: Executor,
  userId: string,
  filters: AnalyticsFilters,
  otherOwners: boolean,
  page: number | "all",
): Promise<CashOrders> {
  const actor = await authorizeAnalytics(db, userId, filters);
  const found = await db.execute<Row>(sql`
    select analytics_cash.order_id, o.number, pr.name as product_name,
           case when v.is_default then null else v.name end as subtype_name,
           b.name as branch_name, u.full_name as owner_name, o.status,
           analytics_cash.cash_count::text as cash_count, analytics_cash.since::text as since
    from analytics_cash
    join orders o on o.id = analytics_cash.order_id
    join product_variants v on v.id = o.variant_id
    join products pr on pr.id = v.product_id
    join branches b on b.id = analytics_cash.branch_id
    join users u on u.id = analytics_cash.owner_id
    where ${cashWhere(actor, filters, otherOwners)}
    order by analytics_cash.since, o.number, analytics_cash.order_id`);
  const rows = found.rows.map((row) => ({
    orderId: row.order_id,
    orderNumber: row.number,
    productName: row.product_name,
    subtypeName: row.subtype_name,
    branchName: row.branch_name,
    ownerName: row.owner_name,
    status: row.status,
    cashCount: BigInt(row.cash_count),
    since: row.since,
  }));
  const heldSince = rows[0]?.since ?? null;
  return {
    count: rows.length,
    held: managerCashBalance(rows).held,
    heldSince,
    // daysOf() counts both ends: the same day is 0 days held.
    heldDays: heldSince === null ? null : daysOf({ first: heldSince, last: today() }) - 1,
    page: page === "all" ? 1 : page,
    rows:
      page === "all" ? rows : rows.slice((page - 1) * RECORDS_PAGE_SIZE, page * RECORDS_PAGE_SIZE),
  };
}
