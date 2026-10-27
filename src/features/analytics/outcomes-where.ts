import { type SQL, and, between, eq, sql } from "drizzle-orm";

import type { DateRange } from "@/domain/analytics";
import type { Actor } from "@/domain/permissions";
import { branchFilter } from "@/server/authorize";
import { analyticsOutcomes, analyticsUnpriced } from "@/server/db/schema";

import { departmentWhere } from "./department-where";
import type { AnalyticsFilters } from "./period-params";

// The one condition over `analytics_outcomes` of every Plan vs actual number, its drill-down list
// and its export (10-notifications-analytics-reports.md, Analytics page per role, Head; plan of
// 6.4, decided item 6), as spendingWhere() is for Spending: the branch wall inside the SQL
// (developer-rules.md rule 4), the day the order's buying ended, and the filters of point 2. The
// supplier filter keeps an order with a record not cancelled from that supplier; `otherOwners`
// keeps the orders whose owner is not a Manager (review of the plan of 6.4, correction 1). `table`
// is `analytics_unpriced` for the ended orders without a planned price that the planned sums leave
// out and count (plan of 2.5d-c, decided item 1, Look first): the same keys, the same condition.

export function outcomesWhere(
  actor: Actor,
  range: DateRange,
  filters: AnalyticsFilters,
  otherOwners = false,
  table: typeof analyticsOutcomes | typeof analyticsUnpriced = analyticsOutcomes,
): SQL | undefined {
  return and(
    branchFilter(actor, table.branchId),
    between(table.endedOn, range.first, range.last),
    filters.branch ? eq(table.branchId, filters.branch) : undefined,
    filters.category ? eq(table.categoryId, filters.category) : undefined,
    departmentWhere(table.departmentId, filters),
    filters.manager ? eq(table.ownerId, filters.manager) : undefined,
    filters.supplier
      ? sql`exists (select 1 from analytics_spending s
                    where s.order_id = ${table.orderId}
                      and s.supplier_id = ${filters.supplier})`
      : undefined,
    otherOwners
      ? sql`${table.ownerId} in (select id from users where role <> 'MANAGER')`
      : undefined,
  );
}
