import { type SQL, sql } from "drizzle-orm";

import type { DateRange } from "@/domain/analytics";
import type { BusinessDate } from "@/domain/business-date";
import type { Colour } from "@/domain/colours";
import type { Executor } from "@/server/authorize";
import { readSnapshot } from "@/server/read-snapshot";

import {
  type AnalyticsFilters,
  type DrillKey,
  type PeriodInput,
  RECORDS_PAGE_SIZE,
} from "../period-params";
import { authorizeAnalytics } from "../authorize-filters";
import { outcomesWhere } from "../outcomes-where";
import { PeriodRefusedError, resolvePeriod } from "../resolve-period";

// The orders behind a Plan vs actual number (10-notifications-analytics-reports.md, Analytics page
// per role, point 3: "Clicking any bar, slice or number opens the list of orders or records that
// make it up"; build-plan 6.4a). The rows of `analytics_outcomes` under the same outcomesWhere()
// as the number (plan of 6.4, decided item 9): `period` every ended order, a colour, the overspent
// (red) or the saved (orange) ones; a branch or Manager cell sets that filter, "Other owners"
// sets `otherOwners`. Its count is the count clicked; its sum is the amount clicked (overspent
// −difference, saved the difference, otherwise the net difference). Names read live. Under
// `data.view`, the branch wall in the SQL, in one snapshot; 50 a page, or every row for the export.

export type OutcomeOrder = {
  orderId: string;
  orderNumber: string;
  productName: string;
  subtypeName: string | null;
  branchName: string;
  ownerName: string;
  endedOn: BusinessDate;
  colour: Colour;
  planned: bigint;
  actual: bigint;
  difference: bigint;
};

export type OutcomeOrders = {
  range: DateRange;
  key: DrillKey;
  otherOwners: boolean;
  count: number;
  /** Overspent: the sum of −difference; saved and the rest: the sum of the difference. */
  sum: bigint;
  page: number;
  rows: OutcomeOrder[];
};

export async function getOutcomeOrders(
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
  key: DrillKey,
  otherOwners: boolean,
  page: number | "all",
): Promise<OutcomeOrders> {
  return readSnapshot((db) => ordersIn(db, userId, input, filters, key, otherOwners, page));
}

function keyWhere(key: DrillKey): SQL {
  switch (key.kind) {
    case "period":
      return sql`true`;
    case "colour":
      return sql`analytics_outcomes.colour = ${key.colour}`;
    case "overspent":
      return sql`analytics_outcomes.colour = 'red'`;
    case "saved":
      return sql`analytics_outcomes.colour = 'amber'`;
    default:
      // A Spending key names no orders of this block.
      throw new PeriodRefusedError();
  }
}

async function ordersIn(
  db: Executor,
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
  key: DrillKey,
  otherOwners: boolean,
  page: number | "all",
): Promise<OutcomeOrders> {
  const actor = await authorizeAnalytics(db, userId, filters);
  const { period } = await resolvePeriod(db, input);
  const where = sql`(${outcomesWhere(actor, period, filters, otherOwners)}) and ${keyWhere(key)}`;
  const amount =
    key.kind === "overspent"
      ? sql`-analytics_outcomes.difference`
      : sql`analytics_outcomes.difference`;

  const summary = await db.execute<{ count: string; sum: string }>(sql`
    select count(*)::text as count, coalesce(sum(${amount}), 0)::text as sum
    from analytics_outcomes where ${where}`);
  const limit =
    page === "all"
      ? sql``
      : sql`limit ${RECORDS_PAGE_SIZE} offset ${(page - 1) * RECORDS_PAGE_SIZE}`;
  const rows = await db.execute<{
    order_id: string;
    number: string;
    product_name: string;
    subtype_name: string | null;
    branch_name: string;
    owner_name: string;
    ended_on: string;
    colour: Colour;
    planned: string;
    actual: string;
    difference: string;
  }>(sql`
    select analytics_outcomes.order_id, o.number, pr.name as product_name,
           case when v.is_default then null else v.name end as subtype_name,
           b.name as branch_name, u.full_name as owner_name,
           analytics_outcomes.ended_on::text as ended_on, analytics_outcomes.colour,
           analytics_outcomes.planned::text as planned, analytics_outcomes.actual::text as actual,
           analytics_outcomes.difference::text as difference
    from analytics_outcomes
    join orders o on o.id = analytics_outcomes.order_id
    join product_variants v on v.id = o.variant_id
    join products pr on pr.id = v.product_id
    join branches b on b.id = analytics_outcomes.branch_id
    join users u on u.id = analytics_outcomes.owner_id
    where ${where}
    order by analytics_outcomes.ended_on desc, o.number, analytics_outcomes.order_id
    ${limit}`);

  return {
    range: period,
    key,
    otherOwners,
    count: Number(summary.rows[0]!.count),
    sum: BigInt(summary.rows[0]!.sum),
    page: page === "all" ? 1 : page,
    rows: rows.rows.map((row) => ({
      orderId: row.order_id,
      orderNumber: row.number,
      productName: row.product_name,
      subtypeName: row.subtype_name,
      branchName: row.branch_name,
      ownerName: row.owner_name,
      endedOn: row.ended_on,
      colour: row.colour,
      planned: BigInt(row.planned),
      actual: BigInt(row.actual),
      difference: BigInt(row.difference),
    })),
  };
}
