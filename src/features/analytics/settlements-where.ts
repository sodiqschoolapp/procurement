import { type SQL, and, between, eq, sql } from "drizzle-orm";

import type { DateRange } from "@/domain/analytics";
import type { Actor } from "@/domain/permissions";
import { branchFilter } from "@/server/authorize";
import { analyticsSettlements } from "@/server/db/schema";

import type { AnalyticsFilters } from "./period-params";

// The one condition over `analytics_settlements` of every Settlement speed number, its drill-down
// list and its export (10-notifications-analytics-reports.md, Analytics page per role, Finance;
// plan of 6.6b, decided items 7 and 8), as outcomesWhere() is for Plan vs actual: the branch wall
// inside the SQL (developer-rules.md rule 4), the Tashkent day of the close, and the filters of
// point 2. The supplier filter keeps an order with a record not cancelled from that supplier. No
// draft wall: a row exists only for an order that reached Closed, and no move leads from Closed
// back to Draft (decided item 9).

export function settlementsWhere(actor: Actor, range: DateRange, filters: AnalyticsFilters): SQL {
  return (
    and(
      branchFilter(actor, analyticsSettlements.branchId),
      between(analyticsSettlements.closedOn, range.first, range.last),
      filters.branch ? eq(analyticsSettlements.branchId, filters.branch) : undefined,
      filters.category ? eq(analyticsSettlements.categoryId, filters.category) : undefined,
      filters.department ? eq(analyticsSettlements.departmentId, filters.department) : undefined,
      filters.manager ? eq(analyticsSettlements.ownerId, filters.manager) : undefined,
      filters.supplier
        ? sql`exists (select 1 from analytics_spending s
                      where s.order_id = ${analyticsSettlements.orderId}
                        and s.supplier_id = ${filters.supplier})`
        : undefined,
    ) ?? sql`true`
  );
}
