import { sql } from "drizzle-orm";

import {
  type Change,
  type MonthKey,
  type Period,
  changeAgainst,
  monthBefore,
  monthsOf,
} from "@/domain/analytics";
import { businessMonth } from "@/domain/business-date";
import { type Executor, authorize, authorizeList } from "@/server/authorize";
import { readSnapshot } from "@/server/read-snapshot";

import type { AnalyticsFilters, PeriodInput } from "../period-params";
import { resolvePeriod } from "../resolve-period";
import { spendingWhere } from "../spending-where";

// The Spending block every role's Analytics page shows until 6.4 to 6.6 bring their own
// (10-notifications-analytics-reports.md, Analytics page per role; plan of 6.3, decided item 12).
// Spending is 08's Actual total of the records not cancelled, by trip date (plan of 6.1, decided
// item 6; plan of 6.3, decided item 5, Look first), read from the summary `analytics_spending`,
// never from raw rows (developer-rules.md rule 12). Every number carries its change against the
// period before (10 point 1; decided item 16, Look first): the total against the period before, a
// category against that category then, a month against the month before it. Under `data.view`,
// the branch wall and the filters in the SQL of spendingWhere(), all in one snapshot.
//
// Every sum is read as text into a bigint, never a JavaScript number (CLAUDE.md rule 6).

export type Counted = { amount: bigint; change: Change };

export type SpendingBlock = {
  period: Period;
  before: Period;
  total: Counted;
  months: (Counted & { month: MonthKey })[];
  categories: (Counted & { id: string; name: string; isActive: boolean })[];
};

/**
 * The Spending block of a period and filters. Throws AuthorizationError for another branch's
 * `branch` filter, PeriodRefusedError for a period the address cannot name.
 */
export async function getSpending(
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<SpendingBlock> {
  return readSnapshot((db) => spendingIn(db, userId, input, filters));
}

async function spendingIn(
  db: Executor,
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<SpendingBlock> {
  const actor = await authorizeList(userId, "data.view", db);
  if (filters.branch) await authorize(userId, "data.view", { branchId: filters.branch }, db);
  const { period, before } = await resolvePeriod(db, input);

  const totals = await db.execute<{ now: string; before: string }>(sql`
    select coalesce(sum(amount) filter (where ${spendingWhere(actor, period, filters)}), 0)::text
             as now,
           coalesce(sum(amount) filter (where ${spendingWhere(actor, before, filters)}), 0)::text
             as before
    from analytics_spending`);
  const total = totals.rows[0]!;

  // The months of the period, and the whole month before its first one (decided item 16): a
  // month's point counts its days inside the period, its change the month before it.
  const months = monthsOf(period);
  const firstMonth = months[0]!;
  const series = { first: businessMonth(`${monthBefore(firstMonth)}-01`).first, last: period.last };
  const byMonth = await db.execute<{ month: string; inside: string; whole: string }>(sql`
    select to_char(purchased_on, 'YYYY-MM') as month,
           coalesce(sum(amount) filter (where purchased_on >= ${period.first}::date), 0)::text
             as inside,
           sum(amount)::text as whole
    from analytics_spending
    where ${spendingWhere(actor, series, filters)}
    group by 1`);
  const found = new Map(byMonth.rows.map((row) => [row.month, row]));
  let previous = BigInt(found.get(monthBefore(firstMonth))?.whole ?? "0");
  const monthRows = months.map((month) => {
    const amount = BigInt(found.get(month)?.inside ?? "0");
    const row = { month, amount, change: changeAgainst(amount, previous) };
    previous = amount;
    return row;
  });

  const byCategory = await db.execute<{
    id: string;
    name: string;
    is_active: boolean;
    now: string;
    before: string;
  }>(sql`
    select c.id, c.name, c.is_active,
           coalesce(sum(analytics_spending.amount) filter (where ${spendingWhere(actor, period, filters)}), 0)::text
             as now,
           coalesce(sum(analytics_spending.amount) filter (where ${spendingWhere(actor, before, filters)}), 0)::text
             as before
    from analytics_spending
    join categories c on c.id = analytics_spending.category_id
    where (${spendingWhere(actor, period, filters)}) or (${spendingWhere(actor, before, filters)})
    group by c.id
    order by sum(analytics_spending.amount) filter (where ${spendingWhere(actor, period, filters)}) desc nulls last,
             c.name, c.id`);

  return {
    period,
    before,
    total: counted(total.now, total.before),
    months: monthRows,
    categories: byCategory.rows.map((row) => ({
      id: row.id,
      name: row.name,
      isActive: row.is_active,
      ...counted(row.now, row.before),
    })),
  };
}

function counted(now: string, before: string): Counted {
  const amount = BigInt(now);
  return { amount, change: changeAgainst(amount, BigInt(before)) };
}
