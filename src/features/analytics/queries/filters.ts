import { sql } from "drizzle-orm";

import { type PeriodChoice, periodChoices } from "@/domain/analytics";
import { authorizeList, branchFilter } from "@/server/authorize";
import { branches, departments, userBranches } from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";
import { readSettings } from "@/server/settings";

// What the period picker and the filter bar of the Analytics page offer (10-notifications-
// analytics-reports.md, Analytics page per role, points 1 and 2; build-plan 6.3): the period
// choices, the school year only once `school_year_start` is set; the branches the user sees; the
// departments of those branches; the Managers with one of those branches (plan of 6.3, decided
// item 6); every category and supplier. Inactive entries are listed too, marked: the filters read
// history (plan of 1.5, decision 2; decided item 11). Under `data.view`, the branch wall in the
// SQL, in one snapshot, with the last refresh of the summary (decided item 13).

export type FilterOption = { id: string; name: string; isActive: boolean };

export type AnalyticsFilterOptions = {
  periods: PeriodChoice[];
  branches: FilterOption[];
  categories: FilterOption[];
  departments: (FilterOption & { branchName: string })[];
  managers: FilterOption[];
  suppliers: FilterOption[];
  /** When `analytics_refresh` last finished; `null` before its first run. */
  refreshedAt: Date | null;
};

type Row = { id: string; name: string; is_active: boolean };
const option = (row: Row): FilterOption => ({
  id: row.id,
  name: row.name,
  isActive: row.is_active,
});

export async function getAnalyticsFilters(userId: string): Promise<AnalyticsFilterOptions> {
  return readSnapshot(async (db) => {
    const actor = await authorizeList(userId, "data.view", db);
    const settings = await readSettings(db);
    const visibleBranch = branchFilter(actor, branches.id) ?? sql`true`;
    const visibleDepartment = branchFilter(actor, departments.branchId) ?? sql`true`;
    const visibleManager = branchFilter(actor, userBranches.branchId) ?? sql`true`;

    const branchRows = await db.execute<Row>(sql`
      select id, name, is_active from branches where ${visibleBranch} order by code`);
    const categoryRows = await db.execute<Row>(sql`
      select id, name, is_active from categories order by name, id`);
    const departmentRows = await db.execute<Row & { branch_name: string }>(sql`
      select departments.id, departments.name, departments.is_active, b.name as branch_name
      from departments join branches b on b.id = departments.branch_id
      where ${visibleDepartment}
      order by b.code, departments.name, departments.id`);
    const managerRows = await db.execute<Row>(sql`
      select u.id, u.full_name as name, u.is_active from users u
      where u.role = 'MANAGER'
        and exists (select 1 from user_branches where user_branches.user_id = u.id
                    and ${visibleManager})
      order by u.full_name, u.id`);
    const supplierRows = await db.execute<Row>(sql`
      select id, name, is_active from companies where kind in ('SUPPLIER', 'BOTH')
      order by name, id`);
    const refreshed = await db.execute<{ last_finished_at: Date | null }>(sql`
      select last_finished_at from scheduled_jobs where name = 'analytics_refresh'`);

    return {
      periods: periodChoices(settings.school_year_start),
      branches: branchRows.rows.map(option),
      categories: categoryRows.rows.map(option),
      departments: departmentRows.rows.map((row) => ({
        ...option(row),
        branchName: row.branch_name,
      })),
      managers: managerRows.rows.map(option),
      suppliers: supplierRows.rows.map(option),
      refreshedAt: refreshed.rows[0]?.last_finished_at
        ? new Date(refreshed.rows[0].last_finished_at)
        : null,
    };
  });
}
