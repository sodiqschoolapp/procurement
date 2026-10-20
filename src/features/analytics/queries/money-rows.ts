import { sql } from "drizzle-orm";

import { type DateRange, type Period, monthInside } from "@/domain/analytics";
import type { BusinessDate } from "@/domain/business-date";
import type { Executor } from "@/server/authorize";
import { readSnapshot } from "@/server/read-snapshot";

import { authorizeAnalytics } from "../authorize-filters";
import { moneyWhere } from "../money-where";
import {
  type AnalyticsFilters,
  CASH_KINDS,
  type CashKind,
  type PeriodInput,
  RECORDS_PAGE_SIZE,
} from "../period-params";
import { PeriodRefusedError, resolvePeriod } from "../resolve-period";

// /analytics/money, the money rows behind an amount of Finance's Cash block (10-notifications-
// analytics-reports.md, Analytics page per role, point 3; build-plan 6.6a; plan of 6.6a, decided
// items 2 and 10): the rows of `analytics_money` of one cash kind in the period or one month of it,
// under the same moneyWhere() as the amount, so their Σ is the amount clicked. The action's
// document number, the order, product and Manager are read live. Under `data.view`, the branch
// wall in the SQL, in one snapshot; newest first, 25 a page, or every row for the export.

export type MoneyRowLine = {
  moneyRowId: string;
  occurredOn: BusinessDate;
  documentNo: string | null;
  orderId: string;
  orderNumber: string;
  productName: string;
  subtypeName: string | null;
  branchName: string;
  managerName: string;
  amount: bigint;
};

export type MoneyRowList = {
  money: CashKind;
  month: string | null;
  period: Period;
  count: number;
  total: bigint;
  page: number;
  rows: MoneyRowLine[];
};

type Row = {
  money_row_id: string;
  occurred_on: string;
  document_no: string | null;
  order_id: string;
  number: string;
  product_name: string;
  subtype_name: string | null;
  branch_name: string;
  manager_name: string;
  amount: string;
};

/**
 * Throws AuthorizationError for another branch's filter, PeriodRefusedError for a bad period or a
 * month outside it.
 */
export async function getMoneyRows(
  userId: string,
  money: CashKind,
  month: string | null,
  input: PeriodInput,
  filters: AnalyticsFilters,
  page: number | "all",
): Promise<MoneyRowList> {
  return readSnapshot((db) => rowsIn(db, userId, money, month, input, filters, page));
}

async function rowsIn(
  db: Executor,
  userId: string,
  money: CashKind,
  month: string | null,
  input: PeriodInput,
  filters: AnalyticsFilters,
  page: number | "all",
): Promise<MoneyRowList> {
  const actor = await authorizeAnalytics(db, userId, filters);
  const { period } = await resolvePeriod(db, input);
  let range: DateRange = period;
  if (month) {
    const inside = monthInside(month, period);
    if (!inside) throw new PeriodRefusedError();
    range = inside;
  }
  const where = moneyWhere(actor, range, filters, CASH_KINDS[money]);
  const summary = await db.execute<{ count: number; total: string }>(sql`
    select count(*)::int as count, coalesce(sum(amount), 0)::text as total
    from analytics_money where ${where}`);
  const found = await db.execute<Row>(sql`
    select analytics_money.money_row_id, analytics_money.occurred_on::text as occurred_on,
           a.document_no, analytics_money.order_id, o.number, pr.name as product_name,
           case when v.is_default then null else v.name end as subtype_name,
           b.name as branch_name, u.full_name as manager_name,
           analytics_money.amount::text as amount
    from analytics_money
    join money_rows r on r.id = analytics_money.money_row_id
    join money_actions a on a.id = r.money_action_id
    join orders o on o.id = analytics_money.order_id
    join product_variants v on v.id = o.variant_id
    join products pr on pr.id = v.product_id
    join branches b on b.id = analytics_money.branch_id
    join users u on u.id = analytics_money.manager_id
    where ${where}
    order by analytics_money.occurred_on desc, o.number, analytics_money.money_row_id
    ${page === "all" ? sql`` : sql`limit ${RECORDS_PAGE_SIZE} offset ${(page - 1) * RECORDS_PAGE_SIZE}`}`);
  return {
    money,
    month,
    period,
    count: summary.rows[0]!.count,
    total: BigInt(summary.rows[0]!.total),
    page: page === "all" ? 1 : page,
    rows: found.rows.map((row) => ({
      moneyRowId: row.money_row_id,
      occurredOn: row.occurred_on,
      documentNo: row.document_no,
      orderId: row.order_id,
      orderNumber: row.number,
      productName: row.product_name,
      subtypeName: row.subtype_name,
      branchName: row.branch_name,
      managerName: row.manager_name,
      amount: BigInt(row.amount),
    })),
  };
}
