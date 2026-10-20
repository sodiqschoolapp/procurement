import { sql } from "drizzle-orm";

import { type CashAgeBand, cashAgeBand } from "@/domain/analytics";
import type { BusinessDate } from "@/domain/business-date";
import { managerCashBalance } from "@/domain/money-ledger";
import type { RequestStatus } from "@/domain/request-status";
import type { Executor } from "@/server/authorize";
import { readSnapshot } from "@/server/read-snapshot";

import { type AnalyticsFilters, type CashSide, RECORDS_PAGE_SIZE } from "../period-params";
import { authorizeAnalytics } from "../authorize-filters";
import { cashWhere } from "../cash-where";
import { daysOut } from "../days-out";

// /analytics/cash, the orders behind a "cash held" number of the Managers block (10-notifications-
// analytics-reports.md, Analytics page per role, point 3; build-plan 6.4c; plan of 6.4c, decided
// items 4 and 7). The rows of `analytics_cash` under the same cashWhere() as the number, oldest
// first as Money with managers lists them; the held amount is `managerCashBalance()` of them all,
// "held for" from the oldest since, so the summary is the number clicked. A number of now: no
// period. Under `data.view`, the branch wall and the live status in the SQL, in one snapshot; the
// rows are few (open orders holding cash), so they are read whole and paged here, 25 a page.
// Task 6.6a adds the orders behind one amount of Finance's "money with managers by age" (plan of
// 6.6a, decided item 3, Look first): held (a count above 0) or owed (below 0), never netted, of one
// age band by `cashAgeBand()` of the days since; `held` and `owed` are `managerCashBalance()` of
// the rows, so the summary is the amount clicked.

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

/** One amount of "money with managers by age" (plan of 6.6a, decided item 3). */
export type CashAge = { band: CashAgeBand; side: CashSide };

export type CashOrders = {
  count: number;
  held: bigint;
  owed: bigint;
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
  age: CashAge | null = null,
): Promise<CashOrders> {
  return readSnapshot((db) => ordersIn(db, userId, filters, otherOwners, page, age));
}

async function ordersIn(
  db: Executor,
  userId: string,
  filters: AnalyticsFilters,
  otherOwners: boolean,
  page: number | "all",
  age: CashAge | null,
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
    where ${cashWhere(actor, filters, otherOwners, age !== null)}
    order by analytics_cash.since, o.number, analytics_cash.order_id`);
  const all = found.rows.map((row) => ({
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
  const rows =
    age === null
      ? all
      : all.filter(
          (row) =>
            (age.side === "held" ? row.cashCount > 0n : row.cashCount < 0n) &&
            cashAgeBand(daysOut(row.since)) === age.band,
        );
  const balance = managerCashBalance(rows);
  const heldSince = rows[0]?.since ?? null;
  return {
    count: rows.length,
    held: balance.held,
    owed: balance.owed,
    heldSince,
    heldDays: heldSince === null ? null : daysOut(heldSince),
    page: page === "all" ? 1 : page,
    rows:
      page === "all" ? rows : rows.slice((page - 1) * RECORDS_PAGE_SIZE, page * RECORDS_PAGE_SIZE),
  };
}
