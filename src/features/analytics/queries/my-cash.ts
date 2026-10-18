import { sql } from "drizzle-orm";

import type { BusinessDate } from "@/domain/business-date";
import { type CashBalance, managerCashBalance } from "@/domain/money-ledger";
import type { RequestStatus } from "@/domain/request-status";
import type { Executor } from "@/server/authorize";
import { readSnapshot } from "@/server/read-snapshot";

import type { AnalyticsFilters } from "../period-params";
import { authorizeAnalytics } from "../authorize-filters";
import { cashWhere } from "../cash-where";
import { mineOf, withoutManager } from "../mine";

// The Manager's My cash block (10-notifications-analytics-reports.md, Analytics page per role,
// Manager, My cash: "Count per open order"; build-plan 6.5b; plan of 6.5b, decided item 5, Look
// first): each of my orders that is not Draft and not Closed with a cash count away from 0, its
// count `orderCashCount()` as `analytics_cash` holds it, held (above 0) and owed (below 0) alike,
// oldest first as Money with managers lists them; the two totals by `managerCashBalance()`, never
// netted (08 Manager's cash balance). The table is the list behind both totals, each row opening
// its order. A number of now: no period, no change. Under `data.view`, the branch wall and the
// live status in the SQL of cashWhere(), in one snapshot; the rows are few.

export type MyCashOrder = {
  orderId: string;
  orderNumber: string;
  productName: string;
  subtypeName: string | null;
  branchName: string;
  status: RequestStatus;
  cashCount: bigint;
  since: BusinessDate;
};

export type MyCash = CashBalance & { rows: MyCashOrder[] };

/** Throws AuthorizationError for another branch's filter. */
export async function getMyCash(userId: string, filters: AnalyticsFilters): Promise<MyCash> {
  return readSnapshot((db) => myCashIn(db, userId, filters));
}

async function myCashIn(db: Executor, userId: string, filters: AnalyticsFilters): Promise<MyCash> {
  const actor = await authorizeAnalytics(db, userId, withoutManager(filters));
  const found = await db.execute<{
    order_id: string;
    number: string;
    product_name: string;
    subtype_name: string | null;
    branch_name: string;
    status: RequestStatus;
    cash_count: string;
    since: string;
  }>(sql`
    select analytics_cash.order_id, o.number, pr.name as product_name,
           case when v.is_default then null else v.name end as subtype_name,
           b.name as branch_name, o.status, analytics_cash.cash_count::text as cash_count,
           analytics_cash.since::text as since
    from analytics_cash
    join orders o on o.id = analytics_cash.order_id
    join product_variants v on v.id = o.variant_id
    join products pr on pr.id = v.product_id
    join branches b on b.id = analytics_cash.branch_id
    where ${cashWhere(actor, mineOf(filters, userId), false, true)}
    order by analytics_cash.since, o.number, analytics_cash.order_id`);
  const rows = found.rows.map((row) => ({
    orderId: row.order_id,
    orderNumber: row.number,
    productName: row.product_name,
    subtypeName: row.subtype_name,
    branchName: row.branch_name,
    status: row.status,
    cashCount: BigInt(row.cash_count),
    since: row.since,
  }));
  return { ...managerCashBalance(rows), rows };
}
