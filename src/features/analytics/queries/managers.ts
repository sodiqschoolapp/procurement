import { sql } from "drizzle-orm";

import { type Period, averageSom, changeAgainst, daysOf } from "@/domain/analytics";
import type { BusinessDate } from "@/domain/business-date";
import { managerCashBalance } from "@/domain/money-ledger";
import type { RequestStatus } from "@/domain/request-status";
import { decideList } from "@/domain/permissions";
import { AuthorizationError, type Executor } from "@/server/authorize";
import { today } from "@/server/clock";
import { readSnapshot } from "@/server/read-snapshot";

import type { AnalyticsFilters, PeriodInput } from "../period-params";
import { authorizeAnalytics } from "../authorize-filters";
import { cancelledWhere } from "../cancelled-where";
import { cashWhere } from "../cash-where";
import { outcomesWhere } from "../outcomes-where";
import { resolvePeriod } from "../resolve-period";
import type { Count } from "./plan-vs-actual";

// The Managers block of the Head's Analytics page (10-notifications-analytics-reports.md,
// Analytics page per role, Head: "Per Manager: number of orders, average difference from plan,
// cancelled purchase records, cash held and for how long"; build-plan 6.4c). One row per Manager,
// then one row of the owners who are not Managers (6.4a review correction 1):
// - orders and the average difference are of the owner's orders whose buying ended in the period,
//   the `analytics_outcomes` rows of Plan vs actual under the same outcomesWhere() (plan of 6.4c,
//   decided item 2, Look first); SQL adds the stored differences, `averageSom()` divides (decided
//   item 3), and the average's change is in so'm only (review of the plan, Should fix 1);
// - cancelled purchase records under cancelledWhere(), on the day of the cancel (decided item 5);
// - cash held is a number of now: `managerCashBalance()` of the owner's `analytics_cash` rows under
//   cashWhere() with their live status, and "held for" the whole Tashkent days from the oldest
//   date since when of those orders to today (decided item 4; review correction 1).
// Under `data.view`, the branch wall in the SQL, in one snapshot.

export type ManagerRow = {
  /** `null`: the row of the owners who are not Managers. */
  id: string | null;
  name: string | null;
  isActive: boolean;
  orders: Count;
  /** Whole so'm, signed (08 Difference); `null` when no order ended in the period. */
  average: bigint | null;
  /** Now − before in so'm; `null` when either period has no ended order. */
  averageChange: bigint | null;
  cancelled: Count;
  held: bigint;
  /** The oldest date since when of the held orders; `null` when nothing is held. */
  heldSince: BusinessDate | null;
  heldDays: number | null;
};

export type Managers = { period: Period; before: Period; rows: ManagerRow[] };

export async function getManagers(
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<Managers> {
  return readSnapshot((db) => managersIn(db, userId, input, filters));
}

type Owner = { id: string | null; name: string | null; is_active: boolean | null };

/** The group of an owner: a Manager by id, every other owner in the row with no id. */
const GROUP = sql`left join users m on m.id = u.id and u.role = 'MANAGER'`;

function count(now: string, before: string): Count {
  return { count: Number(now), change: changeAgainst(BigInt(now), BigInt(before)) };
}

async function managersIn(
  db: Executor,
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<Managers> {
  const actor = await authorizeAnalytics(db, userId, filters);
  // Every Manager's cash held is in the block: "See every Manager's cash" is the Head's and
  // Finance's (03 matrix; plan of 2.3b, the permission review's Must fix 1, Look first). After the
  // filters, so another branch's filter is still "Not found".
  if (decideList("money.managers", actor) !== "allow") throw new AuthorizationError("forbidden");
  const { period, before } = await resolvePeriod(db, input);
  const endedNow = outcomesWhere(actor, period, filters);
  const endedBefore = outcomesWhere(actor, before, filters);
  const cancelledNow = cancelledWhere(actor, period, filters);
  const cancelledBefore = cancelledWhere(actor, before, filters);

  const ended = await db.execute<
    Owner & { now_orders: string; before_orders: string; now_sum: string; before_sum: string }
  >(sql`
    select m.id, m.full_name as name, m.is_active,
           count(*) filter (where ${endedNow})::text as now_orders,
           count(*) filter (where ${endedBefore})::text as before_orders,
           coalesce(sum(analytics_outcomes.difference) filter (where ${endedNow}), 0)::text
             as now_sum,
           coalesce(sum(analytics_outcomes.difference) filter (where ${endedBefore}), 0)::text
             as before_sum
    from analytics_outcomes
    join users u on u.id = analytics_outcomes.owner_id
    ${GROUP}
    where (${endedNow}) or (${endedBefore})
    group by m.id`);
  const cancelled = await db.execute<Owner & { now_count: string; before_count: string }>(sql`
    select m.id, m.full_name as name, m.is_active,
           count(*) filter (where ${cancelledNow})::text as now_count,
           count(*) filter (where ${cancelledBefore})::text as before_count
    from analytics_cancelled
    join users u on u.id = analytics_cancelled.owner_id
    ${GROUP}
    where (${cancelledNow}) or (${cancelledBefore})
    group by m.id`);
  // Few rows: the open orders holding cash. The balance is summed by the domain, not by SQL.
  const cash = await db.execute<
    Owner & { status: RequestStatus; cash_count: string; since: string }
  >(sql`
    select m.id, m.full_name as name, m.is_active, o.status,
           analytics_cash.cash_count::text as cash_count, analytics_cash.since::text as since
    from analytics_cash
    join orders o on o.id = analytics_cash.order_id
    join users u on u.id = analytics_cash.owner_id
    ${GROUP}
    where ${cashWhere(actor, filters)}`);

  const rows = new Map<string | null, ManagerRow>();
  const rowOf = (owner: Owner): ManagerRow => {
    let row = rows.get(owner.id);
    if (!row) {
      row = {
        id: owner.id,
        name: owner.name,
        isActive: owner.is_active ?? true,
        orders: count("0", "0"),
        average: null,
        averageChange: null,
        cancelled: count("0", "0"),
        held: 0n,
        heldSince: null,
        heldDays: null,
      };
      rows.set(owner.id, row);
    }
    return row;
  };
  for (const each of ended.rows) {
    const row = rowOf(each);
    row.orders = count(each.now_orders, each.before_orders);
    row.average = averageSom(BigInt(each.now_sum), Number(each.now_orders));
    const was = averageSom(BigInt(each.before_sum), Number(each.before_orders));
    row.averageChange = row.average === null || was === null ? null : row.average - was;
  }
  for (const each of cancelled.rows) {
    rowOf(each).cancelled = count(each.now_count, each.before_count);
  }
  const held = new Map<string | null, { status: RequestStatus; cashCount: bigint }[]>();
  for (const each of cash.rows) {
    const row = rowOf(each);
    const list = held.get(each.id) ?? [];
    list.push({ status: each.status, cashCount: BigInt(each.cash_count) });
    held.set(each.id, list);
    if (row.heldSince === null || each.since < row.heldSince) row.heldSince = each.since;
  }
  const day = today();
  for (const [id, list] of held) {
    const row = rows.get(id)!;
    row.held = managerCashBalance(list).held;
    // daysOf() counts both ends: the same day is 0 days held.
    row.heldDays = row.heldSince === null ? null : daysOf({ first: row.heldSince, last: day }) - 1;
  }

  return {
    period,
    before,
    rows: [...rows.values()].sort(
      (a, b) =>
        Number(a.id === null) - Number(b.id === null) ||
        (a.name ?? "").localeCompare(b.name ?? "") ||
        (a.id ?? "").localeCompare(b.id ?? ""),
    ),
  };
}
