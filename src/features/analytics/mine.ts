import type { AnalyticsFilters } from "./period-params";

// The Manager's blocks read the user's own orders, whatever Manager the address names
// (10-notifications-analytics-reports.md, Analytics page per role, Manager: "My orders", "My
// estimates", "My cash"; plan of 6.5b, decided item 7, Look first). The owner is the order's
// current owner (03 rule 7: a moved order is its new owner's), the column every *Where() builder
// filters by Manager, so a block and its drill-down with `manager=<me>` read the same orders.

/** The filters as given, without their Manager: what `authorizeAnalytics()` checks. */
export function withoutManager(filters: AnalyticsFilters): AnalyticsFilters {
  return { ...filters, manager: null };
}

/** The filters with the Manager set to the user: the blocks' own orders. */
export function mineOf(filters: AnalyticsFilters, userId: string): AnalyticsFilters {
  return { ...filters, manager: userId };
}
