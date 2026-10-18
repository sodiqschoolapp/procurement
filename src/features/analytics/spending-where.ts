import { type SQL, and, between, eq } from "drizzle-orm";

import type { DateRange } from "@/domain/analytics";
import type { Actor } from "@/domain/permissions";
import { branchFilter } from "@/server/authorize";
import { analyticsSpending } from "@/server/db/schema";

import type { AnalyticsFilters } from "./period-params";

// The one condition over `analytics_spending` of every Analytics number, its drill-down list and
// its export (review of the plan of 6.3, correction 3): the branch wall inside the SQL
// (developer-rules.md rule 4), the dates and the filters of point 2. One builder, so a number and
// the rows behind it can never be read two ways.

export function spendingWhere(
  actor: Actor,
  range: DateRange,
  filters: AnalyticsFilters,
): SQL | undefined {
  return and(
    branchFilter(actor, analyticsSpending.branchId),
    between(analyticsSpending.purchasedOn, range.first, range.last),
    filters.branch ? eq(analyticsSpending.branchId, filters.branch) : undefined,
    filters.category ? eq(analyticsSpending.categoryId, filters.category) : undefined,
    filters.department ? eq(analyticsSpending.departmentId, filters.department) : undefined,
    filters.manager ? eq(analyticsSpending.ownerId, filters.manager) : undefined,
    filters.supplier ? eq(analyticsSpending.supplierId, filters.supplier) : undefined,
  );
}
