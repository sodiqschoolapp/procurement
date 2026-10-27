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
// decided item 4, Look first). `ended` lists every ended order, the rows of both tables under the
// one outcomesWhere(): the Managers block's "number of orders" counts priced and unpriced alike
// (plan of 2.5d-c, decided item 5, Look first; review of 2.5d-c, finding 1), its sum is the net
// difference of the priced ones and `unpriced` says how many it leaves out. Names read live. Under
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
  /** The rows without a planned price, which the sum leaves out (08 Numbers). */
  unpriced: number;
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
    case "ended":
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
  const outcomes = sql`
    select order_id, branch_id, owner_id, ended_on, colour::text as colour, planned, actual,
           difference
    from analytics_outcomes
    where (${outcomesWhere(actor, period, filters, otherOwners, analyticsOutcomes)})
      and ${keyWhere(key)}`;
  const unpriced = sql`
    select order_id, branch_id, owner_id, ended_on, null::text as colour, null::bigint as planned,
           actual, null::bigint as difference
    from analytics_unpriced
    where ${outcomesWhere(actor, period, filters, otherOwners, analyticsUnpriced)}`;
  const source =
    key.kind === "unpriced"
      ? unpriced
      : key.kind === "ended"
        ? sql`${outcomes} union all ${unpriced}`
        : outcomes;
  const amount =
    key.kind === "unpriced"
      ? sql`e.actual`
      : key.kind === "overspent"
        ? sql`-e.difference`
        : sql`e.difference`;

  const summary = await db.execute<{ count: string; unpriced: string; sum: string }>(sql`
    select count(*)::text as count, count(*) filter (where e.planned is null)::text as unpriced,
           coalesce(sum(${amount}), 0)::text as sum
    from (${source}) e`);
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
    select e.order_id, o.number, pr.name as product_name,
           case when v.is_default then null else v.name end as subtype_name,
           b.name as branch_name, u.full_name as owner_name, e.ended_on::text as ended_on,
           e.colour, e.planned::text as planned, e.actual::text as actual,
           e.difference::text as difference
    from (${source}) e
    -- The draft wall in the SQL (permission review of 2.7 and of 6.4a): an ended order is never a
    -- Draft today, and a later refresh must not let one through.
    join orders o on o.id = e.order_id and o.status <> 'DRAFT'
    join product_variants v on v.id = o.variant_id
    join products pr on pr.id = v.product_id
    join branches b on b.id = e.branch_id
    join users u on u.id = e.owner_id
    order by e.ended_on desc, o.number, e.order_id
    ${limit}`);

  return {
    range: period,
    key,
    otherOwners,
    count: Number(summary.rows[0]!.count),
    unpriced: Number(summary.rows[0]!.unpriced),
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
