import { sql } from "drizzle-orm";

import type { Actor } from "@/domain/permissions";
import {
  AuthorizationError,
  type Executor,
  authorize,
  authorizeList,
  branchFilter,
} from "@/server/authorize";
import { userBranches } from "@/server/db/schema";

import { type AnalyticsFilters, NO_DEPARTMENT } from "./period-params";

// The permission of an Analytics query and the ids of its filters (03-roles-and-permissions.md
// rule 1; developer-rules.md rule 4; .claude/rules/server-actions.md: "Every id from the browser is
// checked to belong to a branch the user may use"; permission review of 6.3, Must fix 1): `data.view`
// for the list; the branch filter's branch; a department of a branch the user sees; a Manager who
// holds one of those branches. Anything else is "Not found". Category and supplier are school-wide
// catalogs. The rows stay behind spendingWhere()'s wall either way.

export async function authorizeAnalytics(
  db: Executor,
  userId: string,
  filters: AnalyticsFilters,
): Promise<Actor> {
  const actor = await authorizeList(userId, "data.view", db);
  if (filters.branch) await authorize(userId, "data.view", { branchId: filters.branch }, db);
  // `none` names no department and so no branch: its rows stay behind the wall in the SQL (plan
  // of 2.5d-c, Server actions and queries).
  if (filters.department && filters.department !== NO_DEPARTMENT) {
    const found = await db.execute<{ branch_id: string }>(
      sql`select branch_id from departments where id = ${filters.department}`,
    );
    const branchId = found.rows[0]?.branch_id;
    if (!branchId) throw new AuthorizationError("not_found");
    await authorize(userId, "data.view", { branchId }, db);
  }
  if (filters.manager) {
    const visible = branchFilter(actor, userBranches.branchId) ?? sql`true`;
    const found = await db.execute(sql`
      select 1 from users u
      where u.id = ${filters.manager} and u.role = 'MANAGER'
        and exists (select 1 from user_branches where user_branches.user_id = u.id and ${visible})`);
    if (found.rows.length === 0) throw new AuthorizationError("not_found");
  }
  return actor;
}
