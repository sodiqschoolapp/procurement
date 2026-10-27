import { type SQL, and, between, eq, sql } from "drizzle-orm";

import type { DateRange } from "@/domain/analytics";
import type { Actor } from "@/domain/permissions";
import { branchFilter } from "@/server/authorize";
import { analyticsOutcomes } from "@/server/db/schema";

import { departmentWhere } from "./department-where";
import type { AnalyticsFilters } from "./period-params";

// The one condition over `analytics_outcomes` of every Plan vs actual number, its drill-down list
// and its export (10-notifications-analytics-reports.md, Analytics page per role, Head; plan of
// 6.4, decided item 6), as spendingWhere() is for Spending: the branch wall inside the SQL
// (developer-rules.md rule 4), the day the order's buying ended, and the filters of point 2. The
// supplier filter keeps an order with a record not cancelled from that supplier; `otherOwners`
// keeps the orders whose owner is not a Manager (review of the plan of 6.4, correction 1).

export function outcomesWhere(
  actor: Actor,
  range: DateRange,
  filters: AnalyticsFilters,
  otherOwners = false,
): SQL | undefined {
  return and(
    branchFilter(actor, analyticsOutcomes.branchId),
    between(analyticsOutcomes.endedOn, range.first, range.last),
    filters.branch ? eq(analyticsOutcomes.branchId, filters.branch) : undefined,
    filters.category ? eq(analyticsOutcomes.categoryId, filters.category) : undefined,
    departmentWhere(analyticsOutcomes.departmentId, filters),
    filters.manager ? eq(analyticsOutcomes.ownerId, filters.manager) : undefined,
    filters.supplier
      ? sql`exists (select 1 from analytics_spending s
                    where s.order_id = ${analyticsOutcomes.orderId}
                      and s.supplier_id = ${filters.supplier})`
      : undefined,
    otherOwners
      ? sql`${analyticsOutcomes.ownerId} in (select id from users where role <> 'MANAGER')`
      : undefined,
  );
}
