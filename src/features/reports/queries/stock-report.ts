import { sql } from "drizzle-orm";

import type { DateRange } from "@/domain/analytics";
import { stockValue } from "@/domain/stock";
import { branchFilter } from "@/server/authorize";
import { stockBalances, stockMovements } from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";

import { authorizeAnalytics } from "../../analytics/authorize-filters";
import { MOVEMENT_DATE, MOVEMENT_SOURCES, UNDONE } from "../movement-date";
import { REPORT_PAGE_SIZE, type ReportParams } from "../report-params";

// The Stock on hand report (10-notifications-analytics-reports.md, Reports: "Quantities and value
// per branch"; 09-warehouse.md, Direct entry by the Head 5: "The stock value report shows direct
// entries as their own line"; build-plan 6.9a). The lines are read live from `stock_balances`, as
// the Stock on hand screen reads them (plan of 6.9a, decided item 3, Look first): numbers of now,
// which the dates do not change (decided item 4). Each line's value is stockValue() of its
// quantity and moving average, a branch's value the sum of its lines' (09 Stock value; plan of
// 5.2, decided item 1). Beside the value, what came in during the dates on two lines of their own
// (decided item 2, Look first): Purchases, the RECEIPT movements, and Direct entries, the
// DIRECT_ENTRY movements, each not undone, dated by MOVEMENT_DATE and valued stockValue() at its
// own cost (decided item 5), so they add up to the Stock movements report. Under `data.view`, the
// branch wall inside the SQL, in one snapshot; the lines 25 a page, or all for the file.

export type StockReportBranch = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  /** Whole so'm, now: the sum of the branch's lines' values. */
  value: bigint;
  /** Whole so'm: received from purchase records in the dates, at their price. */
  purchases: bigint;
  /** Whole so'm: entered by the Head in the dates, at the cost per unit typed. */
  directEntries: bigint;
};

export type StockReportTotals = Pick<StockReportBranch, "value" | "purchases" | "directEntries">;

export type StockReportLine = {
  branchId: string;
  branchCode: string;
  variantId: string;
  productName: string;
  /** `null` for the hidden default subtype of a product without subtypes. */
  subtypeName: string | null;
  /** numeric(14,3) text as stored. */
  qty: string;
  unitShortName: string;
  avgCost: bigint;
  value: bigint;
};

export type StockReport = {
  range: DateRange;
  branches: StockReportBranch[];
  all: StockReportTotals;
  /** The number of lines holding stock. */
  lineCount: number;
  page: number;
  pages: number;
  lines: StockReportLine[];
};

type LineRow = {
  branch_id: string;
  branch_code: string;
  variant_id: string;
  product_name: string;
  subtype_name: string | null;
  qty: string;
  unit_short_name: string;
  avg_cost: string;
};

type InRow = {
  branch_id: string;
  type: "RECEIPT" | "DIRECT_ENTRY";
  qty: string;
  unit_cost: string;
};

/** Throws AuthorizationError for another branch's `branch` filter. */
export async function getStockReport(
  userId: string,
  params: Pick<ReportParams, "range" | "filters">,
  page: number | "all",
): Promise<StockReport> {
  return readSnapshot(async (db) => {
    const actor = await authorizeAnalytics(db, userId, params.filters);
    const { range, filters } = params;

    const found = await db.execute<LineRow>(sql`
      select b.id as branch_id, b.code as branch_code, v.id as variant_id,
             pr.name as product_name,
             case when v.is_default then null else v.name end as subtype_name,
             stock_balances.qty::text as qty, u.short_name as unit_short_name,
             stock_balances.avg_cost::text as avg_cost
      from stock_balances
      join branches b on b.id = stock_balances.branch_id
      join product_variants v on v.id = stock_balances.variant_id
      join products pr on pr.id = v.product_id
      join units u on u.id = pr.unit_id
      where ${branchFilter(actor, stockBalances.branchId) ?? sql`true`}
        and pr.type = 'GOODS' and stock_balances.qty > 0
        ${filters.branch ? sql`and stock_balances.branch_id = ${filters.branch}` : sql``}
        ${filters.category ? sql`and pr.category_id = ${filters.category}` : sql``}
      order by pr.name, v.is_default desc, v.name, b.code, v.id`);

    const came = await db.execute<InRow>(sql`
      select stock_movements.branch_id, stock_movements.type, stock_movements.qty_delta::text as qty, stock_movements.unit_cost::text as unit_cost
      from stock_movements
      join product_variants v on v.id = stock_movements.variant_id
      join products pr on pr.id = v.product_id
      ${MOVEMENT_SOURCES}
      where ${branchFilter(actor, stockMovements.branchId) ?? sql`true`}
        and stock_movements.type in ('RECEIPT', 'DIRECT_ENTRY') and not ${UNDONE}
        and ${MOVEMENT_DATE} between ${range.first} and ${range.last}
        ${filters.branch ? sql`and stock_movements.branch_id = ${filters.branch}` : sql``}
        ${filters.category ? sql`and pr.category_id = ${filters.category}` : sql``}`);

    const lines = found.rows.map((row): StockReportLine => ({
      branchId: row.branch_id,
      branchCode: row.branch_code,
      variantId: row.variant_id,
      productName: row.product_name,
      subtypeName: row.subtype_name,
      qty: row.qty,
      unitShortName: row.unit_short_name,
      avgCost: BigInt(row.avg_cost),
      value: stockValue(row.qty, BigInt(row.avg_cost)),
    }));

    const sums = new Map<string, StockReportTotals>();
    const sumsOf = (branchId: string) => {
      let entry = sums.get(branchId);
      if (!entry) {
        entry = { value: 0n, purchases: 0n, directEntries: 0n };
        sums.set(branchId, entry);
      }
      return entry;
    };
    for (const line of lines) sumsOf(line.branchId).value += line.value;
    for (const row of came.rows) {
      // Each movement at its own cost, rounded on its own (decided item 5).
      const value = stockValue(row.qty, BigInt(row.unit_cost));
      if (row.type === "RECEIPT") sumsOf(row.branch_id).purchases += value;
      else sumsOf(row.branch_id).directEntries += value;
    }

    const named =
      sums.size === 0
        ? []
        : (
            await db.execute<{ id: string; code: string; name: string; is_active: boolean }>(sql`
              select id, code, name, is_active from branches
              where id in (${sql.join(
                [...sums.keys()].map((id) => sql`${id}`),
                sql`, `,
              )})
              order by code, id`)
          ).rows;
    const branches = named.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      isActive: row.is_active,
      ...sumsOf(row.id),
    }));
    // "All branches" from the set's own sums (plan of 6.9a, decided item 11).
    const all: StockReportTotals = {
      value: branches.reduce((sum, row) => sum + row.value, 0n),
      purchases: branches.reduce((sum, row) => sum + row.purchases, 0n),
      directEntries: branches.reduce((sum, row) => sum + row.directEntries, 0n),
    };

    const pages = Math.max(1, Math.ceil(lines.length / REPORT_PAGE_SIZE));
    const shown = page === "all" ? 1 : Math.min(page, pages);
    return {
      range,
      branches,
      all,
      lineCount: lines.length,
      page: shown,
      pages,
      lines:
        page === "all"
          ? lines
          : lines.slice((shown - 1) * REPORT_PAGE_SIZE, shown * REPORT_PAGE_SIZE),
    };
  });
}
