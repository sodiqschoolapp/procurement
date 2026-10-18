import { sql } from "drizzle-orm";

import {
  type Change,
  type DateRange,
  type MonthKey,
  type Period,
  changeAgainst,
  monthBefore,
  monthsOf,
  priceRiseSince,
} from "@/domain/analytics";
import { type BusinessDate, businessMonth } from "@/domain/business-date";
import { Exact } from "@/domain/order-totals";
import { unitPriceOf } from "@/domain/purchases";
import type { Executor } from "@/server/authorize";
import { today } from "@/server/clock";
import { readSnapshot } from "@/server/read-snapshot";

import { type AnalyticsFilters, NO_ANALYTICS_FILTERS, type PeriodInput } from "../period-params";
import { authorizeAnalytics } from "../authorize-filters";
import { resolvePeriod } from "../resolve-period";
import { spendingWhere } from "../spending-where";

// The Prices block of the Head's Analytics page (10-notifications-analytics-reports.md, Analytics
// page per role, Head: "Price trend of any product; biggest price rises in the last 90 days; the
// same product bought at different prices by different branches or suppliers"; build-plan 6.4b).
// Read from `analytics_spending` under spendingWhere() with `unit_price > 0`: a gift is no price
// (plan of 6.4b, decided item 1, Look first). SQL only adds each record's stored goods
// (`actualGoods()`) and quantity; every price is `unitPriceOf()` and every change
// `changeAgainst()` (decided item 1; review of the plan, Must fix 2 and correction 1). A price is
// per subtype, the subtype the record bought (decided item 2). Under `data.view`, the branch wall
// in the SQL, in one snapshot. The page shows the first TOP_PRICES rises and spreads; the export
// all of them.

export type SubtypeName = {
  variantId: string;
  productName: string;
  /** `null` for a product without subtypes (its default subtype). */
  subtypeName: string | null;
};

export type TrendPoint = {
  month: MonthKey;
  /** The month's price, `null` for a month with no record (no point). */
  price: bigint | null;
  count: number;
  /** Against the month before (the first point: the whole month before the period); decided item 3. */
  change: Change | null;
};

export type PriceRise = SubtypeName & {
  earlier: { price: bigint; purchasedOn: BusinessDate };
  newest: { price: bigint; purchasedOn: BusinessDate };
  rise: Change;
};

export type PricePair = {
  branchId: string;
  branchName: string;
  /** `null`: the records with no supplier, a pair of their own (decided item 5). */
  supplierId: string | null;
  supplierName: string | null;
  price: bigint;
};

export type PriceSpread = SubtypeName & {
  cheapest: PricePair;
  dearest: PricePair;
  spread: Change;
};

export type Prices = {
  period: Period;
  /** The subtype of the trend: the one chosen, or the one with the most records in the period. */
  trend: (SubtypeName & { points: TrendPoint[] }) | null;
  /** The 90 days of the rises (decided item 4). */
  riseWindow: DateRange;
  rises: PriceRise[];
  spreads: PriceSpread[];
};

export async function getPrices(
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
  variantId: string | null,
): Promise<Prices> {
  return readSnapshot((db) => pricesIn(db, userId, input, filters, variantId));
}

const NAME = sql`pr.name as product_name,
                 case when v.is_default then null else v.name end as subtype_name`;

type NameRow = { variant_id: string; product_name: string; subtype_name: string | null };

const nameOf = (row: NameRow): SubtypeName => ({
  variantId: row.variant_id,
  productName: row.product_name,
  subtypeName: row.subtype_name,
});

/** Largest percent first; then the larger amount; then by name (decided items 4 and 5). */
function byPercent<T extends SubtypeName>(change: (row: T) => Change) {
  return (a: T, b: T) => {
    const pa = change(a).percent;
    const pb = change(b).percent;
    if (pa !== pb) {
      if (pa === null) return 1;
      if (pb === null) return -1;
      const order = new Exact(pb).comparedTo(pa);
      if (order !== 0) return order;
    }
    const da = change(a).difference;
    const db = change(b).difference;
    if (da !== db) return da > db ? -1 : 1;
    return `${a.productName} ${a.subtypeName ?? ""}`.localeCompare(
      `${b.productName} ${b.subtypeName ?? ""}`,
    );
  };
}

async function pricesIn(
  db: Executor,
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
  chosen: string | null,
): Promise<Prices> {
  const actor = await authorizeAnalytics(db, userId, filters);
  const { period } = await resolvePeriod(db, input);
  const priced = sql`analytics_spending.unit_price > 0`;

  // The subtype of the trend: the one chosen (any subtype of the catalog, school-wide), or the
  // one with the most records in the period (decided item 3).
  let variantId = chosen;
  if (!variantId) {
    const most = await db.execute<{ variant_id: string }>(sql`
      select analytics_spending.variant_id
      from analytics_spending
      join product_variants v on v.id = analytics_spending.variant_id
      join products pr on pr.id = v.product_id
      where ${spendingWhere(actor, period, filters)} and ${priced}
      group by analytics_spending.variant_id, pr.name, v.name
      order by count(*) desc, pr.name, v.name
      limit 1`);
    variantId = most.rows[0]?.variant_id ?? null;
  }
  const trend = variantId ? await trendOf(db, actor, period, filters, variantId) : null;

  const window = { first: priceRiseSince(today()), last: today() };
  const rises = await risesOf(db, actor, window, filters);
  const spreads = await spreadsOf(db, actor, period, filters);
  return { period, trend, riseWindow: window, rises, spreads };
}

async function trendOf(
  db: Executor,
  actor: Awaited<ReturnType<typeof authorizeAnalytics>>,
  period: Period,
  filters: AnalyticsFilters,
  variantId: string,
): Promise<(SubtypeName & { points: TrendPoint[] }) | null> {
  const name = await db.execute<NameRow>(sql`
    select v.id as variant_id, ${NAME}
    from product_variants v join products pr on pr.id = v.product_id
    where v.id = ${variantId}`);
  if (!name.rows[0]) return null;
  const months = monthsOf(period);
  // The whole month before the period gives the first point its change (6.3 decided item 6).
  const beforeMonth = monthBefore(months[0]!);
  const before = businessMonth(`${beforeMonth}-01`);
  const found = await db.execute<{ month: string; goods: string; qty: string; count: string }>(sql`
    select to_char(analytics_spending.purchased_on, 'YYYY-MM') as month,
           sum(analytics_spending.goods)::text as goods, sum(analytics_spending.qty)::text as qty,
           count(*)::text as count
    from analytics_spending
    where ${spendingWhere(actor, null, filters)} and analytics_spending.unit_price > 0
      and analytics_spending.variant_id = ${variantId}
      and (analytics_spending.purchased_on between ${period.first} and ${period.last}
           or analytics_spending.purchased_on between ${before.first} and ${before.last})
    group by 1`);
  const byMonth = new Map(
    found.rows.map((row) => [
      row.month,
      { price: unitPriceOf(BigInt(row.goods), row.qty), count: Number(row.count) },
    ]),
  );
  let previous = byMonth.get(beforeMonth)?.price ?? null;
  const points = months.map((month) => {
    const point = byMonth.get(month);
    const price = point?.price ?? null;
    const change = price !== null && previous !== null ? changeAgainst(price, previous) : null;
    previous = price;
    return { month, price, count: point?.count ?? 0, change };
  });
  return { ...nameOf(name.rows[0]), points };
}

type RecordRow = { goods: string; qty: string; purchased_on: string };

async function risesOf(
  db: Executor,
  actor: Awaited<ReturnType<typeof authorizeAnalytics>>,
  window: DateRange,
  filters: AnalyticsFilters,
): Promise<PriceRise[]> {
  // Per subtype with a record in the 90 days: its newest record there; the earlier one is its
  // newest record before the 90 days, or its oldest record in them (decided item 4). Records are
  // ordered by trip date, entry time and id.
  const order = sql`purchased_on desc, created_at desc, purchase_id desc`;
  const found = await db.execute<
    NameRow & { newest: RecordRow; before: RecordRow | null; oldest: RecordRow; one: boolean }
  >(sql`
    with priced as (
      select analytics_spending.variant_id, analytics_spending.purchase_id,
             analytics_spending.purchased_on, analytics_spending.created_at,
             analytics_spending.goods, analytics_spending.qty
      from analytics_spending
      where ${spendingWhere(actor, null, filters)} and analytics_spending.unit_price > 0
        and analytics_spending.purchased_on <= ${window.last}),
    inside as (select * from priced where purchased_on >= ${window.first}),
    newest as (select distinct on (variant_id) * from inside order by variant_id, ${order}),
    oldest as (
      select distinct on (variant_id) * from inside
      order by variant_id, purchased_on, created_at, purchase_id),
    earlier as (
      select distinct on (variant_id) * from priced where purchased_on < ${window.first}
      order by variant_id, ${order})
    select n.variant_id, ${NAME},
           jsonb_build_object('goods', n.goods::text, 'qty', n.qty::text,
                              'purchased_on', n.purchased_on::text) as newest,
           case when e.variant_id is null then null
                else jsonb_build_object('goods', e.goods::text, 'qty', e.qty::text,
                                        'purchased_on', e.purchased_on::text) end as before,
           jsonb_build_object('goods', o.goods::text, 'qty', o.qty::text,
                              'purchased_on', o.purchased_on::text) as oldest,
           o.purchase_id = n.purchase_id as one
    from newest n
    join oldest o on o.variant_id = n.variant_id
    left join earlier e on e.variant_id = n.variant_id
    join product_variants v on v.id = n.variant_id
    join products pr on pr.id = v.product_id`);

  const priceOf = (row: RecordRow) => ({
    price: unitPriceOf(BigInt(row.goods), row.qty) ?? 0n,
    purchasedOn: row.purchased_on,
  });
  const rises = found.rows.flatMap((row) => {
    // A single record in the 90 days with none before has nothing to rise from.
    const from = row.before ?? (row.one ? null : row.oldest);
    if (!from) return [];
    const earlier = priceOf(from);
    const newest = priceOf(row.newest);
    const rise = changeAgainst(newest.price, earlier.price);
    return rise.difference > 0n ? [{ ...nameOf(row), earlier, newest, rise }] : [];
  });
  return rises.sort(byPercent((row) => row.rise));
}

async function spreadsOf(
  db: Executor,
  actor: Awaited<ReturnType<typeof authorizeAnalytics>>,
  period: Period,
  filters: AnalyticsFilters,
): Promise<PriceSpread[]> {
  const found = await db.execute<
    NameRow & {
      branch_id: string;
      branch_name: string;
      supplier_id: string | null;
      supplier_name: string | null;
      goods: string;
      qty: string;
    }
  >(sql`
    select analytics_spending.variant_id, ${NAME}, analytics_spending.branch_id,
           b.name as branch_name, analytics_spending.supplier_id, co.name as supplier_name,
           sum(analytics_spending.goods)::text as goods, sum(analytics_spending.qty)::text as qty
    from analytics_spending
    join product_variants v on v.id = analytics_spending.variant_id
    join products pr on pr.id = v.product_id
    join branches b on b.id = analytics_spending.branch_id
    left join companies co on co.id = analytics_spending.supplier_id
    where ${spendingWhere(actor, period, filters)} and analytics_spending.unit_price > 0
    group by analytics_spending.variant_id, pr.name, v.is_default, v.name,
             analytics_spending.branch_id, b.name, analytics_spending.supplier_id, co.name
    order by b.name, co.name nulls last`);

  const pairs = new Map<string, { name: SubtypeName; list: PricePair[] }>();
  for (const row of found.rows) {
    const entry = pairs.get(row.variant_id) ?? { name: nameOf(row), list: [] };
    entry.list.push({
      branchId: row.branch_id,
      branchName: row.branch_name,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      price: unitPriceOf(BigInt(row.goods), row.qty) ?? 0n,
    });
    pairs.set(row.variant_id, entry);
  }
  const spreads: PriceSpread[] = [];
  for (const { name, list } of pairs.values()) {
    // The pairs are in branch and supplier order, so the first of equal prices is kept.
    const cheapest = list.reduce((low, pair) => (pair.price < low.price ? pair : low));
    const dearest = list.reduce((high, pair) => (pair.price > high.price ? pair : high));
    if (cheapest.price === dearest.price) continue;
    spreads.push({
      ...name,
      cheapest,
      dearest,
      spread: changeAgainst(dearest.price, cheapest.price),
    });
  }
  return spreads.sort(byPercent((row) => row.spread));
}

/**
 * The subtypes the trend can show (decided item 3): those with a priced record in the user's
 * branches, any time, by name. Under `data.view`, the branch wall in the SQL; names read live
 * (plan of 6.3, decided item 11).
 */
export async function getPriceChoices(userId: string): Promise<SubtypeName[]> {
  return readSnapshot(async (db) => {
    const actor = await authorizeAnalytics(db, userId, NO_ANALYTICS_FILTERS);
    const found = await db.execute<NameRow>(sql`
      select distinct analytics_spending.variant_id, ${NAME}
      from analytics_spending
      join product_variants v on v.id = analytics_spending.variant_id
      join products pr on pr.id = v.product_id
      where ${spendingWhere(actor, null, NO_ANALYTICS_FILTERS)}
        and analytics_spending.unit_price > 0
      order by product_name, subtype_name nulls first`);
    return found.rows.map(nameOf);
  });
}
