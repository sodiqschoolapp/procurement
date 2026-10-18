import { sql } from "drizzle-orm";

import type { Period } from "@/domain/analytics";
import type { BusinessDate } from "@/domain/business-date";
import type { Executor } from "@/server/authorize";
import { readSnapshot } from "@/server/read-snapshot";

import {
  type AnalyticsFilters,
  type MoveKind,
  type PeriodInput,
  RECORDS_PAGE_SIZE,
} from "../period-params";
import { authorizeAnalytics } from "../authorize-filters";
import { SIGNED_VALUE, movesWhere } from "../moves-where";
import { resolvePeriod } from "../resolve-period";

// /analytics/moves, the movements behind a Warehouse number of the period (10-notifications-
// analytics-reports.md, Analytics page per role, point 3; build-plan 6.4d; plan of 6.4d, decided
// items 4, 5 and 9): the rows of `analytics_stock_moves` under the same movesWhere() as the
// number, so their Σ is the number clicked: in use a return counts against (`SIGNED_VALUE`). A
// department row of use sets the department filter. Names and the document's number are read
// live. Under `data.view`, the branch wall in the SQL, in one snapshot; 50 a page, or every row
// for the export.

export type StockMove = {
  movementId: string;
  documentId: string;
  documentNumber: string;
  type: "ISSUE" | "RETURN" | "WRITE_OFF";
  movedOn: BusinessDate;
  branchName: string;
  /** `null` for a write-off. */
  departmentName: string | null;
  productName: string;
  subtypeName: string | null;
  quantity: string;
  unitShortName: string;
  /** Whole so'm; a return's is below 0 in use. */
  value: bigint;
};

export type StockMoves = {
  move: MoveKind;
  period: Period;
  count: number;
  total: bigint;
  page: number;
  rows: StockMove[];
};

type Row = {
  movement_id: string;
  document_id: string;
  number: string;
  type: StockMove["type"];
  moved_on: string;
  branch_name: string;
  department_name: string | null;
  product_name: string;
  subtype_name: string | null;
  qty: string;
  unit_short_name: string;
  value: string;
};

/** Throws AuthorizationError for another branch's filter, PeriodRefusedError for a bad period. */
export async function getStockMoves(
  userId: string,
  move: MoveKind,
  input: PeriodInput,
  filters: AnalyticsFilters,
  page: number | "all",
): Promise<StockMoves> {
  return readSnapshot((db) => movesIn(db, userId, move, input, filters, page));
}

async function movesIn(
  db: Executor,
  userId: string,
  move: MoveKind,
  input: PeriodInput,
  filters: AnalyticsFilters,
  page: number | "all",
): Promise<StockMoves> {
  const actor = await authorizeAnalytics(db, userId, filters);
  const { period } = await resolvePeriod(db, input);
  const where = movesWhere(actor, period, filters, move);
  const summary = await db.execute<{ count: string; total: string }>(sql`
    select count(*)::text as count, coalesce(sum(${SIGNED_VALUE}), 0)::text as total
    from analytics_stock_moves where ${where}`);
  const limit =
    page === "all"
      ? sql``
      : sql`limit ${RECORDS_PAGE_SIZE} offset ${(page - 1) * RECORDS_PAGE_SIZE}`;
  const found = await db.execute<Row>(sql`
    select analytics_stock_moves.movement_id, analytics_stock_moves.document_id, d.number,
           analytics_stock_moves.type::text as type,
           analytics_stock_moves.moved_on::text as moved_on, b.name as branch_name,
           dep.name as department_name, pr.name as product_name,
           case when v.is_default then null else v.name end as subtype_name,
           analytics_stock_moves.qty::text as qty, u.short_name as unit_short_name,
           (${SIGNED_VALUE})::text as value
    from analytics_stock_moves
    join stock_documents d on d.id = analytics_stock_moves.document_id
    join branches b on b.id = analytics_stock_moves.branch_id
    left join departments dep on dep.id = analytics_stock_moves.department_id
    join product_variants v on v.id = analytics_stock_moves.variant_id
    join products pr on pr.id = v.product_id
    join units u on u.id = pr.unit_id
    where ${where}
    order by analytics_stock_moves.moved_on desc, d.number, analytics_stock_moves.movement_id
    ${limit}`);
  return {
    move,
    period,
    count: Number(summary.rows[0]!.count),
    total: BigInt(summary.rows[0]!.total),
    page: page === "all" ? 1 : page,
    rows: found.rows.map((row) => ({
      movementId: row.movement_id,
      documentId: row.document_id,
      documentNumber: row.number,
      type: row.type,
      movedOn: row.moved_on,
      branchName: row.branch_name,
      departmentName: row.department_name,
      productName: row.product_name,
      subtypeName: row.subtype_name,
      quantity: row.qty,
      unitShortName: row.unit_short_name,
      value: BigInt(row.value),
    })),
  };
}
