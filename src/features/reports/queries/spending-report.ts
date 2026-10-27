import { type SQL, sql } from "drizzle-orm";

import type { DateRange } from "@/domain/analytics";
import { readSnapshot } from "@/server/read-snapshot";

import { authorizeAnalytics } from "../../analytics/authorize-filters";
import { spendingWhere } from "../../analytics/spending-where";
import type { ReportParams } from "../report-params";

// The Spending report (10-notifications-analytics-reports.md, Reports: "Totals by branch,
// category, department, supplier and month"; build-plan 6.8). Read from `analytics_spending`, each
// row the Actual total of one record not cancelled, under spendingWhere(), the condition of every
// Analytics spending number (plan of 6.8, decided item 1, Look first), so each table adds up to
// the same total as Analytics' Spending for the same dates. Every supplier with spending is
// listed, and the records with no supplier on one line of their own, so that table adds up too
// (decided item 9). The sums are of the stored amounts, no formula. Under `data.view`, the branch
// wall inside the SQL, in one snapshot.

/** One line of a table; `id` null is the "No supplier" line. */
export type SpendingLine = {
  id: string | null;
  name: string | null;
  records: number;
  amount: bigint;
};

export type SpendingReport = {
  range: DateRange;
  records: number;
  total: bigint;
  branches: SpendingLine[];
  categories: SpendingLine[];
  /** The line `id` null (branch null) holds the orders without a department, last (D68). */
  departments: (SpendingLine & { branchName: string | null })[];
  suppliers: SpendingLine[];
  /** Each month of the dates with spending, `id` and `name` its key `YYYY-MM`, in order. */
  months: SpendingLine[];
};

type LineRow = { id: string | null; name: string | null; records: string; amount: string };

const SUMS = sql`count(*)::text as records,
  coalesce(sum(analytics_spending.amount), 0)::text as amount`;

const lineOf = (row: LineRow): SpendingLine => ({
  id: row.id,
  name: row.name,
  records: Number(row.records),
  amount: BigInt(row.amount),
});

/** Throws AuthorizationError for another branch's `branch` filter. */
export async function getSpendingReport(
  userId: string,
  params: Pick<ReportParams, "range" | "filters">,
): Promise<SpendingReport> {
  return readSnapshot(async (db) => {
    const actor = await authorizeAnalytics(db, userId, params.filters);
    const where = spendingWhere(actor, params.range, params.filters);
    // One table: the sum per key, largest first, then by name.
    const grouped = async (columns: SQL, join: SQL, group: SQL, order?: SQL) =>
      (
        await db.execute<LineRow & { branch_name?: string }>(sql`
          select ${columns}, ${SUMS}
          from analytics_spending ${join}
          where ${where}
          group by ${group}
          order by ${order ?? sql`sum(analytics_spending.amount) desc, 2, 1`}`)
      ).rows;

    const total = (
      await db.execute<LineRow>(
        sql`select null as id, null as name, ${SUMS} from analytics_spending where ${where}`,
      )
    ).rows[0]!;
    const branches = await grouped(
      sql`b.id, b.name`,
      sql`join branches b on b.id = analytics_spending.branch_id`,
      sql`b.id`,
    );
    const categories = await grouped(
      sql`c.id, c.name`,
      sql`join categories c on c.id = analytics_spending.category_id`,
      sql`c.id`,
    );
    // The records of orders without a department group under a null id: "No department", last,
    // as "No supplier" (D68; plan of 2.5d-c, decided item 11).
    const departments = await grouped(
      sql`d.id, d.name, b.name as branch_name`,
      sql`left join departments d on d.id = analytics_spending.department_id
          left join branches b on b.id = d.branch_id`,
      sql`d.id, b.id`,
      sql`d.id is null, sum(analytics_spending.amount) desc, 2, 1`,
    );
    // The records with no supplier group under a null id: their own line, last.
    const suppliers = await grouped(
      sql`co.id, co.name`,
      sql`left join companies co on co.id = analytics_spending.supplier_id`,
      sql`co.id`,
      sql`co.id is null, sum(analytics_spending.amount) desc, 2, 1`,
    );
    const months = await grouped(
      sql`to_char(analytics_spending.purchased_on, 'YYYY-MM') as id,
          to_char(analytics_spending.purchased_on, 'YYYY-MM') as name`,
      sql``,
      sql`1, 2`,
      sql`1`,
    );

    return {
      range: params.range,
      records: Number(total.records),
      total: BigInt(total.amount),
      branches: branches.map(lineOf),
      categories: categories.map(lineOf),
      departments: departments.map((row) => ({
        ...lineOf(row),
        branchName: row.branch_name ?? null,
      })),
      suppliers: suppliers.map(lineOf),
      months: months.map(lineOf),
    };
  });
}
