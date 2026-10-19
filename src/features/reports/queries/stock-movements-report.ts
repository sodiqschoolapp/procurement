import { sql } from "drizzle-orm";

import type { DateRange } from "@/domain/analytics";
import type { BusinessDate } from "@/domain/business-date";
import type { Actor } from "@/domain/permissions";
import { type MovementType, stockValue } from "@/domain/stock";
import { branchFilter } from "@/server/authorize";
import { stockMovements } from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";

import { authorizeAnalytics } from "../../analytics/authorize-filters";
import { MOVEMENT_DATE, MOVEMENT_SOURCES, UNDONE } from "../movement-date";
import { REPORT_PAGE_SIZE, type ReportParams } from "../report-params";

// The Stock movements report (10-notifications-analytics-reports.md, Reports: "Everything that
// went in and out in a period"; build-plan 6.9a). Every movement of every type of the branches
// seen whose MOVEMENT_DATE is in the dates (plan of 6.9a, decided items 5 and 6, Look first),
// newest first; a reversal is its own row on its own day and the row it undid is marked. A
// movement's value is stockValue() of its size at the cost it moved at (09 Stock value), signed
// as its quantity. A document's movement names the document; a purchase's names its order behind
// the draft wall, in the SQL (as the item card, 5.3). No table of totals (decided item 6). Under
// `data.view`, the branch wall inside the SQL, in one snapshot; 25 a page, or all for the file.

export type StockMovementLine = {
  movementId: string;
  movedOn: BusinessDate;
  branchCode: string;
  type: MovementType;
  documentId: string | null;
  documentNumber: string | null;
  orderId: string | null;
  orderNumber: string | null;
  productName: string;
  /** `null` for the hidden default subtype of a product without subtypes. */
  subtypeName: string | null;
  /** Signed numeric(14,3) text as stored. */
  qtyDelta: string;
  unitShortName: string;
  unitCost: bigint;
  /** Whole so'm, signed as the quantity. */
  value: bigint;
  /** A later reversal undid this movement. */
  undone: boolean;
};

export type StockMovementsReport = {
  range: DateRange;
  count: number;
  page: number;
  pages: number;
  rows: StockMovementLine[];
};

type Row = {
  id: string;
  moved_on: string;
  branch_code: string;
  type: MovementType;
  document_id: string | null;
  document_number: string | null;
  order_id: string | null;
  order_number: string | null;
  product_name: string;
  subtype_name: string | null;
  qty_delta: string;
  unit_short_name: string;
  unit_cost: string;
  undone: boolean;
};

/** The draft wall of the order joined through a purchase (03 rule 1; 06 Statuses). */
function orderSeen(actor: Actor) {
  if (actor.role === "HEAD") return sql`true`;
  return sql`(o.status <> 'DRAFT' or o.owner_id = ${actor.userId})`;
}

/** Throws AuthorizationError for another branch's `branch` filter. */
export async function getStockMovementsReport(
  userId: string,
  params: Pick<ReportParams, "range" | "filters">,
  page: number | "all",
): Promise<StockMovementsReport> {
  return readSnapshot(async (db) => {
    const actor = await authorizeAnalytics(db, userId, params.filters);
    const { range, filters } = params;
    const found = await db.execute<Row>(sql`
      select stock_movements.id, (${MOVEMENT_DATE})::text as moved_on, b.code as branch_code,
             stock_movements.type, d.id as document_id, d.number as document_number,
             o.id as order_id, o.number as order_number, pr.name as product_name,
             case when v.is_default then null else v.name end as subtype_name,
             stock_movements.qty_delta::text as qty_delta, u.short_name as unit_short_name,
             stock_movements.unit_cost::text as unit_cost, ${UNDONE} as undone
      from stock_movements
      join branches b on b.id = stock_movements.branch_id
      join product_variants v on v.id = stock_movements.variant_id
      join products pr on pr.id = v.product_id
      join units u on u.id = pr.unit_id
      ${MOVEMENT_SOURCES}
      left join orders o on o.id = p.order_id and o.branch_id = stock_movements.branch_id
        and ${orderSeen(actor)}
      where ${branchFilter(actor, stockMovements.branchId) ?? sql`true`}
        and ${MOVEMENT_DATE} between ${range.first} and ${range.last}
        ${filters.branch ? sql`and stock_movements.branch_id = ${filters.branch}` : sql``}
        ${filters.category ? sql`and pr.category_id = ${filters.category}` : sql``}
      order by moved_on desc, stock_movements.seq desc`);

    const rows = found.rows.map((row): StockMovementLine => {
      const unitCost = BigInt(row.unit_cost);
      const size = stockValue(row.qty_delta.replace(/^-/, ""), unitCost);
      return {
        movementId: row.id,
        movedOn: row.moved_on,
        branchCode: row.branch_code,
        type: row.type,
        documentId: row.document_id,
        documentNumber: row.document_number,
        orderId: row.order_id,
        orderNumber: row.order_number,
        productName: row.product_name,
        subtypeName: row.subtype_name,
        qtyDelta: row.qty_delta,
        unitShortName: row.unit_short_name,
        unitCost,
        value: row.qty_delta.startsWith("-") ? -size : size,
        undone: row.undone,
      };
    });
    const pages = Math.max(1, Math.ceil(rows.length / REPORT_PAGE_SIZE));
    const shown = page === "all" ? 1 : Math.min(page, pages);
    return {
      range,
      count: rows.length,
      page: shown,
      pages,
      rows:
        page === "all"
          ? rows
          : rows.slice((shown - 1) * REPORT_PAGE_SIZE, shown * REPORT_PAGE_SIZE),
    };
  });
}
