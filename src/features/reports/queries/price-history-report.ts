import { sql } from "drizzle-orm";

import type { DateRange } from "@/domain/analytics";
import type { BusinessDate } from "@/domain/business-date";
import type { Executor } from "@/server/authorize";
import { readSnapshot } from "@/server/read-snapshot";

import { authorizeAnalytics } from "../../analytics/authorize-filters";
import type { SubtypeName } from "../../analytics/queries/prices";
import { spendingWhere } from "../../analytics/spending-where";
import { REPORT_PAGE_SIZE, type ReportParams } from "../report-params";

// The Price history report (10-notifications-analytics-reports.md, Reports: "How the price of one
// product changed over time, as a chart"; 04-catalogs.md rule 4, Price memory; build-plan 6.9b).
// One subtype, the subtype the record bought (plan of 6.4b, decided item 2; plan of 6.9b, decided
// item 6): the one in the address, else the one with the most priced records in the dates under
// the filters, chosen inside the branch wall (review of the plan, correction 2). Its purchase
// prices are each record's stored `unit_price` in `analytics_spending` above 0, under
// spendingWhere(), as the Prices block reads them (6.4b decided item 1; decided item 5, Look
// first): one chart point per record, oldest first (decided item 7). Its reference prices are the
// `HEAD` rows of `price_history`, one price for the whole school and no branch data (04 rule 4):
// the one in force on the first day and every one set in the dates, newest by `created_at` then
// `seq`, the order the catalog's check `price_recorded` reads (decided item 8). Under `data.view`,
// the branch wall in the SQL, in one snapshot; the records 25 a page, or all for the file; the
// chart always all.

export type PriceRecord = {
  purchaseId: string;
  orderId: string;
  orderNumber: string;
  branchCode: string;
  purchasedOn: BusinessDate;
  /** `null`: a record with no supplier. */
  supplierName: string | null;
  /** numeric(14,3) text. */
  qty: string;
  unitShortName: string;
  unitPrice: bigint;
};

export type ReferencePrice = {
  id: string;
  price: bigint;
  note: string | null;
  setByName: string;
  /** The Tashkent date it was set. */
  setOn: BusinessDate;
  /** The one in force on the first day of the dates, set before them. */
  inForce: boolean;
};

export type PriceHistoryReport = {
  range: DateRange;
  /** `null`: no subtype chosen and none bought in the dates, or an id that is no subtype. */
  subtype: SubtypeName | null;
  /** Every record of the dates, oldest first: the chart's points. */
  points: PriceRecord[];
  recordCount: number;
  page: number;
  pages: number;
  /** The records of the page, oldest first. */
  records: PriceRecord[];
  references: ReferencePrice[];
};

type RecordRow = {
  purchase_id: string;
  order_id: string;
  order_number: string;
  branch_code: string;
  purchased_on: string;
  supplier_name: string | null;
  qty: string;
  unit_short_name: string;
  unit_price: string;
};

/** Throws AuthorizationError for another branch's `branch` filter. */
export async function getPriceHistoryReport(
  userId: string,
  params: Pick<ReportParams, "range" | "filters" | "variant">,
  page: number | "all",
): Promise<PriceHistoryReport> {
  return readSnapshot(async (db) => {
    const actor = await authorizeAnalytics(db, userId, params.filters);
    const where = sql`${spendingWhere(actor, params.range, params.filters)}
      and analytics_spending.unit_price > 0`;
    const variantId = params.variant ?? (await mostBought(db, where));
    const empty = { records: [], points: [], recordCount: 0, page: 1, pages: 1 };
    if (!variantId) return { range: params.range, subtype: null, references: [], ...empty };
    const name = await db.execute<{
      variant_id: string;
      product_name: string;
      subtype_name: string | null;
    }>(sql`
      select v.id as variant_id, pr.name as product_name,
             case when v.is_default then null else v.name end as subtype_name
      from product_variants v join products pr on pr.id = v.product_id
      where v.id = ${variantId}`);
    const named = name.rows[0];
    if (!named) return { range: params.range, subtype: null, references: [], ...empty };
    const subtype = {
      variantId: named.variant_id,
      productName: named.product_name,
      subtypeName: named.subtype_name,
    };

    const found = await db.execute<RecordRow>(sql`
      select analytics_spending.purchase_id, analytics_spending.order_id, o.number as order_number,
             b.code as branch_code, analytics_spending.purchased_on::text as purchased_on,
             c.name as supplier_name, analytics_spending.qty::text as qty,
             u.short_name as unit_short_name, analytics_spending.unit_price::text as unit_price
      from analytics_spending
      join orders o on o.id = analytics_spending.order_id
      join branches b on b.id = analytics_spending.branch_id
      join product_variants v on v.id = analytics_spending.variant_id
      join products pr on pr.id = v.product_id
      join units u on u.id = pr.unit_id
      left join companies c on c.id = analytics_spending.supplier_id
      where ${where} and analytics_spending.variant_id = ${variantId}
      order by analytics_spending.purchased_on, analytics_spending.created_at,
               analytics_spending.purchase_id`);
    const points = found.rows.map((row): PriceRecord => ({
      purchaseId: row.purchase_id,
      orderId: row.order_id,
      orderNumber: row.order_number,
      branchCode: row.branch_code,
      purchasedOn: row.purchased_on,
      supplierName: row.supplier_name,
      qty: row.qty,
      unitShortName: row.unit_short_name,
      unitPrice: BigInt(row.unit_price),
    }));

    const setOn = sql`(h.created_at at time zone 'Asia/Tashkent')::date`;
    const references = await db.execute<{
      id: string;
      price: string;
      note: string | null;
      set_by_name: string;
      set_on: string;
      in_force: boolean;
    }>(sql`
      with head as (
        select h.id, h.price, h.note, h.created_at, h.seq, u.full_name as set_by_name,
               ${setOn} as set_on
        from price_history h join users u on u.id = h.set_by
        where h.variant_id = ${variantId} and h.source = 'HEAD'),
      before as (
        select * from head where set_on < ${params.range.first}::date
        order by created_at desc, seq desc limit 1)
      select id, price::text as price, note, set_by_name, set_on::text as set_on,
             true as in_force, created_at, seq
      from before
      union all
      select id, price::text, note, set_by_name, set_on::text, false, created_at, seq
      from head where set_on between ${params.range.first}::date and ${params.range.last}::date
      order by created_at, seq`);

    const pages = Math.max(1, Math.ceil(points.length / REPORT_PAGE_SIZE));
    const shown = page === "all" ? 1 : Math.min(page, pages);
    return {
      range: params.range,
      subtype,
      points,
      recordCount: points.length,
      page: shown,
      pages,
      records:
        page === "all"
          ? points
          : points.slice((shown - 1) * REPORT_PAGE_SIZE, shown * REPORT_PAGE_SIZE),
      references: references.rows.map((row) => ({
        id: row.id,
        price: BigInt(row.price),
        note: row.note,
        setByName: row.set_by_name,
        setOn: row.set_on,
        inForce: row.in_force,
      })),
    };
  });
}

/** The subtype with the most priced records under `where`, as the Prices block's trend. */
async function mostBought(db: Executor, where: ReturnType<typeof sql>): Promise<string | null> {
  const most = await db.execute<{ variant_id: string }>(sql`
    select analytics_spending.variant_id
    from analytics_spending
    join product_variants v on v.id = analytics_spending.variant_id
    join products pr on pr.id = v.product_id
    where ${where}
    group by analytics_spending.variant_id, pr.name, v.name
    order by count(*) desc, pr.name, v.name
    limit 1`);
  return most.rows[0]?.variant_id ?? null;
}
