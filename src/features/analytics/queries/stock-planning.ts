import { sql } from "drizzle-orm";

import {
  type DateRange,
  type MonthKey,
  type Period,
  type QtyChange,
  monthBefore,
  monthInside,
  monthsOf,
  ninetyDaysSince,
  qtyChange,
  runsOutIn,
  suggestedQuantity,
} from "@/domain/analytics";
import { businessMonth } from "@/domain/business-date";
import type { Executor } from "@/server/authorize";
import { today } from "@/server/clock";
import { readSnapshot } from "@/server/read-snapshot";

import type { AnalyticsFilters, PeriodInput } from "../period-params";
import { authorizeAnalytics } from "../authorize-filters";
import { SIGNED_QTY, movesWhere } from "../moves-where";
import { resolvePeriod } from "../resolve-period";
import { stockWhere } from "../stock-where";

// The Manager's Stock planning block (10-notifications-analytics-reports.md, Analytics page per
// role, Manager: "Use of each item per month; 'runs out in about 12 days' at the current rate; low
// stock; suggested order quantity"; build-plan 6.5c; plan of 6.5c, decided items 1 to 7). One row
// per stock line (a subtype in a branch, goods only) of `analytics_stock` under stockWhere() that
// holds stock, is Low, or had an issue or return in the period or in the 90 days that end today:
// - the use of each month of the period, Σ issues − Σ returns in the item's measure under
//   movesWhere(…, "use") with the line's subtype, its change against the month before; the
//   period's use against the period before (`qtyChange()`, decided item 3, Look first);
// - on hand, the minimum and Low as the job stored them (`isLow()`), numbers of now;
// - "runs out in" `runsOutIn()` and the suggested quantity `suggestedQuantity()` from the use of
//   the 90 days that end today, which never reads the department filter: the branch's stock is
//   emptied by every department (review of the plan, correction 2).
// Stock is the branch's, not the Manager's: the Manager filter is not read (decided item 4). The
// rows that run out soonest come first (decided item 6). Under `data.view`, the branch wall in the
// SQL, in one snapshot.

export type PlanningMonth = {
  month: MonthKey;
  /** The days of the month inside the period: what the month's number counts. */
  range: DateRange;
  /** Σ issues − Σ returns, numeric text with a sign. */
  used: string;
  /** Against the month before; the first month against the whole calendar month before it. */
  change: QtyChange;
};

export type PlanningLine = {
  branchId: string;
  variantId: string;
  branchName: string;
  productName: string;
  /** `null` for the hidden default subtype of a product without subtypes. */
  subtypeName: string | null;
  unitShortName: string;
  /** numeric(14,3) text as stored. */
  onHand: string;
  minimum: string | null;
  low: boolean;
  months: PlanningMonth[];
  used: string;
  before: string;
  change: QtyChange;
  /** Σ issues − Σ returns of the 90 days that end today, of every department. */
  rateUsed: string;
  runsOutIn: number | null;
  suggested: string;
};

export type StockPlanning = {
  period: Period;
  before: Period;
  /** The 90 days that end today, of the rate. */
  rate: DateRange;
  months: MonthKey[];
  /** The Low lines: the count of `getStockLines("low")` under the same filters (decided item 7). */
  low: number;
  /** Every line, soonest out first; the page shows the first 10, the export all. */
  lines: PlanningLine[];
};

export async function getStockPlanning(
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<StockPlanning> {
  return readSnapshot((db) => planningIn(db, userId, input, filters));
}

type LineRow = {
  branch_id: string;
  variant_id: string;
  branch_code: string;
  branch_name: string;
  product_name: string;
  subtype_name: string | null;
  unit_short_name: string;
  qty: string;
  holds: boolean;
  min_qty: string | null;
  low: boolean;
};

type UseRow = { branch_id: string; variant_id: string; month: string; used: string };

type SpanRow = {
  branch_id: string;
  variant_id: string;
  used: string;
  month_before: string;
  before: string;
  rate_used: string;
  rate_moves: string;
};

const keyOf = (row: { branch_id: string; variant_id: string }) =>
  `${row.branch_id}:${row.variant_id}`;

async function planningIn(
  db: Executor,
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<StockPlanning> {
  const actor = await authorizeAnalytics(db, userId, filters);
  const { period, before } = await resolvePeriod(db, input);
  const now = today();
  const rate: DateRange = { first: ninetyDaysSince(now), last: now };
  const months = monthsOf(period);
  const firstBefore = businessMonth(`${monthBefore(months[0]!)}-01`);
  // The 90-day rate is of every department (review of the plan, correction 2).
  const everyDepartment: AnalyticsFilters = { ...filters, department: null };
  const inPeriod = movesWhere(actor, period, filters, "use");
  const inMonthBefore = movesWhere(actor, firstBefore, filters, "use");
  const inBefore = movesWhere(actor, before, filters, "use");
  const inRate = movesWhere(actor, rate, everyDepartment, "use");

  const lines = await db.execute<LineRow>(sql`
    select analytics_stock.branch_id, analytics_stock.variant_id, b.code as branch_code,
           b.name as branch_name, pr.name as product_name,
           case when v.is_default then null else v.name end as subtype_name,
           u.short_name as unit_short_name, analytics_stock.qty::text as qty,
           analytics_stock.qty > 0 as holds, analytics_stock.min_qty::text as min_qty, analytics_stock.low
    from analytics_stock
    join branches b on b.id = analytics_stock.branch_id
    join product_variants v on v.id = analytics_stock.variant_id
    join products pr on pr.id = v.product_id
    join units u on u.id = pr.unit_id
    where ${stockWhere(actor, filters)}`);

  const uses = await db.execute<UseRow>(sql`
    select branch_id, variant_id, to_char(moved_on, 'YYYY-MM') as month,
           sum(${SIGNED_QTY})::text as used
    from analytics_stock_moves
    where ${inPeriod}
    group by branch_id, variant_id, month`);

  const spans = await db.execute<SpanRow>(sql`
    select branch_id, variant_id,
           coalesce(sum(${SIGNED_QTY}) filter (where ${inPeriod}), 0)::text as used,
           coalesce(sum(${SIGNED_QTY}) filter (where ${inMonthBefore}), 0)::text as month_before,
           coalesce(sum(${SIGNED_QTY}) filter (where ${inBefore}), 0)::text as before,
           coalesce(sum(${SIGNED_QTY}) filter (where ${inRate}), 0)::text as rate_used,
           count(*) filter (where ${inRate})::text as rate_moves
    from analytics_stock_moves
    where (${inPeriod}) or (${inMonthBefore}) or (${inBefore}) or (${inRate})
    group by branch_id, variant_id`);

  const usesOf = new Map<string, Map<MonthKey, string>>();
  for (const row of uses.rows) {
    const key = keyOf(row);
    const each = usesOf.get(key) ?? new Map<MonthKey, string>();
    each.set(row.month, row.used);
    usesOf.set(key, each);
  }
  const spanOf = new Map(spans.rows.map((row) => [keyOf(row), row]));

  const planned = lines.rows
    .filter((row) => {
      const span = spanOf.get(keyOf(row));
      return (
        row.holds ||
        row.low ||
        usesOf.has(keyOf(row)) ||
        (span !== undefined && Number(span.rate_moves) > 0)
      );
    })
    .map((row) => {
      const used = usesOf.get(keyOf(row));
      const span = spanOf.get(keyOf(row));
      let earlier = span?.month_before ?? "0";
      const each: PlanningMonth[] = months.map((month) => {
        const value = used?.get(month) ?? "0";
        const change = qtyChange(value, earlier);
        earlier = value;
        return { month, range: monthInside(month, period)!, used: value, change };
      });
      const total = span?.used ?? "0";
      const was = span?.before ?? "0";
      const rateUsed = span?.rate_used ?? "0";
      return {
        line: {
          branchId: row.branch_id,
          variantId: row.variant_id,
          branchName: row.branch_name,
          productName: row.product_name,
          subtypeName: row.subtype_name,
          unitShortName: row.unit_short_name,
          onHand: row.qty,
          minimum: row.min_qty,
          low: row.low,
          months: each,
          used: total,
          before: was,
          change: qtyChange(total, was),
          rateUsed,
          runsOutIn: runsOutIn(row.qty, rateUsed),
          suggested: suggestedQuantity(row.qty, row.min_qty, rateUsed),
        } satisfies PlanningLine,
        branchCode: row.branch_code,
      };
    })
    // Soonest out first, none last; ties Low first, then product, subtype, branch (decided item 6).
    .sort(
      (a, b) =>
        outOrder(a.line.runsOutIn, b.line.runsOutIn) ||
        Number(b.line.low) - Number(a.line.low) ||
        a.line.productName.localeCompare(b.line.productName) ||
        (a.line.subtypeName ?? "").localeCompare(b.line.subtypeName ?? "") ||
        a.branchCode.localeCompare(b.branchCode) ||
        a.line.variantId.localeCompare(b.line.variantId),
    );

  return {
    period,
    before,
    rate,
    months,
    low: planned.filter((each) => each.line.low).length,
    lines: planned.map((each) => each.line),
  };
}

/** None last: a line that never runs out at its rate comes after every one that does. */
function outOrder(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}
