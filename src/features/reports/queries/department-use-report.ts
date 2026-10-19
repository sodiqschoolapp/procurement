import { sql } from "drizzle-orm";

import type { DateRange } from "@/domain/analytics";
import { readSnapshot } from "@/server/read-snapshot";

import { authorizeAnalytics } from "../../analytics/authorize-filters";
import { SIGNED_QTY, SIGNED_VALUE, movesWhere } from "../../analytics/moves-where";
import { REPORT_PAGE_SIZE, type ReportParams } from "../report-params";

// The Use by department report (10-notifications-analytics-reports.md, Reports: "What each
// department received, in quantity and value"; build-plan 6.9a). Read from
// `analytics_stock_moves` under movesWhere(…, "use"), the rows of Analytics' use by department
// (plan of 6.4d, decided item 4, Look first; plan of 6.9a, decided item 3), so the total equals
// it for the same dates and filters: issues − returns of documents not Reversed, each movement's
// stored stockValue() at its own cost, on the document's date. Quantities per subtype, never
// added across subtypes (decided item 7); value per department and in all. SQL only adds the
// stored values. Under `data.view`, the branch wall inside the SQL, in one snapshot; the lines 25
// a page, or all for the file.

export type DepartmentUse = {
  id: string;
  name: string;
  branchCode: string;
  isActive: boolean;
  /** Whole so'm, signed: issued − returned in the dates. */
  value: bigint;
};

export type DepartmentUseLine = {
  departmentId: string;
  departmentName: string;
  branchCode: string;
  variantId: string;
  productName: string;
  /** `null` for the hidden default subtype of a product without subtypes. */
  subtypeName: string | null;
  unitShortName: string;
  /** numeric(14,3) text. */
  issued: string;
  returned: string;
  /** issued − returned, signed. */
  net: string;
  value: bigint;
};

export type DepartmentUseReport = {
  range: DateRange;
  total: bigint;
  departments: DepartmentUse[];
  lineCount: number;
  page: number;
  pages: number;
  lines: DepartmentUseLine[];
};

type LineRow = {
  department_id: string;
  department_name: string;
  department_active: boolean;
  branch_code: string;
  variant_id: string;
  product_name: string;
  subtype_name: string | null;
  unit_short_name: string;
  issued: string;
  returned: string;
  net: string;
  value: string;
};

/** Throws AuthorizationError for another branch's `branch` filter. */
export async function getDepartmentUseReport(
  userId: string,
  params: Pick<ReportParams, "range" | "filters">,
  page: number | "all",
): Promise<DepartmentUseReport> {
  return readSnapshot(async (db) => {
    const actor = await authorizeAnalytics(db, userId, params.filters);
    const where = movesWhere(actor, params.range, params.filters, "use");
    const found = await db.execute<LineRow>(sql`
      select dep.id as department_id, dep.name as department_name,
             dep.is_active as department_active, b.code as branch_code,
             v.id as variant_id, pr.name as product_name,
             case when v.is_default then null else v.name end as subtype_name,
             u.short_name as unit_short_name,
             coalesce(sum(analytics_stock_moves.qty)
               filter (where analytics_stock_moves.type = 'ISSUE'), 0)::text as issued,
             coalesce(sum(analytics_stock_moves.qty)
               filter (where analytics_stock_moves.type = 'RETURN'), 0)::text as returned,
             sum(${SIGNED_QTY})::text as net,
             sum(${SIGNED_VALUE})::text as value
      from analytics_stock_moves
      join departments dep on dep.id = analytics_stock_moves.department_id
      join branches b on b.id = dep.branch_id
      join product_variants v on v.id = analytics_stock_moves.variant_id
      join products pr on pr.id = v.product_id
      join units u on u.id = pr.unit_id
      where ${where}
      group by dep.id, b.code, v.id, pr.name, u.short_name
      order by dep.name, dep.id, pr.name, v.is_default desc, v.name, v.id`);

    const lines = found.rows.map((row): DepartmentUseLine => ({
      departmentId: row.department_id,
      departmentName: row.department_name,
      branchCode: row.branch_code,
      variantId: row.variant_id,
      productName: row.product_name,
      subtypeName: row.subtype_name,
      unitShortName: row.unit_short_name,
      issued: row.issued,
      returned: row.returned,
      net: row.net,
      value: BigInt(row.value),
    }));
    const byId = new Map<string, DepartmentUse>();
    for (const [index, line] of lines.entries()) {
      const row = found.rows[index]!;
      const entry = byId.get(line.departmentId) ?? {
        id: line.departmentId,
        name: line.departmentName,
        branchCode: line.branchCode,
        isActive: row.department_active,
        value: 0n,
      };
      entry.value += line.value;
      byId.set(line.departmentId, entry);
    }
    // Largest use first (plan of 6.9a, decided item 11); ties by name and id.
    const departments = [...byId.values()].sort(
      (a, b) =>
        (a.value === b.value ? 0 : a.value > b.value ? -1 : 1) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );

    const pages = Math.max(1, Math.ceil(lines.length / REPORT_PAGE_SIZE));
    const shown = page === "all" ? 1 : Math.min(page, pages);
    return {
      range: params.range,
      total: departments.reduce((sum, row) => sum + row.value, 0n),
      departments,
      lineCount: lines.length,
      page: shown,
      pages,
      lines:
        page === "all"
          ? lines
          : lines.slice((shown - 1) * REPORT_PAGE_SIZE, shown * REPORT_PAGE_SIZE),
    };
  });
}
