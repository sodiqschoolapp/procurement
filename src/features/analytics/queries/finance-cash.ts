import { sql } from "drizzle-orm";

import {
  CASH_AGE_BAND_KEYS,
  type CashAgeBand,
  type MonthKey,
  type Period,
  cashAgeBand,
  monthBefore,
  monthsOf,
} from "@/domain/analytics";
import { businessMonth } from "@/domain/business-date";
import { managerCashBalance } from "@/domain/money-ledger";
import type { RequestStatus } from "@/domain/request-status";
import type { Executor } from "@/server/authorize";
import { readSnapshot } from "@/server/read-snapshot";

import { type Counted, counted } from "../counted";
import { authorizeAnalytics } from "../authorize-filters";
import { cashWhere } from "../cash-where";
import { moneyWhere } from "../money-where";
import {
  type AnalyticsFilters,
  CASH_KINDS,
  CASH_KIND_KEYS,
  type CashKind,
  type PeriodInput,
} from "../period-params";
import { resolvePeriod } from "../resolve-period";
import { daysOut } from "./cash-orders";

// Finance's Cash block (10-notifications-analytics-reports.md, Analytics page per role, Finance,
// Cash: "Given, returned and paid back by month; money with managers by age: up to 7 days, 8 to 30
// days, over 30 days"; build-plan 6.6a). The three cash kinds of the period, each against the
// period before, and by month, a month against the month before it, the first against the whole
// calendar month before the period (6.3 decided item 6; review of the plan of 6.6a, Must fix 1),
// summed from `analytics_money` under moneyWhere() (plan of 6.6a, decided item 2, Look first). The
// age bands are of now (decided items 3 and 6, Look first): every order of `analytics_cash` under
// cashWhere() with a count away from 0, its days since `since`, its band by `cashAgeBand()`, held
// and owed of each band by `managerCashBalance()`, never netted (08 Money with managers). Under
// `data.view`, the branch wall in the SQL, in one snapshot. Sums are read as text into bigint
// (CLAUDE.md rule 6).

export type CashKinds = Record<CashKind, Counted>;

export type CashAgeRow = {
  band: CashAgeBand;
  held: bigint;
  heldCount: number;
  owed: bigint;
  owedCount: number;
};

export type FinanceCash = {
  period: Period;
  before: Period;
  totals: CashKinds;
  months: ({ month: MonthKey } & CashKinds)[];
  ages: CashAgeRow[];
};

/** Throws AuthorizationError for another branch's filter, PeriodRefusedError for a bad period. */
export async function getFinanceCash(
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<FinanceCash> {
  return readSnapshot((db) => cashIn(db, userId, input, filters));
}

const sumOf = (kind: CashKind, where: ReturnType<typeof moneyWhere>) =>
  sql`coalesce(sum(analytics_money.amount) filter (where analytics_money.kind = ${CASH_KINDS[kind]} and ${where}), 0)::text`;

async function cashIn(
  db: Executor,
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
): Promise<FinanceCash> {
  const actor = await authorizeAnalytics(db, userId, filters);
  const { period, before } = await resolvePeriod(db, input);

  const now = moneyWhere(actor, period, filters);
  const then = moneyWhere(actor, before, filters);
  const found = await db.execute<Record<string, string>>(sql`
    select ${sql.join(
      CASH_KIND_KEYS.flatMap((kind) => [
        sql`${sumOf(kind, now)} as ${sql.identifier(`${kind}_now`)}`,
        sql`${sumOf(kind, then)} as ${sql.identifier(`${kind}_before`)}`,
      ]),
      sql`, `,
    )}
    from analytics_money`);
  const sums = found.rows[0]!;
  const totals = Object.fromEntries(
    CASH_KIND_KEYS.map((kind) => [kind, counted(sums[`${kind}_now`]!, sums[`${kind}_before`]!)]),
  ) as CashKinds;

  // The months of the period, and the whole month before its first one: a month counts its days
  // inside the period, its change the month before it (as getSpending()).
  const months = monthsOf(period);
  const firstMonth = months[0]!;
  const series = { first: businessMonth(`${monthBefore(firstMonth)}-01`).first, last: period.last };
  const byMonth = await db.execute<{
    month: string;
    kind: string;
    inside: string;
    whole: string;
  }>(sql`
    select to_char(occurred_on, 'YYYY-MM') as month, kind::text as kind,
           coalesce(sum(amount) filter (where occurred_on >= ${period.first}::date), 0)::text
             as inside,
           sum(amount)::text as whole
    from analytics_money
    where ${moneyWhere(actor, series, filters)}
    group by 1, 2`);
  const amountOf = (month: string, kind: CashKind, part: "inside" | "whole") =>
    byMonth.rows.find((row) => row.month === month && row.kind === CASH_KINDS[kind])?.[part] ?? "0";
  const previous = Object.fromEntries(
    CASH_KIND_KEYS.map((kind) => [kind, amountOf(monthBefore(firstMonth), kind, "whole")]),
  ) as Record<CashKind, string>;
  const monthRows = months.map((month) => {
    const row = { month } as { month: MonthKey } & CashKinds;
    for (const kind of CASH_KIND_KEYS) {
      const amount = amountOf(month, kind, "inside");
      row[kind] = counted(amount, previous[kind]);
      previous[kind] = amount;
    }
    return row;
  });

  const held = await db.execute<{ status: RequestStatus; cash_count: string; since: string }>(sql`
    select o.status, analytics_cash.cash_count::text as cash_count,
           analytics_cash.since::text as since
    from analytics_cash
    join orders o on o.id = analytics_cash.order_id
    where ${cashWhere(actor, filters, false, true)}`);
  const orders = held.rows.map((row) => ({
    status: row.status,
    cashCount: BigInt(row.cash_count),
    band: cashAgeBand(daysOut(row.since)),
  }));
  const ages = CASH_AGE_BAND_KEYS.map((band) => {
    const inBand = orders.filter((order) => order.band === band);
    return {
      band,
      ...managerCashBalance(inBand),
      heldCount: inBand.filter((order) => order.cashCount > 0n).length,
      owedCount: inBand.filter((order) => order.cashCount < 0n).length,
    };
  });

  return { period, before, totals, months: monthRows, ages };
}
