import { type SQL, sql } from "drizzle-orm";

import type { DateRange } from "@/domain/analytics";
import type { BusinessDate } from "@/domain/business-date";
import type { Colour } from "@/domain/colours";
import type { Executor } from "@/server/authorize";
import { analyticsOutcomes, analyticsUnpriced } from "@/server/db/schema";
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
// −difference, saved the difference, otherwise the net difference). `unpriced` lists the ended
// orders without a planned price, the rows of `analytics_unpriced` under the same outcomesWhere():
// no planned total, difference or colour, and its sum is their actual total (plan of 2.5d-c,
// decided item 4, Look first). Names read live. Under
// `data.view`, the branch wall in the SQL, in one snapshot; 25 a page, or every row for the export.

export type OutcomeOrder = {
  orderId: string;
  orderNumber: string;
  productName: string;
  subtypeName: string | null;
  branchName: string;
  ownerName: string;
  endedOn: BusinessDate;
  /** `null`, and planned and difference with it, for an order without a planned price. */
  colour: Colour | null;
  planned: bigint | null;
  actual: bigint;
  difference: bigint | null;
};

export type OutcomeOrders = {
  range: DateRange;
  key: DrillKey;
  otherOwners: boolean;
  count: number;
  /**
   * Overspent: the sum of −difference; unpriced: the sum of the actual totals; saved and the rest:
   * the sum of the difference.
   */
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
    case "unpriced":
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
  const unpriced = key.kind === "unpriced";
  const table = unpriced ? analyticsUnpriced : analyticsOutcomes;
  const from = unpriced ? sql`analytics_unpriced` : sql`analytics_outcomes`;
  const where = sql`(${outcomesWhere(actor, period, filters, otherOwners, table)}) and ${keyWhere(key)}`;
  const amount = unpriced
    ? sql`analytics_unpriced.actual`
    : key.kind === "overspent"
      ? sql`-analytics_outcomes.difference`
      : sql`analytics_outcomes.difference`;
  const plan = unpriced
    ? sql`null as colour, null as planned, analytics_unpriced.actual::text as actual,
          null as difference`
    : sql`analytics_outcomes.colour, analytics_outcomes.planned::text as planned,
          analytics_outcomes.actual::text as actual,
          analytics_outcomes.difference::text as difference`;

  const summary = await db.execute<{ count: string; sum: string }>(sql`
    select count(*)::text as count, coalesce(sum(${amount}), 0)::text as sum
    from ${from} where ${where}`);
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
    colour: Colour | null;
    planned: string | null;
    actual: string;
    difference: string | null;
  }>(sql`
    select ${from}.order_id, o.number, pr.name as product_name,
           case when v.is_default then null else v.name end as subtype_name,
           b.name as branch_name, u.full_name as owner_name,
           ${from}.ended_on::text as ended_on, ${plan}
    from ${from}
    -- The draft wall in the SQL (permission review of 2.7 and of 6.4a): an ended order is never a
    -- Draft today, and a later refresh must not let one through.
    join orders o on o.id = ${from}.order_id and o.status <> 'DRAFT'
    join product_variants v on v.id = o.variant_id
    join products pr on pr.id = v.product_id
    join branches b on b.id = ${from}.branch_id
    join users u on u.id = ${from}.owner_id
    where ${where}
    order by ${from}.ended_on desc, o.number, ${from}.order_id
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
      planned: row.planned === null ? null : BigInt(row.planned),
      actual: BigInt(row.actual),
      difference: row.difference === null ? null : BigInt(row.difference),
    })),
  };
}
