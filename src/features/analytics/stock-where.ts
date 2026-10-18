import { type SQL, and, eq, sql } from "drizzle-orm";

import type { BusinessDate } from "@/domain/business-date";
import type { Actor } from "@/domain/permissions";
import { branchFilter } from "@/server/authorize";
import { analyticsStock } from "@/server/db/schema";

import type { AnalyticsFilters, StockView } from "./period-params";

// The one condition over `analytics_stock` of the Warehouse block's numbers of now (stock value,
// low-stock items, items with no movement for 90 days), their list and their export
// (10-notifications-analytics-reports.md, Analytics page per role, Head; plan of 6.4d, decided
// items 1, 3, 6 and 7, Look first): the branch wall inside the SQL (developer-rules.md rule 4) and
// the branch and category filters of point 2. A stock line has no department, Manager or supplier,
// so those filters are not read (decided item 6). `view` keeps the lines of one number: a value
// above 0, Low (`isLow()` stored by the job), or holding stock with no movement since `stillSince`.

export function stockWhere(
  actor: Actor,
  filters: AnalyticsFilters,
  view: StockView | null = null,
  stillSince: BusinessDate | null = null,
): SQL {
  return (
    and(
      branchFilter(actor, analyticsStock.branchId),
      filters.branch ? eq(analyticsStock.branchId, filters.branch) : undefined,
      filters.category ? eq(analyticsStock.categoryId, filters.category) : undefined,
      view === "value" ? sql`${analyticsStock.value} > 0` : undefined,
      view === "low" ? eq(analyticsStock.low, true) : undefined,
      view === "still" ? stillOf(stillSince) : undefined,
    ) ?? sql`true`
  );
}

/** Holding stock, its newest movement before the 90 days that end today (decided item 7). */
export function stillOf(stillSince: BusinessDate | null): SQL {
  if (stillSince === null) throw new RangeError("The still lines need the first of the 90 days.");
  return sql`(${analyticsStock.qty} > 0 and ${analyticsStock.lastMovedOn} < ${stillSince})`;
}
