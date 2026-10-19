import { sql } from "drizzle-orm";

import type { DateRange } from "@/domain/analytics";
import type { BusinessDate } from "@/domain/business-date";
import type { Colour } from "@/domain/colours";
import { readSnapshot } from "@/server/read-snapshot";

import { authorizeAnalytics } from "../../analytics/authorize-filters";
import { outcomesWhere } from "../../analytics/outcomes-where";
import { REPORT_PAGE_SIZE, type ReportParams } from "../report-params";

// The Planned vs actual report (10-notifications-analytics-reports.md, Reports: "Differences per
// order, product and Manager"; build-plan 6.8). Read from `analytics_outcomes`, each row
// orderOutcome() of one order whose buying ended Done or Done short, under outcomesWhere(), the
// condition of Analytics' Plan vs actual (plan of 6.8, decided items 1 and 3, Look first): the
// same orders, the same amounts. Difference is planned − actual (08 Difference): above 0 saved,
// below 0 overspent. Per product is the order's planned product, read live from the order (review
// of the plan, correction 3); per Manager ends with one line of the owners who are not Managers,
// as Analytics (plan of 6.4a, correction 1). The sums are of the stored amounts, no formula. Under
// `data.view`, the branch wall inside the SQL, in one snapshot; the orders 25 a page (11 rule 8),
// or all for the export.

export type Sums = { orders: number; planned: bigint; actual: bigint; difference: bigint };

export type OutcomeOrder = {
  orderId: string;
  number: string;
  branchName: string;
  ownerName: string;
  productName: string;
  /** The planned subtype, `null` for a product without subtypes. */
  subtypeName: string | null;
  endedOn: BusinessDate;
  colour: Colour;
  planned: bigint;
  actual: bigint;
  difference: bigint;
};

export type PlanVsActualReport = {
  range: DateRange;
  total: Sums;
  page: number;
  pages: number;
  orders: OutcomeOrder[];
  products: (Sums & { id: string; name: string })[];
  /** Per Manager; the last line, `id` null, holds the owners who are not Managers. */
  managers: (Sums & { id: string | null; name: string | null })[];
};

type SumsRow = { orders: string; planned: string; actual: string; difference: string };

const SUMS = sql`count(*)::text as orders,
  coalesce(sum(analytics_outcomes.planned), 0)::text as planned,
  coalesce(sum(analytics_outcomes.actual), 0)::text as actual,
  coalesce(sum(analytics_outcomes.difference), 0)::text as difference`;

const sumsOf = (row: SumsRow): Sums => ({
  orders: Number(row.orders),
  planned: BigInt(row.planned),
  actual: BigInt(row.actual),
  difference: BigInt(row.difference),
});

/** Throws AuthorizationError for another branch's `branch` filter. */
export async function getPlanVsActualReport(
  userId: string,
  params: Pick<ReportParams, "range" | "filters">,
  page: number | "all",
): Promise<PlanVsActualReport> {
  return readSnapshot(async (db) => {
    const actor = await authorizeAnalytics(db, userId, params.filters);
    const where = outcomesWhere(actor, params.range, params.filters) ?? sql`true`;

    const total = sumsOf(
      (await db.execute<SumsRow>(sql`select ${SUMS} from analytics_outcomes where ${where}`))
        .rows[0]!,
    );
    const pages = Math.max(1, Math.ceil(total.orders / REPORT_PAGE_SIZE));
    const shown = page === "all" ? 1 : Math.min(page, pages);
    const limit =
      page === "all"
        ? sql``
        : sql`limit ${REPORT_PAGE_SIZE} offset ${(shown - 1) * REPORT_PAGE_SIZE}`;
    const orders = await db.execute<{
      order_id: string;
      number: string;
      branch_name: string;
      owner_name: string;
      product_name: string;
      subtype_name: string | null;
      ended_on: string;
      colour: Colour;
      planned: string;
      actual: string;
      difference: string;
    }>(sql`
      select analytics_outcomes.order_id, o.number, b.name as branch_name,
             u.full_name as owner_name, pr.name as product_name,
             case when v.is_default then null else v.name end as subtype_name,
             analytics_outcomes.ended_on::text as ended_on, analytics_outcomes.colour,
             analytics_outcomes.planned::text as planned, analytics_outcomes.actual::text as actual,
             analytics_outcomes.difference::text as difference
      from analytics_outcomes
      join orders o on o.id = analytics_outcomes.order_id
      join branches b on b.id = analytics_outcomes.branch_id
      join users u on u.id = analytics_outcomes.owner_id
      join product_variants v on v.id = o.variant_id
      join products pr on pr.id = v.product_id
      where ${where}
      order by analytics_outcomes.ended_on desc, o.number, analytics_outcomes.order_id
      ${limit}`);
    const products = await db.execute<SumsRow & { id: string; name: string }>(sql`
      select pr.id, pr.name, ${SUMS}
      from analytics_outcomes
      join orders o on o.id = analytics_outcomes.order_id
      join product_variants v on v.id = o.variant_id
      join products pr on pr.id = v.product_id
      where ${where}
      group by pr.id
      order by pr.name, pr.id`);
    // An owner who is not a Manager (the Head, 03 rule 6) goes into the one line with no id.
    const managers = await db.execute<SumsRow & { id: string | null; name: string | null }>(sql`
      select m.id, m.full_name as name, ${SUMS}
      from analytics_outcomes
      join users u on u.id = analytics_outcomes.owner_id
      left join users m on m.id = u.id and u.role = 'MANAGER'
      where ${where}
      group by m.id
      order by m.id is null, m.full_name, m.id`);

    return {
      range: params.range,
      total,
      page: shown,
      pages,
      orders: orders.rows.map((row) => ({
        orderId: row.order_id,
        number: row.number,
        branchName: row.branch_name,
        ownerName: row.owner_name,
        productName: row.product_name,
        subtypeName: row.subtype_name,
        endedOn: row.ended_on,
        colour: row.colour,
        planned: BigInt(row.planned),
        actual: BigInt(row.actual),
        difference: BigInt(row.difference),
      })),
      products: products.rows.map((row) => ({ id: row.id, name: row.name, ...sumsOf(row) })),
      managers: managers.rows.map((row) => ({ id: row.id, name: row.name, ...sumsOf(row) })),
    };
  });
}
