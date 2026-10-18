import { type SQL, and, eq, sql } from "drizzle-orm";

import type { Actor } from "@/domain/permissions";
import { branchFilter } from "@/server/authorize";
import { analyticsCash } from "@/server/db/schema";

import type { AnalyticsFilters } from "./period-params";

// The one condition over `analytics_cash` of the Managers block's "cash held", its list and its
// export (10-notifications-analytics-reports.md, Analytics page per role, Head; plan of 6.4c,
// decided item 4, Look first). A number of now: no dates. The branch wall inside the SQL
// (developer-rules.md rule 4); the order's live status leaves out a Draft and a Closed order, as
// Money with managers does (08: "his orders that are not Closed"; review of the plan, correction
// 3), which also keeps the draft wall (.claude/rules/server-actions.md); held only: a count above
// 0, never netted with what is owed (08 Manager's cash balance). The filters of point 2: category
// the planned subtype's, Manager the order's current owner, and the supplier filter keeps an order
// with a record not cancelled from that supplier, as Plan vs actual reads it (6.4b decided item
// 11). `otherOwners` keeps the orders whose owner is not a Manager, as outcomesWhere(). `owed`
// keeps what the school owes too, a count below 0, for the Manager's My cash, whose held and owed
// are shown apart, never netted (08 Manager's cash balance; plan of 6.5b, decided item 5).

export function cashWhere(
  actor: Actor,
  filters: AnalyticsFilters,
  otherOwners = false,
  owed = false,
): SQL {
  return (
    and(
      branchFilter(actor, analyticsCash.branchId),
      owed ? undefined : sql`${analyticsCash.cashCount} > 0`,
      sql`exists (select 1 from orders live
                  where live.id = ${analyticsCash.orderId}
                    and live.status not in ('DRAFT', 'CLOSED'))`,
      filters.branch ? eq(analyticsCash.branchId, filters.branch) : undefined,
      filters.category ? eq(analyticsCash.categoryId, filters.category) : undefined,
      filters.department ? eq(analyticsCash.departmentId, filters.department) : undefined,
      filters.manager ? eq(analyticsCash.ownerId, filters.manager) : undefined,
      filters.supplier
        ? sql`exists (select 1 from analytics_spending s
                    where s.order_id = ${analyticsCash.orderId}
                      and s.supplier_id = ${filters.supplier})`
        : undefined,
      otherOwners
        ? sql`${analyticsCash.ownerId} in (select id from users where role <> 'MANAGER')`
        : undefined,
    ) ?? sql`true`
  );
}
