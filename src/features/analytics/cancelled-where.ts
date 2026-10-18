import { type SQL, and, between, eq, sql } from "drizzle-orm";

import type { DateRange } from "@/domain/analytics";
import type { Actor } from "@/domain/permissions";
import { branchFilter } from "@/server/authorize";
import { analyticsCancelled } from "@/server/db/schema";

import type { AnalyticsFilters } from "./period-params";

// The one condition over `analytics_cancelled` of the Managers block's "cancelled purchase
// records", its list and its export (10-notifications-analytics-reports.md, Analytics page per
// role, Head; plan of 6.4c, decided item 5, Look first), as spendingWhere() is for Spending: the
// branch wall inside the SQL (developer-rules.md rule 4), the Tashkent day of the cancel, and the
// filters of point 2 (category the bought subtype's, supplier the trip's, Manager the order's
// current owner). `otherOwners` keeps the orders whose owner is not a Manager, as outcomesWhere().
// A record belongs to an order that was Open, which never goes back to Draft (06 Allowed moves),
// so no draft wall is needed here.

export function cancelledWhere(
  actor: Actor,
  range: DateRange,
  filters: AnalyticsFilters,
  otherOwners = false,
): SQL {
  return (
    and(
      branchFilter(actor, analyticsCancelled.branchId),
      between(analyticsCancelled.cancelledOn, range.first, range.last),
      filters.branch ? eq(analyticsCancelled.branchId, filters.branch) : undefined,
      filters.category ? eq(analyticsCancelled.categoryId, filters.category) : undefined,
      filters.department ? eq(analyticsCancelled.departmentId, filters.department) : undefined,
      filters.manager ? eq(analyticsCancelled.ownerId, filters.manager) : undefined,
      filters.supplier ? eq(analyticsCancelled.supplierId, filters.supplier) : undefined,
      otherOwners
        ? sql`${analyticsCancelled.ownerId} in (select id from users where role <> 'MANAGER')`
        : undefined,
    ) ?? sql`true`
  );
}
