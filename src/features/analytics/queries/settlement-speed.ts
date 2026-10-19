import { sql } from "drizzle-orm";

import { type Period, averageDays, shareChange } from "@/domain/analytics";
import type { Executor } from "@/server/authorize";
import { readSnapshot } from "@/server/read-snapshot";

import type { AnalyticsFilters, PeriodInput } from "../period-params";
import { authorizeAnalytics } from "../authorize-filters";
import { resolvePeriod } from "../resolve-period";
import { settlementsWhere } from "../settlements-where";

// The Settlement speed block of Finance's Analytics page (10-notifications-analytics-reports.md,
// Analytics page per role, Finance: "Average days from 'Send to settlement' to Closed"; build-plan
// 6.6b). Read from `analytics_settlements`, each row a settlement of `settlementStays()` (plan of
// 6.6b, decided item 3, Look first), under settlementsWhere(), the condition its drill-down and
// export share. SQL only adds whole seconds and counts; every average is `averageDays()` of a
// set's own sum and count, the total included, never a mean of the branch rows. Every number with
// its change against the period before (10 point 1; review of the plan, correction 1): days as the
// difference of two one-decimal numbers (`shareChange()`, as Approval speed's hours), the count of
// settlements beside it. Per branch, as Approval speed reads per branch (decided item 6). Under
// `data.view`, the branch wall in the SQL, in one snapshot.

/** An average of days and its change in days; `null` when the set has no settlement. */
export type Days = { days: string | null; count: number; change: string | null };

export type SettlementSpeed = {
  period: Period;
  before: Period;
  total: Days;
  /** Every branch of the user with a settlement in either period, by name. */
  branches: (Days & { id: string; name: string; isActive: boolean })[];
};

export async function getSettlementSpeed(
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<SettlementSpeed> {
  return readSnapshot((db) => speedIn(db, userId, input, filters));
}

type Sums = {
  now_seconds: string;
  now_count: string;
  before_seconds: string;
  before_count: string;
};

function daysOf(row: Sums): Days {
  const days = averageDays(BigInt(row.now_seconds), Number(row.now_count));
  return {
    days,
    count: Number(row.now_count),
    change: shareChange(days, averageDays(BigInt(row.before_seconds), Number(row.before_count))),
  };
}

async function speedIn(
  db: Executor,
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<SettlementSpeed> {
  const actor = await authorizeAnalytics(db, userId, filters);
  const { period, before } = await resolvePeriod(db, input);
  const now = settlementsWhere(actor, period, filters);
  const then = settlementsWhere(actor, before, filters);
  const columns = sql`
    coalesce(sum(analytics_settlements.seconds) filter (where ${now}), 0)::text as now_seconds,
    count(*) filter (where ${now})::text as now_count,
    coalesce(sum(analytics_settlements.seconds) filter (where ${then}), 0)::text as before_seconds,
    count(*) filter (where ${then})::text as before_count`;

  const total = await db.execute<Sums>(sql`select ${columns} from analytics_settlements`);
  const branches = await db.execute<Sums & { id: string; name: string; is_active: boolean }>(sql`
    select b.id, b.name, b.is_active, ${columns}
    from analytics_settlements
    join branches b on b.id = analytics_settlements.branch_id
    where (${now}) or (${then})
    group by b.id
    order by b.name, b.id`);

  return {
    period,
    before,
    total: daysOf(total.rows[0]!),
    branches: branches.rows.map((row) => ({
      id: row.id,
      name: row.name,
      isActive: row.is_active,
      ...daysOf(row),
    })),
  };
}
