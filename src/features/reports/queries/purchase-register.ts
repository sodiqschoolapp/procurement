import { sql } from "drizzle-orm";

import type { DateRange } from "@/domain/analytics";
import type { BusinessDate } from "@/domain/business-date";
import type { PaymentType } from "@/domain/payment-types";
import {
  type PurchaseRecord,
  actualExtra,
  actualGoods,
  actualTotal,
  paymentParts,
} from "@/domain/purchases";
import { branchFilter } from "@/server/authorize";
import { purchases } from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";

import { authorizeAnalytics } from "../../analytics/authorize-filters";
import { REPORT_PAGE_SIZE, type ReportParams } from "../report-params";

// The Purchase register (10-notifications-analytics-reports.md, Reports: "Every purchase record
// with supplier, price and payment type"; build-plan 6.8). Read from the live tables (plan of 6.8,
// decided item 2, Look first): every record bought in the dates, cancelled ones marked with their
// reason. Each record's goods, extra costs, total and parts by payment type are actualGoods(),
// actualExtra(), actualTotal() and paymentParts() of src/domain/purchases.ts on that one record,
// as the analytics refresh computes them; a cancelled record's amounts are those of the record
// read as not cancelled (review of the plan, correction 2), and it is in neither the count nor the
// total (Decided ahead, question 3). The category is the record's own subtype's, as Spending reads
// it (review of the plan, correction 1). Under `data.view`, the branch wall inside the SQL, in one
// snapshot; 25 a page (11 rule 8), or every row for the export.

export type RegisterRecord = {
  purchaseId: string;
  orderId: string;
  orderNumber: string;
  purchasedOn: BusinessDate;
  branchName: string;
  /** `null`: an order without a department (05 Fields the Head sets 3). */
  departmentName: string | null;
  ownerName: string;
  productName: string;
  /** The subtype bought, `null` for a product without subtypes. */
  subtypeName: string | null;
  supplierName: string | null;
  qty: string;
  unitPrice: bigint;
  goods: bigint;
  extras: bigint;
  total: bigint;
  /** The record's parts by payment type, in the order of PAYMENT_TYPES, none of 0. */
  parts: { paymentType: PaymentType; amount: bigint }[];
  hasReceipt: boolean;
  /** The cancel's reason, `null` for a record that counts. */
  cancelReason: string | null;
};

export type PurchaseRegister = {
  range: DateRange;
  /** The records that count: not cancelled. */
  count: number;
  total: bigint;
  cancelledCount: number;
  page: number;
  pages: number;
  /** One page, or every record (`"all"`): the counted ones first by date, then the cancelled. */
  rows: RegisterRecord[];
};

type Row = {
  purchase_id: string;
  order_id: string;
  number: string;
  purchased_on: string;
  branch_name: string;
  department_name: string | null;
  owner_name: string;
  product_name: string;
  subtype_name: string | null;
  supplier_name: string | null;
  qty: string;
  unit_price: string;
  payment_type: PaymentType;
  has_receipt: boolean;
  is_cancelled: boolean;
  cancel_reason: string | null;
  extras: { amount: string; payment_type: PaymentType }[];
};

/** Throws AuthorizationError for another branch's `branch` filter. */
export async function getPurchaseRegister(
  userId: string,
  params: Pick<ReportParams, "range" | "filters">,
  page: number | "all",
): Promise<PurchaseRegister> {
  return readSnapshot(async (db) => {
    const actor = await authorizeAnalytics(db, userId, params.filters);
    const { range, filters } = params;
    const found = await db.execute<Row>(sql`
      select purchases.id as purchase_id, purchases.order_id, o.number,
             t.purchased_on::text as purchased_on, b.name as branch_name,
             d.name as department_name, u.full_name as owner_name, pr.name as product_name,
             case when v.is_default then null else v.name end as subtype_name,
             co.name as supplier_name, purchases.qty::text as qty,
             purchases.unit_price::text as unit_price, t.payment_type,
             exists (select 1 from trip_files f where f.trip_id = t.id) as has_receipt,
             purchases.is_cancelled, purchases.cancel_reason,
             coalesce((select jsonb_agg(jsonb_build_object('amount', e.amount::text,
                                                          'payment_type', e.payment_type)
                                        order by e.id)
                       from purchase_extras e where e.purchase_id = purchases.id), '[]')
               as extras
      from purchases
      join purchase_trips t on t.id = purchases.trip_id
      join orders o on o.id = purchases.order_id
      join branches b on b.id = purchases.branch_id
      -- Left: every record, also of an order without a department (05 Fields the Head sets 3).
      left join departments d on d.id = o.department_id
      join users u on u.id = o.owner_id
      join product_variants v on v.id = purchases.variant_id
      join products pr on pr.id = v.product_id
      left join companies co on co.id = t.supplier_id
      where ${branchFilter(actor, purchases.branchId) ?? sql`true`}
        and t.purchased_on between ${range.first} and ${range.last}
        ${filters.branch ? sql`and purchases.branch_id = ${filters.branch}` : sql``}
        ${filters.category ? sql`and pr.category_id = ${filters.category}` : sql``}
      order by purchases.is_cancelled, t.purchased_on desc, o.number, purchases.id`);

    const rows = found.rows.map((row): RegisterRecord => {
      const extras = row.extras.map((extra) => ({
        amount: BigInt(extra.amount),
        paymentType: extra.payment_type,
      }));
      // The record read as not cancelled: its own amounts, also when it was (correction 2).
      const record: PurchaseRecord = {
        qty: row.qty,
        unitPrice: BigInt(row.unit_price),
        extras: extras.map((extra) => extra.amount),
        isCancelled: false,
      };
      return {
        purchaseId: row.purchase_id,
        orderId: row.order_id,
        orderNumber: row.number,
        purchasedOn: row.purchased_on,
        branchName: row.branch_name,
        departmentName: row.department_name,
        ownerName: row.owner_name,
        productName: row.product_name,
        subtypeName: row.subtype_name,
        supplierName: row.supplier_name,
        qty: row.qty,
        unitPrice: record.unitPrice,
        goods: actualGoods([record]),
        extras: actualExtra([record]),
        total: actualTotal([record]),
        parts: paymentParts({
          qty: row.qty,
          unitPrice: record.unitPrice,
          paymentType: row.payment_type,
          extras,
        }),
        hasReceipt: row.has_receipt,
        cancelReason: row.is_cancelled ? (row.cancel_reason ?? "") : null,
      };
    });

    const counted = rows.filter((row) => row.cancelReason === null);
    const pages = Math.max(1, Math.ceil(rows.length / REPORT_PAGE_SIZE));
    const shown = page === "all" ? 1 : Math.min(page, pages);
    return {
      range,
      count: counted.length,
      // actualTotal() of the records that count: each record rounded on its own (08).
      total: actualTotal(
        found.rows
          .filter((row) => !row.is_cancelled)
          .map((row) => ({
            qty: row.qty,
            unitPrice: BigInt(row.unit_price),
            extras: row.extras.map((extra) => BigInt(extra.amount)),
            isCancelled: false,
          })),
      ),
      cancelledCount: rows.length - counted.length,
      page: shown,
      pages,
      rows:
        page === "all"
          ? rows
          : rows.slice((shown - 1) * REPORT_PAGE_SIZE, shown * REPORT_PAGE_SIZE),
    };
  });
}
