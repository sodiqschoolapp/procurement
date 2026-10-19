import { sql } from "drizzle-orm";

import { CASH_AGE_BAND_KEYS, type CashAgeBand, cashAgeBand } from "@/domain/analytics";
import {
  type ManagerBlock,
  type ManagerOrder,
  managerBalances,
  managerCashBalance,
} from "@/domain/money-ledger";
import type { RequestStatus } from "@/domain/request-status";
import { readSnapshot } from "@/server/read-snapshot";

import { authorizeAnalytics } from "../../analytics/authorize-filters";
import { cashWhere } from "../../analytics/cash-where";
import { daysOut } from "../../analytics/days-out";
import type { CashAgeRow } from "../../analytics/queries/finance-cash";
import { REPORT_PAGE_SIZE, type ReportParams } from "../report-params";

// The Money with managers report (10-notifications-analytics-reports.md, Reports: "Open cash
// balances and their age"; 08-money-and-settlement.md, Money with managers; build-plan 6.9b).
// Under `data.view` for every role in its own branches (plan of 6.9b, decided item 1, Look first),
// read from `analytics_cash` under cashWhere(…, owed = true): each order's `orderCashCount()` and
// `since`, the order's live status not Draft or Closed, the branch wall inside the SQL (decided
// item 2, Look first). A number of now: the dates do not change it (decided item 3, Look first).
// The owners' blocks are `managerBalances()`, the /money page's own grouping, held and owed apart
// and oldest first (review of the plan, Should fix 1); the days are `daysOut()` and the bands
// `cashAgeBand()` with held and owed of each band by `managerCashBalance()`, as Finance's Cash
// block. In one snapshot; the orders 25 a page in the blocks' order, or all for the file.

export type CashReportOrder = ManagerOrder & {
  branchCode: string;
  productName: string;
  /** `null` for the hidden default subtype. */
  subtypeName: string | null;
  /** Whole Tashkent days from `since` to today. */
  days: number;
  band: CashAgeBand;
};

export type CashReportOwner = Omit<ManagerBlock<CashReportOrder>, "orders"> & {
  ownerIsActive: boolean;
  days: number;
  orderCount: number;
};

export type MoneyWithManagersReport = {
  owners: CashReportOwner[];
  /** Every owner together, held and owed apart. */
  held: bigint;
  owed: bigint;
  ages: CashAgeRow[];
  orderCount: number;
  page: number;
  pages: number;
  orders: CashReportOrder[];
};

type Row = {
  order_id: string;
  number: string;
  status: RequestStatus;
  owner_id: string;
  owner_name: string;
  owner_is_active: boolean;
  branch_code: string;
  product_name: string;
  subtype_name: string | null;
  cash_count: string;
  since: string;
};

/** Throws AuthorizationError for another branch's `branch` filter. */
export async function getMoneyWithManagersReport(
  userId: string,
  params: Pick<ReportParams, "filters">,
  page: number | "all",
): Promise<MoneyWithManagersReport> {
  return readSnapshot(async (db) => {
    const actor = await authorizeAnalytics(db, userId, params.filters);
    const found = await db.execute<Row>(sql`
      select analytics_cash.order_id, o.number, o.status, analytics_cash.owner_id,
             u.full_name as owner_name, u.is_active as owner_is_active, b.code as branch_code,
             pr.name as product_name,
             case when v.is_default then null else v.name end as subtype_name,
             analytics_cash.cash_count::text as cash_count, analytics_cash.since::text as since
      from analytics_cash
      join orders o on o.id = analytics_cash.order_id
      join users u on u.id = analytics_cash.owner_id
      join branches b on b.id = analytics_cash.branch_id
      join product_variants v on v.id = o.variant_id
      join products pr on pr.id = v.product_id
      where ${cashWhere(actor, params.filters, false, true)}`);
    const active = new Map<string, boolean>();
    const counted = found.rows.map((row): CashReportOrder => {
      active.set(row.owner_id, row.owner_is_active);
      const days = daysOut(row.since);
      return {
        id: row.order_id,
        number: row.number,
        ownerId: row.owner_id,
        ownerName: row.owner_name,
        status: row.status,
        cashCount: BigInt(row.cash_count),
        since: row.since,
        branchCode: row.branch_code,
        productName: row.product_name,
        subtypeName: row.subtype_name,
        days,
        band: cashAgeBand(days),
      };
    });

    const blocks = managerBalances(counted);
    const orders = blocks.flatMap((block) => block.orders);
    const all = managerCashBalance(orders);
    const ages = CASH_AGE_BAND_KEYS.map((band) => {
      const inBand = orders.filter((order) => order.band === band);
      return {
        band,
        ...managerCashBalance(inBand),
        heldCount: inBand.filter((order) => order.cashCount > 0n).length,
        owedCount: inBand.filter((order) => order.cashCount < 0n).length,
      };
    });

    const pages = Math.max(1, Math.ceil(orders.length / REPORT_PAGE_SIZE));
    const shown = page === "all" ? 1 : Math.min(page, pages);
    return {
      owners: blocks.map(({ orders: behind, ...block }) => ({
        ...block,
        ownerIsActive: active.get(block.ownerId) ?? true,
        days: daysOut(block.since),
        orderCount: behind.length,
      })),
      held: all.held,
      owed: all.owed,
      ages,
      orderCount: orders.length,
      page: shown,
      pages,
      orders:
        page === "all"
          ? orders
          : orders.slice((shown - 1) * REPORT_PAGE_SIZE, shown * REPORT_PAGE_SIZE),
    };
  });
}
