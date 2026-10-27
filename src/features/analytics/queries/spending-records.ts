import { sql } from "drizzle-orm";

import { type DateRange, type Period, monthInside } from "@/domain/analytics";
import type { BusinessDate } from "@/domain/business-date";
import { unitPriceOf } from "@/domain/purchases";
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
// are read live. Under `data.view`, the branch wall in the SQL, in one snapshot; 25 a page
// (developer-rules.md rule 12), or every row for the export. A price key of 6.4b lists the priced
// records of one subtype (a gift is no price), with their quantity and unit price, and its summary
// is the price `unitPriceOf()` of their goods and quantity, the number clicked (plan of 6.4b,
// decided items 1 and 12). A `priced` key of 6.5b lists the priced records of one product (every
// subtype bought) or of all, the set My estimates reads, and its summary carries their Σ quantity
// and Σ goods (plan of 6.5b, decided items 4 and 8; review of the plan, Should fix 2). Task 6.6b
// adds Finance's records without a receipt (`noreceipt`) and a payment type's parts of the records
// with no supplier (plan of 6.6b, decided items 1, 4 and 8).

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
  qty: string;
  unitPrice: bigint;
  amount: bigint;
};

export type SpendingRecords = {
  period: Period;
  /** The dates the number counts: the period, or its days of one month. */
  range: DateRange;
  key: DrillKey;
  /** The category of a category key, by name. */
  categoryName: string | null;
  /** The product of a product key, by name (plan of 6.5a, decided item 7). */
  productName: string | null;
  count: number;
  total: bigint;
  /** Of a priced key: the quantity and the goods of the records listed. */
  priced: { qty: string; goods: bigint } | null;
  /** Of a price key: the subtype, the quantity and the price of the records listed. */
  price: {
    productName: string;
    subtypeName: string | null;
    qty: string;
    price: bigint | null;
  } | null;
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
  // The keys of Plan vs actual, Approval speed and the Principal's Orders and My approvals name
  // no records (their lists are /analytics/orders, /analytics/approvals and
  // /analytics/order-status).
  if (
    key.kind === "colour" ||
    key.kind === "overspent" ||
    key.kind === "saved" ||
    key.kind === "step" ||
    key.kind === "waiting" ||
    key.kind === "status" ||
    key.kind === "due" ||
    key.kind === "mine" ||
    key.kind === "approved" ||
    key.kind === "settled"
  ) {
    throw new PeriodRefusedError();
  }
  if (key.kind === "price") {
    if (key.month) {
      const inside = monthInside(key.month, period);
      if (!inside) throw new PeriodRefusedError();
      range = inside;
    }
    // A supplier filter and the records with no supplier name no number of the page.
    if (key.noSupplier && filters.supplier) throw new PeriodRefusedError();
  }
  // The same for the parts of a payment type with no supplier (plan of 6.6b, decided item 8).
  if (key.kind === "payment" && key.noSupplier && filters.supplier) {
    throw new PeriodRefusedError();
  }
  // My estimates reads the records of orders with a planned price; `unpriced` lists the others,
  // which it leaves out and counts (08 Numbers; plan of 2.5d-c, review correction 2).
  const plan =
    key.kind === "priced"
      ? sql`and exists (select 1 from orders po where po.id = analytics_spending.order_id
                          and po.planned_price is ${key.unpriced ? sql`null` : sql`not null`})`
      : sql``;
  const where =
    key.kind === "price"
      ? sql`${spendingWhere(actor, range, scope)}
            and analytics_spending.variant_id = ${key.variant}
            and analytics_spending.unit_price > 0
            ${key.noSupplier ? sql`and analytics_spending.supplier_id is null` : sql``}`
      : key.kind === "product" || (key.kind === "priced" && key.product)
        ? // Every subtype of the product, as "top 10 products" adds them (decided item 7).
          sql`${spendingWhere(actor, range, scope)}
            and analytics_spending.variant_id in
              (select id from product_variants where product_id = ${key.product})
            ${key.kind === "priced" ? sql`and analytics_spending.unit_price > 0 ${plan}` : sql``}`
        : key.kind === "priced"
          ? sql`${spendingWhere(actor, range, scope)} and analytics_spending.unit_price > 0 ${plan}`
          : key.kind === "noreceipt"
            ? // Finance's purchases without a receipt (plan of 6.6b, decided item 4).
              sql`${spendingWhere(actor, range, scope)} and not analytics_spending.has_receipt`
            : key.kind === "payment" && key.noSupplier
              ? // Bank transfers with no supplier (plan of 6.6b, decided item 1).
                sql`${spendingWhere(actor, range, scope)} and analytics_spending.supplier_id is null`
              : spendingWhere(actor, range, scope);
  // A payment type's list holds the records with a part of that type, each with that part, so
  // its total is the slice clicked (plan of 6.4, decided item 2, Look first).
  const part =
    key.kind === "payment"
      ? sql`join analytics_spending_payments pp
              on pp.purchase_id = analytics_spending.purchase_id
             and pp.payment_type = ${key.payment}`
      : sql``;
  const amount = key.kind === "payment" ? sql`pp.amount` : sql`analytics_spending.amount`;

  const summary = await db.execute<{
    count: string;
    total: string;
    goods: string;
    qty: string;
  }>(sql`
    select count(*)::text as count, coalesce(sum(${amount}), 0)::text as total,
           coalesce(sum(analytics_spending.goods), 0)::text as goods,
           coalesce(sum(analytics_spending.qty), 0)::text as qty
    from analytics_spending ${part} where ${where}`);
  const subtype =
    key.kind === "price"
      ? await db.execute<{ product_name: string; subtype_name: string | null }>(sql`
          select pr.name as product_name,
                 case when v.is_default then null else v.name end as subtype_name
          from product_variants v join products pr on pr.id = v.product_id
          where v.id = ${key.variant}`)
      : null;
  if (subtype && !subtype.rows[0]) throw new PeriodRefusedError();
  const category =
    key.kind === "category"
      ? await db.execute<{ name: string }>(
          sql`select name from categories where id = ${key.category}`,
        )
      : null;
  const productId =
    key.kind === "product" ? key.product : key.kind === "priced" ? key.product : null;
  const product =
    productId !== null
      ? await db.execute<{ name: string }>(sql`select name from products where id = ${productId}`)
      : null;
  if (product && !product.rows[0]) throw new PeriodRefusedError();
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
    qty: string;
    unit_price: string;
    amount: string;
  }>(sql`
    select analytics_spending.purchase_id, analytics_spending.order_id, o.number,
           pr.name as product_name,
           case when v.is_default then null else v.name end as subtype_name,
           b.name as branch_name, analytics_spending.purchased_on::text as purchased_on,
           co.name as supplier_name, analytics_spending.qty::text as qty,
           analytics_spending.unit_price::text as unit_price, ${amount}::text as amount
    from analytics_spending
    ${part}
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
    productName: product?.rows[0]?.name ?? null,
    priced:
      key.kind === "priced"
        ? { qty: summary.rows[0]!.qty, goods: BigInt(summary.rows[0]!.goods) }
        : null,
    count: Number(summary.rows[0]!.count),
    total: BigInt(summary.rows[0]!.total),
    price: subtype?.rows[0]
      ? {
          productName: subtype.rows[0].product_name,
          subtypeName: subtype.rows[0].subtype_name,
          qty: summary.rows[0]!.qty,
          price: unitPriceOf(BigInt(summary.rows[0]!.goods), summary.rows[0]!.qty),
        }
      : null,
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
      qty: row.qty,
      unitPrice: BigInt(row.unit_price),
      amount: BigInt(row.amount),
    })),
  };
}
