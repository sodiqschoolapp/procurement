import { sql } from "drizzle-orm";

import {
  changeAgainst,
  type EstimateGap,
  type EstimateLine,
  type Period,
  estimateGap,
  shareChange,
} from "@/domain/analytics";
import type { Executor } from "@/server/authorize";
import { readSnapshot } from "@/server/read-snapshot";

import type { AnalyticsFilters, PeriodInput } from "../period-params";
import type { Count } from "./plan-vs-actual";
import { authorizeAnalytics } from "../authorize-filters";
import { mineOf, withoutManager } from "../mine";
import { resolvePeriod } from "../resolve-period";
import { spendingWhere } from "../spending-where";

// The Manager's My estimates block (10-notifications-analytics-reports.md, Analytics page per
// role, Manager, My estimates: "Difference between planned and actual price per product, to help
// estimate better next time"; build-plan 6.5b). Read from `analytics_spending` under
// spendingWhere() with the user's own orders (plan of 6.5b, decided item 6, Look first): each
// priced record bought in the period (trip date) with its quantity, its stored `actualGoods()` and
// its order's planned price, read as they are; `estimateGap()` of src/domain/analytics.ts works out
// the planned goods and both prices (decided item 4, Look first; review of the plan, correction
// 1): SQL multiplies and rounds nothing (developer-rules.md rule 1). Every subtype bought counts
// under its product (07 Substitution; 6.5a decided item 4). Each row's percent carries its change
// in points against the period before. The drill-down `priced:<product|all>` lists the very
// records read here. Under `data.view`, the branch wall in the SQL, in one snapshot.

export type Estimate = EstimateGap & { change: string | null };

/**
 * `unpriced`: the priced records of my orders without a planned price, which the estimate leaves
 * out, with their change (08 Numbers; plan of 2.5d-c, review correction 2: the count is of the
 * records its list `priced:…:unpriced` shows).
 */
export type ProductEstimate = Estimate & {
  productId: string;
  name: string;
  isActive: boolean;
  unpriced: Count;
};

export type MyEstimates = {
  period: Period;
  before: Period;
  /** Every product of my priced records in the period, by the largest miss in percent first. */
  products: ProductEstimate[];
  /** Every priced record of my orders in the period together, from the set's own sums. */
  all: Estimate & { unpriced: Count };
};

export async function getMyEstimates(
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<MyEstimates> {
  return readSnapshot((db) => estimatesIn(db, userId, input, filters));
}

type Row = {
  product_id: string;
  name: string;
  is_active: boolean;
  within: boolean;
  qty: string;
  unit_price: string;
  goods: string;
  planned_price: string | null;
};

const lineOf = (row: Row & { planned_price: string }): EstimateLine => ({
  qty: row.qty,
  unitPrice: BigInt(row.unit_price),
  goods: BigInt(row.goods),
  plannedPrice: BigInt(row.planned_price),
});

/** The records of each side without a planned price. */
type Sides = {
  now: EstimateLine[];
  before: EstimateLine[];
  unpricedNow: number;
  unpricedBefore: number;
};

const countOf = (now: number, before: number): Count => ({
  count: now,
  change: changeAgainst(BigInt(now), BigInt(before)),
});

/** The larger miss, either way, first; no percent last; then by name. */
function byMiss(a: ProductEstimate, b: ProductEstimate): number {
  const size = (each: ProductEstimate) =>
    each.percent === null ? -1 : Math.abs(Number(each.percent));
  return size(b) - size(a) || a.name.localeCompare(b.name);
}

async function estimatesIn(
  db: Executor,
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<MyEstimates> {
  const actor = await authorizeAnalytics(db, userId, withoutManager(filters));
  const { period, before } = await resolvePeriod(db, input);
  const mine = mineOf(filters, userId);
  const nowWhere = spendingWhere(actor, period, mine);
  const beforeWhere = spendingWhere(actor, before, mine);

  const found = await db.execute<Row>(sql`
    select pr.id as product_id, pr.name, pr.is_active, (${nowWhere}) as within,
           analytics_spending.qty::text as qty, analytics_spending.unit_price::text as unit_price,
           analytics_spending.goods::text as goods, o.planned_price::text as planned_price
    from analytics_spending
    join orders o on o.id = analytics_spending.order_id
    join product_variants v on v.id = analytics_spending.variant_id
    join products pr on pr.id = v.product_id
    where analytics_spending.unit_price > 0 and ((${nowWhere}) or (${beforeWhere}))`);

  // An order without a planned price has nothing to estimate against: its records are left out
  // of the estimate and counted beside it (08 Numbers; plans of 2.5d-b and 2.5d-c).
  const groups = new Map<string, Sides & { name: string; isActive: boolean }>();
  const all: Sides = { now: [], before: [], unpricedNow: 0, unpricedBefore: 0 };
  for (const row of found.rows) {
    const group = groups.get(row.product_id) ?? {
      name: row.name,
      isActive: row.is_active,
      now: [],
      before: [],
      unpricedNow: 0,
      unpricedBefore: 0,
    };
    for (const sides of [group, all]) {
      if (row.planned_price === null) {
        if (row.within) sides.unpricedNow += 1;
        else sides.unpricedBefore += 1;
      } else {
        sides[row.within ? "now" : "before"].push(
          lineOf({ ...row, planned_price: row.planned_price }),
        );
      }
    }
    groups.set(row.product_id, group);
  }
  const estimateOf = (now: EstimateLine[], then: EstimateLine[]): Estimate => {
    const gap = estimateGap(now);
    return { ...gap, change: shareChange(gap.percent, estimateGap(then).percent) };
  };

  return {
    period,
    before,
    products: [...groups.entries()]
      // A product with only records of unpriced orders has its line: no estimate, the count.
      .filter(([, group]) => group.now.length > 0 || group.unpricedNow > 0)
      .map(([productId, group]) => ({
        productId,
        name: group.name,
        isActive: group.isActive,
        ...estimateOf(group.now, group.before),
        unpriced: countOf(group.unpricedNow, group.unpricedBefore),
      }))
      .sort(byMiss),
    all: {
      ...estimateOf(all.now, all.before),
      unpriced: countOf(all.unpricedNow, all.unpricedBefore),
    },
  };
}
