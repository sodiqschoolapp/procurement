import { sql } from "drizzle-orm";

import { type Change, type Period, changeAgainst, ninetyDaysSince } from "@/domain/analytics";
import type { BusinessDate } from "@/domain/business-date";
import type { Executor } from "@/server/authorize";
import { today } from "@/server/clock";
import { readSnapshot } from "@/server/read-snapshot";

import type { AnalyticsFilters, PeriodInput } from "../period-params";
import { authorizeAnalytics } from "../authorize-filters";
import { SIGNED_VALUE, movesWhere } from "../moves-where";
import { resolvePeriod } from "../resolve-period";
import { stillOf, stockWhere } from "../stock-where";

// The Warehouse block of the Head's Analytics page (10-notifications-analytics-reports.md,
// Analytics page per role, Head: "Stock value per branch; low-stock items; use by department;
// items with no movement for 90 days; value written off"; build-plan 6.4d). Per branch:
// - stock value, low-stock items and items with no movement are numbers of now from
//   `analytics_stock` under stockWhere(), with no change (plan of 6.4d, decided items 1 to 3 and
//   7, Look first); SQL adds the stored `stockValue()` of each line and counts the `isLow()` ones;
// - written off is of the period, the Σ of the write-off movements' values under movesWhere(),
//   with its change (decided item 5).
// Use by department: Σ issues − Σ returns of each department in the period (decided item 4), its
// change `changeAgainst()` while the period before is above 0, else in so'm only. Under
// `data.view`, the branch wall in the SQL, in one snapshot.

export type WarehouseBranchRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  /** Whole so'm, now. */
  value: bigint;
  low: number;
  still: number;
  stillValue: bigint;
  writtenOff: bigint;
  writtenOffChange: Change;
};

export type WarehouseTotals = Omit<WarehouseBranchRow, "id" | "code" | "name" | "isActive">;

export type DepartmentUseRow = {
  id: string;
  name: string;
  branchCode: string;
  isActive: boolean;
  /** Whole so'm, signed: issued − returned in the period. */
  used: bigint;
  before: bigint;
  /** `null` while the period before is not above 0: the change is then in so'm only. */
  change: Change | null;
};

export type Warehouse = {
  period: Period;
  before: Period;
  /** The first of the 90 days that end today (decided item 7). */
  stillSince: BusinessDate;
  branches: WarehouseBranchRow[];
  all: WarehouseTotals;
  departments: DepartmentUseRow[];
};

export async function getWarehouse(
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<Warehouse> {
  return readSnapshot((db) => warehouseIn(db, userId, input, filters));
}

/** Use's change (decided item 4): a percent only against a period before above 0. */
export function useChange(used: bigint, before: bigint): Change | null {
  return before > 0n ? changeAgainst(used, before) : null;
}

type BranchSource = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  value: string;
  low: string;
  still: string;
  still_value: string;
  now_off: string;
  before_off: string;
};

async function warehouseIn(
  db: Executor,
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<Warehouse> {
  const actor = await authorizeAnalytics(db, userId, filters);
  const { period, before } = await resolvePeriod(db, input);
  const stillSince = ninetyDaysSince(today());
  const offNow = movesWhere(actor, period, filters, "writeoff");
  const offBefore = movesWhere(actor, before, filters, "writeoff");
  const useNow = movesWhere(actor, period, filters, "use");
  const useBefore = movesWhere(actor, before, filters, "use");

  const found = await db.execute<BranchSource>(sql`
    with stock as (
      select branch_id, sum(value) as value, count(*) filter (where low) as low,
             count(*) filter (where ${stillOf(stillSince)}) as still,
             coalesce(sum(value) filter (where ${stillOf(stillSince)}), 0) as still_value
      from analytics_stock
      where ${stockWhere(actor, filters)}
      group by branch_id
    ), off as (
      select branch_id,
             coalesce(sum(value) filter (where ${offNow}), 0) as now_off,
             coalesce(sum(value) filter (where ${offBefore}), 0) as before_off
      from analytics_stock_moves
      where (${offNow}) or (${offBefore}) or (${useNow}) or (${useBefore})
      group by branch_id
    )
    select b.id, b.code, b.name, b.is_active,
           coalesce(stock.value, 0)::text as value, coalesce(stock.low, 0)::text as low,
           coalesce(stock.still, 0)::text as still,
           coalesce(stock.still_value, 0)::text as still_value,
           coalesce(off.now_off, 0)::text as now_off,
           coalesce(off.before_off, 0)::text as before_off
    from branches b
    left join stock on stock.branch_id = b.id
    left join off on off.branch_id = b.id
    where stock.branch_id is not null or off.branch_id is not null
    order by b.code, b.id`);

  const used = await db.execute<{
    id: string;
    name: string;
    branch_code: string;
    is_active: boolean;
    now_used: string;
    before_used: string;
  }>(sql`
    select d.id, d.name, b.code as branch_code, d.is_active,
           coalesce(sum(${SIGNED_VALUE}) filter (where ${useNow}), 0)::text as now_used,
           coalesce(sum(${SIGNED_VALUE}) filter (where ${useBefore}), 0)::text as before_used
    from analytics_stock_moves
    join departments d on d.id = analytics_stock_moves.department_id
    join branches b on b.id = d.branch_id
    where (${useNow}) or (${useBefore})
    group by d.id, b.code`);

  const branches = found.rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.is_active,
    value: BigInt(row.value),
    low: Number(row.low),
    still: Number(row.still),
    stillValue: BigInt(row.still_value),
    writtenOff: BigInt(row.now_off),
    writtenOffChange: changeAgainst(BigInt(row.now_off), BigInt(row.before_off)),
  }));
  // "All branches" from the set's own sums (6.4b review correction 2).
  const offBeforeAll = found.rows.reduce((sum, row) => sum + BigInt(row.before_off), 0n);
  const writtenOff = branches.reduce((sum, row) => sum + row.writtenOff, 0n);
  const all: WarehouseTotals = {
    value: branches.reduce((sum, row) => sum + row.value, 0n),
    low: branches.reduce((sum, row) => sum + row.low, 0),
    still: branches.reduce((sum, row) => sum + row.still, 0),
    stillValue: branches.reduce((sum, row) => sum + row.stillValue, 0n),
    writtenOff,
    writtenOffChange: changeAgainst(writtenOff, offBeforeAll),
  };

  const departments = used.rows
    .map((row) => {
      const now = BigInt(row.now_used);
      const was = BigInt(row.before_used);
      return {
        id: row.id,
        name: row.name,
        branchCode: row.branch_code,
        isActive: row.is_active,
        used: now,
        before: was,
        change: useChange(now, was),
      };
    })
    // Largest first (decided item 8); ties by name and id, so the order never moves.
    .sort(
      (a, b) =>
        (a.used === b.used ? 0 : a.used > b.used ? -1 : 1) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );

  return { period, before, stillSince, branches, all, departments };
}
