import { sql } from "drizzle-orm";

import { type DateRange, type Period, monthInside } from "@/domain/analytics";
import type { BusinessDate } from "@/domain/business-date";
import type { Executor } from "@/server/authorize";
import { readSnapshot } from "@/server/read-snapshot";

import {
  type AnalyticsFilters,
  type DrillKey,
  type PeriodInput,
  RECORDS_PAGE_SIZE,
} from "../period-params";
import { PeriodRefusedError, resolvePeriod } from "../resolve-period";
import { authorizeAnalytics } from "../authorize-filters";
import { spendingWhere } from "../spending-where";

// The drill-down list behind a Spending number (10-notifications-analytics-reports.md, Analytics
// page per role, point 3: "Clicking any bar, slice or number opens the list of orders or records
// that make it up. Every number can be traced to its source"; build-plan 6.3). The rows are those
// of `analytics_spending` under the same spendingWhere() as the number (review of the plan,
// correction 3), so their total is the number clicked (plan of 6.3, decided item 10); the names
// are read live. Under `data.view`, the branch wall in the SQL, in one snapshot; 50 a page
// (developer-rules.md rule 12), or every row for the export.

export type SpendingRecord = {
  purchaseId: string;
  orderId: string;
  orderNumber: string;
  productName: string;
  /** The subtype bought, `null` for a product without subtypes. */
  subtypeName: string | null;
  branchName: string;
  purchasedOn: BusinessDate;
  supplierName: string | null;
  amount: bigint;
};

export type SpendingRecords = {
  period: Period;
  /** The dates the number counts: the period, or its days of one month. */
  range: DateRange;
  key: DrillKey;
  /** The category of a category key, by name. */
  categoryName: string | null;
  count: number;
  total: bigint;
  page: number;
  rows: SpendingRecord[];
};

/**
 * The records behind one number. `page: "all"` gives every row (the export). Throws
 * AuthorizationError for another branch's `branch` filter, PeriodRefusedError for a period or a
 * month the address cannot name.
 */
export async function getSpendingRecords(
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
  key: DrillKey,
  page: number | "all",
): Promise<SpendingRecords> {
  return readSnapshot((db) => recordsIn(db, userId, input, filters, key, page));
}

async function recordsIn(
  db: Executor,
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
  key: DrillKey,
  page: number | "all",
): Promise<SpendingRecords> {
  const actor = await authorizeAnalytics(db, userId, filters);
  const { period } = await resolvePeriod(db, input);

  let range: DateRange = period;
  let scope = filters;
  if (key.kind === "month") {
    const inside = monthInside(key.month, period);
    if (!inside) throw new PeriodRefusedError();
    range = inside;
  }
  if (key.kind === "category") {
    // Another category filter and this key name no number of the page.
    if (filters.category && filters.category !== key.category) throw new PeriodRefusedError();
    scope = { ...filters, category: key.category };
  }
  const where = spendingWhere(actor, range, scope);

  const summary = await db.execute<{ count: string; total: string }>(sql`
    select count(*)::text as count, coalesce(sum(amount), 0)::text as total
    from analytics_spending where ${where}`);
  const category =
    key.kind === "category"
      ? await db.execute<{ name: string }>(
          sql`select name from categories where id = ${key.category}`,
        )
      : null;
  const pageNumber = page === "all" ? 1 : page;
  const limit =
    page === "all"
      ? sql``
      : sql`limit ${RECORDS_PAGE_SIZE} offset ${(page - 1) * RECORDS_PAGE_SIZE}`;
  const rows = await db.execute<{
    purchase_id: string;
    order_id: string;
    number: string;
    product_name: string;
    subtype_name: string | null;
    branch_name: string;
    purchased_on: string;
    supplier_name: string | null;
    amount: string;
  }>(sql`
    select analytics_spending.purchase_id, analytics_spending.order_id, o.number,
           pr.name as product_name,
           case when v.is_default then null else v.name end as subtype_name,
           b.name as branch_name, analytics_spending.purchased_on::text as purchased_on,
           co.name as supplier_name, analytics_spending.amount::text as amount
    from analytics_spending
    join orders o on o.id = analytics_spending.order_id
    join purchases p on p.id = analytics_spending.purchase_id
    join product_variants v on v.id = p.variant_id
    join products pr on pr.id = v.product_id
    join branches b on b.id = analytics_spending.branch_id
    left join companies co on co.id = analytics_spending.supplier_id
    where ${where}
    order by analytics_spending.purchased_on desc, o.number, analytics_spending.purchase_id
    ${limit}`);

  return {
    period,
    range,
    key,
    categoryName: category?.rows[0]?.name ?? null,
    count: Number(summary.rows[0]!.count),
    total: BigInt(summary.rows[0]!.total),
    page: pageNumber,
    rows: rows.rows.map((row) => ({
      purchaseId: row.purchase_id,
      orderId: row.order_id,
      orderNumber: row.number,
      productName: row.product_name,
      subtypeName: row.subtype_name,
      branchName: row.branch_name,
      purchasedOn: row.purchased_on,
      supplierName: row.supplier_name,
      amount: BigInt(row.amount),
    })),
  };
}
