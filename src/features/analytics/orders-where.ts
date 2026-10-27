import { type SQL, and, between, eq, inArray, sql } from "drizzle-orm";

import type { DateRange } from "@/domain/analytics";
import type { BusinessDate } from "@/domain/business-date";
import { STILL_DUE_OPEN, STILL_DUE_STATUSES, dueSoonUntil } from "@/domain/order-steps";
import type { Actor } from "@/domain/permissions";
import { branchFilter } from "@/server/authorize";
import { analyticsOrders } from "@/server/db/schema";

import { departmentWhere } from "./department-where";
import type { AnalyticsFilters, DueKind } from "./period-params";

// The one condition over `analytics_orders` of the Principal's Orders block, its drill-down list
// and its export (10-notifications-analytics-reports.md, Analytics page per role, Principal,
// Orders; plan of 6.5a, decided items 2, 4 and 6, Look first), as stepsWhere() is for Approval
// speed:
// - the branch wall inside the SQL (developer-rules.md rule 4);
// - the draft wall on the order's live status: the table holds no Draft, and an order taken back
//   since the last refresh is hidden at once from all but its owner and the Head (06 Statuses;
//   review of the plan of 6.4b, Must fix 4);
// - `range`: the orders first submitted on those Tashkent dates; a `due` kind: the orders of now
//   that still wait, coming up (`isComingUp()`) or overdue (`isOverdue()`) on `today`, mirroring
//   src/domain/order-steps.ts through its lists and `dueSoonUntil()` (developer-rules.md rule 1);
// - `opened`: the orders that first entered Open on those Tashkent dates, the Manager's time to
//   full approval (plan of 6.5b, decided item 1, Look first);
// - the filters of point 2; the supplier filter keeps an order with a record not cancelled from
//   that supplier, as stepsWhere() reads it.

export function ordersWhere(
  actor: Actor,
  scope: DateRange | { due: DueKind; today: BusinessDate } | { opened: DateRange },
  filters: AnalyticsFilters,
): SQL {
  return (
    and(
      branchFilter(actor, analyticsOrders.branchId),
      actor.role === "HEAD"
        ? undefined
        : sql`not exists (select 1 from orders dw
                        where dw.id = ${analyticsOrders.orderId} and dw.status = 'DRAFT'
                          and dw.owner_id <> ${actor.userId})`,
      "due" in scope
        ? and(
            stillDue(),
            scope.due === "overdue"
              ? sql`${analyticsOrders.neededBy} < ${scope.today}`
              : between(analyticsOrders.neededBy, scope.today, dueSoonUntil(scope.today)),
          )
        : "opened" in scope
          ? between(analyticsOrders.openedOn, scope.opened.first, scope.opened.last)
          : between(analyticsOrders.submittedOn, scope.first, scope.last),
      filters.branch ? eq(analyticsOrders.branchId, filters.branch) : undefined,
      filters.category ? eq(analyticsOrders.categoryId, filters.category) : undefined,
      departmentWhere(analyticsOrders.departmentId, filters),
      filters.manager ? eq(analyticsOrders.ownerId, filters.manager) : undefined,
      filters.supplier
        ? sql`exists (select 1 from analytics_spending s
                    where s.order_id = ${analyticsOrders.orderId}
                      and s.supplier_id = ${filters.supplier})`
        : undefined,
    ) ?? sql`true`
  );
}

/** A Waiting step, Sent back, or Open while buying: the statuses of isOverdue(). */
function stillDue(): SQL {
  return sql`(${inArray(analyticsOrders.status, [...STILL_DUE_STATUSES])}
              or (${analyticsOrders.status} = ${STILL_DUE_OPEN.status}
                  and ${analyticsOrders.progress} = ${STILL_DUE_OPEN.progress}))`;
}
