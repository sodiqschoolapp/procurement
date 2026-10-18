import { type SQL, and, between, eq, sql } from "drizzle-orm";

import type { DateRange } from "@/domain/analytics";
import type { Actor } from "@/domain/permissions";
import { branchFilter } from "@/server/authorize";
import { analyticsSpending } from "@/server/db/schema";

import type { AnalyticsFilters } from "./period-params";

// The one condition over `analytics_spending` of every Analytics number, its drill-down list and
// its export (review of the plan of 6.3, correction 3): the branch wall inside the SQL
// (developer-rules.md rule 4), the dates and the filters of point 2. One builder, so a number and
// the rows behind it can never be read two ways. `range` null leaves the dates to the caller: the
// price rises compare the 90 days with the records before them (plan of 6.4b, decided item 4).

export function spendingWhere(
  actor: Actor,
  range: DateRange | null,
  filters: AnalyticsFilters,
): SQL {
  return (
    and(
      branchFilter(actor, analyticsSpending.branchId),
      range ? between(analyticsSpending.purchasedOn, range.first, range.last) : undefined,
      filters.branch ? eq(analyticsSpending.branchId, filters.branch) : undefined,
      filters.category ? eq(analyticsSpending.categoryId, filters.category) : undefined,
      filters.department ? eq(analyticsSpending.departmentId, filters.department) : undefined,
      filters.manager ? eq(analyticsSpending.ownerId, filters.manager) : undefined,
      filters.supplier ? eq(analyticsSpending.supplierId, filters.supplier) : undefined,
    ) ?? sql`true`
  );
}
