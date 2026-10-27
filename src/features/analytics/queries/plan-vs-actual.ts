import { type SQL, sql } from "drizzle-orm";

import { type Change, type Period, changeAgainst, shareChange, shareOf } from "@/domain/analytics";
import type { Colour } from "@/domain/colours";
import type { Executor } from "@/server/authorize";
import { analyticsUnpriced } from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";

import { type AnalyticsFilters, OUTCOME_COLOURS, type PeriodInput } from "../period-params";
import { authorizeAnalytics } from "../authorize-filters";
import { outcomesWhere } from "../outcomes-where";
import { resolvePeriod } from "../resolve-period";
import { type Counted, counted } from "../counted";

// The Plan vs actual block of the Head's Analytics page (10-notifications-analytics-reports.md,
// Analytics page per role, Head: "Share of orders ending green, orange and red; total overspent
// and total saved; by branch and by Manager"; build-plan 6.4a). Read from `analytics_outcomes`,
// each row `orderOutcome()` of one order (plan of 6.4, decided items 3 to 5, Look first), under
// outcomesWhere(), the condition its drill-down and export share. Overspent is the sum of
// −difference of the red orders, saved the sum of the difference of the orange ones (08
// Difference). Every number with its change against the period before (10 point 1; decided
// item 7): a count and an amount by changeAgainst(), a share in percentage points by
// shareChange(). The by-Manager rows end with one row of the owners who are not Managers (review
// of the plan, correction 1). Under `data.view`, the branch wall in the SQL, in one snapshot.

/** A count of orders and its change; the change's difference is in orders, not so'm. */
export type Count = { count: number; change: Change };

export type ColourCount = Count & { share: string | null; shareChange: string | null };

export type Tally = {
  /** The orders with an outcome: the colours, overspent and saved are of these. */
  orders: Count;
  /**
   * The ended orders without a planned price these sums leave out (08 Numbers: "a sum that leaves
   * orders out says how many"; plan of 2.5d-c, decided items 3 and 4, Look first).
   */
  unpriced: Count;
  colours: Record<Colour, ColourCount>;
  overspent: Counted;
  saved: Counted;
};

export type PlanVsActual = {
  period: Period;
  before: Period;
  total: Tally;
  /** Every branch of the user with an ended order in either period, inactive ones marked. */
  branches: (Tally & { id: string; name: string; isActive: boolean })[];
  /** Per Manager; the last row, `id` null, holds the owners who are not Managers. */
  managers: (Tally & { id: string | null; name: string | null; isActive: boolean })[];
};

export async function getPlanVsActual(
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<PlanVsActual> {
  return readSnapshot((db) => planIn(db, userId, input, filters));
}

type TallyRow = Record<`${"now" | "before"}_${"orders" | Colour | "overspent" | "saved"}`, string>;

/** The sums of one group in the period and the period before. */
function tallyColumns(now: SQL | undefined, then: SQL | undefined): SQL {
  const of = (name: "now" | "before", where: SQL | undefined) => sql`
    count(*) filter (where ${where})::text as ${sql.raw(`${name}_orders`)},
    count(*) filter (where (${where}) and analytics_outcomes.colour = 'green')::text
      as ${sql.raw(`${name}_green`)},
    count(*) filter (where (${where}) and analytics_outcomes.colour = 'amber')::text
      as ${sql.raw(`${name}_amber`)},
    count(*) filter (where (${where}) and analytics_outcomes.colour = 'red')::text
      as ${sql.raw(`${name}_red`)},
    coalesce(sum(-analytics_outcomes.difference)
               filter (where (${where}) and analytics_outcomes.colour = 'red'), 0)::text
      as ${sql.raw(`${name}_overspent`)},
    coalesce(sum(analytics_outcomes.difference)
               filter (where (${where}) and analytics_outcomes.colour = 'amber'), 0)::text
      as ${sql.raw(`${name}_saved`)}`;
  return sql`${of("now", now)}, ${of("before", then)}`;
}

function count(now: string, before: string): Count {
  return { count: Number(now), change: changeAgainst(BigInt(now), BigInt(before)) };
}

type UnpricedRow = { now_unpriced: string; before_unpriced: string };

const NO_UNPRICED: UnpricedRow = { now_unpriced: "0", before_unpriced: "0" };
const NO_OUTCOME = Object.fromEntries(
  (["now", "before"] as const).flatMap((name) =>
    (["orders", ...OUTCOME_COLOURS, "overspent", "saved"] as const).map((column) => [
      `${name}_${column}`,
      "0",
    ]),
  ),
) as TallyRow;

/** The count of `analytics_unpriced` rows in the period and the period before. */
function unpricedColumns(now: SQL | undefined, then: SQL | undefined): SQL {
  return sql`count(*) filter (where ${now})::text as now_unpriced,
    count(*) filter (where ${then})::text as before_unpriced`;
}

function tallyOf(row: TallyRow, unpriced: UnpricedRow = NO_UNPRICED): Tally {
  const ordersNow = Number(row.now_orders);
  const ordersBefore = Number(row.before_orders);
  const colours = Object.fromEntries(
    OUTCOME_COLOURS.map((colour) => {
      const share = shareOf(Number(row[`now_${colour}`]), ordersNow);
      return [
        colour,
        {
          ...count(row[`now_${colour}`], row[`before_${colour}`]),
          share,
          shareChange: shareChange(share, shareOf(Number(row[`before_${colour}`]), ordersBefore)),
        },
      ];
    }),
  ) as Record<Colour, ColourCount>;
  return {
    orders: count(row.now_orders, row.before_orders),
    unpriced: count(unpriced.now_unpriced, unpriced.before_unpriced),
    colours,
    overspent: counted(row.now_overspent, row.before_overspent),
    saved: counted(row.now_saved, row.before_saved),
  };
}

async function planIn(
  db: Executor,
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<PlanVsActual> {
  const actor = await authorizeAnalytics(db, userId, filters);
  const { period, before } = await resolvePeriod(db, input);
  const now = outcomesWhere(actor, period, filters);
  const then = outcomesWhere(actor, before, filters);
  const columns = tallyColumns(now, then);
  const unpricedNow = outcomesWhere(actor, period, filters, false, analyticsUnpriced);
  const unpricedThen = outcomesWhere(actor, before, filters, false, analyticsUnpriced);
  const unpricedCounts = unpricedColumns(unpricedNow, unpricedThen);
  const unpricedWhere = sql`(${unpricedNow}) or (${unpricedThen})`;

  const total = await db.execute<TallyRow>(sql`
    select ${columns} from analytics_outcomes where (${now}) or (${then})`);
  const branches = await db.execute<TallyRow & { id: string; name: string; is_active: boolean }>(
    sql`
      select b.id, b.name, b.is_active, ${columns}
      from analytics_outcomes
      join branches b on b.id = analytics_outcomes.branch_id
      where (${now}) or (${then})
      group by b.id
      order by b.name, b.id`,
  );
  // An owner who is not a Manager (the Head, 03 rule 6) goes into the one row with no id.
  const managers = await db.execute<
    TallyRow & { id: string | null; name: string | null; is_active: boolean | null }
  >(sql`
    select m.id, m.full_name as name, m.is_active, ${columns}
    from analytics_outcomes
    join users u on u.id = analytics_outcomes.owner_id
    left join users m on m.id = u.id and u.role = 'MANAGER'
    where (${now}) or (${then})
    group by m.id
    order by m.id is null, m.full_name, m.id`);

  const unpricedTotal = await db.execute<UnpricedRow>(sql`
    select ${unpricedCounts} from analytics_unpriced where ${unpricedWhere}`);
  const unpricedBranches = await db.execute<
    UnpricedRow & { id: string; name: string; is_active: boolean }
  >(sql`
    select b.id, b.name, b.is_active, ${unpricedCounts}
    from analytics_unpriced
    join branches b on b.id = analytics_unpriced.branch_id
    where ${unpricedWhere}
    group by b.id`);
  const unpricedManagers = await db.execute<
    UnpricedRow & { id: string | null; name: string | null; is_active: boolean | null }
  >(sql`
    select m.id, m.full_name as name, m.is_active, ${unpricedCounts}
    from analytics_unpriced
    join users u on u.id = analytics_unpriced.owner_id
    left join users m on m.id = u.id and u.role = 'MANAGER'
    where ${unpricedWhere}
    group by m.id`);

  // A branch or Manager with only unpriced ended orders has its line: no outcome, the count
  // (plan of 2.5d-c, decided item 3, Look first).
  type Line = { id: string | null; name: string | null; is_active: boolean | null };
  const merged = <T extends Line>(outcomes: (T & TallyRow)[], unpriced: (T & UnpricedRow)[]) => {
    const lines = new Map<string | null, { line: Line; tally: TallyRow; unpriced?: UnpricedRow }>();
    for (const row of outcomes) lines.set(row.id, { line: row, tally: row });
    for (const row of unpriced) {
      const found = lines.get(row.id);
      if (found) found.unpriced = row;
      else lines.set(row.id, { line: row, tally: NO_OUTCOME, unpriced: row });
    }
    return [...lines.values()].map(({ line, tally, unpriced: count }) => ({
      id: line.id,
      name: line.name,
      isActive: line.is_active ?? true,
      ...tallyOf(tally, count),
    }));
  };
  const byName = (a: { id: string | null; name: string | null }, b: typeof a) =>
    Number(a.id === null) - Number(b.id === null) ||
    (a.name ?? "").localeCompare(b.name ?? "") ||
    (a.id ?? "").localeCompare(b.id ?? "");

  return {
    period,
    before,
    total: tallyOf(total.rows[0]!, unpricedTotal.rows[0]!),
    branches: merged(branches.rows, unpricedBranches.rows)
      .map((row) => ({ ...row, id: row.id!, name: row.name! }))
      .sort(byName),
    managers: merged(managers.rows, unpricedManagers.rows).sort(byName),
  };
}
