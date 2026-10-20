import { sql } from "drizzle-orm";

import type { Period } from "@/domain/analytics";
import type { Executor } from "@/server/authorize";
import { readSnapshot } from "@/server/read-snapshot";

import { type AnalyticsFilters, type PeriodInput, TOP_PRODUCTS } from "../period-params";
import { authorizeAnalytics } from "../authorize-filters";
import { resolvePeriod } from "../resolve-period";
import { spendingWhere } from "../spending-where";
import { type Counted, counted } from "../counted";
import type { Named } from "./head-spending";

// The Principal's "top 10 products" (10-notifications-analytics-reports.md, Analytics page per
// role, Principal, Spending; build-plan 6.5a; plan of 6.5a, decided item 7, Look first): the 10
// products with the most spending in the period, every subtype bought (07 Substitution: the
// record's own subtype) added to its product, the amount 08's Actual total of the records from
// `analytics_spending` under spendingWhere(), the condition its drill-down (`product:<id>` on
// /analytics/records) and export share. Each with its change against the same product in the
// period before (10 point 1). Under `data.view`, the branch wall in the SQL, in one snapshot.

export type TopProducts = {
  period: Period;
  before: Period;
  /** The period's spending, read in the same snapshot: the total line of the export. */
  total: Counted;
  /** Largest first, then by name; a product with spending only in the period before is left out. */
  products: Named[];
};

export async function getTopProducts(
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<TopProducts> {
  return readSnapshot((db) => topProductsIn(db, userId, input, filters));
}

async function topProductsIn(
  db: Executor,
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<TopProducts> {
  const actor = await authorizeAnalytics(db, userId, filters);
  const { period, before } = await resolvePeriod(db, input);
  const now = spendingWhere(actor, period, filters);
  const then = spendingWhere(actor, before, filters);

  const totals = await db.execute<{ now: string; before: string }>(sql`
    select coalesce(sum(amount) filter (where ${now}), 0)::text as now,
           coalesce(sum(amount) filter (where ${then}), 0)::text as before
    from analytics_spending
    where (${now}) or (${then})`);
  const found = await db.execute<{
    id: string;
    name: string;
    is_active: boolean;
    now: string;
    before: string;
  }>(sql`
    select pr.id, pr.name, pr.is_active,
           coalesce(sum(analytics_spending.amount) filter (where ${now}), 0)::text as now,
           coalesce(sum(analytics_spending.amount) filter (where ${then}), 0)::text as before
    from analytics_spending
    join product_variants v on v.id = analytics_spending.variant_id
    join products pr on pr.id = v.product_id
    where (${now}) or (${then})
    group by pr.id
    having coalesce(sum(analytics_spending.amount) filter (where ${now}), 0) > 0
    order by sum(analytics_spending.amount) filter (where ${now}) desc, pr.name, pr.id
    limit ${TOP_PRODUCTS}`);

  return {
    period,
    before,
    total: counted(totals.rows[0]!.now, totals.rows[0]!.before),
    products: found.rows.map((row) => ({
      id: row.id,
      name: row.name,
      isActive: row.is_active,
      ...counted(row.now, row.before),
    })),
  };
}
