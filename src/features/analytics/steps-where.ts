import { type SQL, and, between, eq, isNotNull, isNull, sql } from "drizzle-orm";

import type { DateRange } from "@/domain/analytics";
import type { Actor } from "@/domain/permissions";
import { branchFilter } from "@/server/authorize";
import { analyticsSteps } from "@/server/db/schema";

import { departmentWhere } from "./department-where";
import type { AnalyticsFilters } from "./period-params";

// The one condition over `analytics_steps` of every Approval speed number, its drill-down list and
// its export (10-notifications-analytics-reports.md, Analytics page per role, Head; plan of 6.4b,
// Server actions and queries), as spendingWhere() is for Spending:
// - the branch wall inside the SQL (developer-rules.md rule 4);
// - the draft wall inside the SQL, read from the order's live status and owner: a Draft is seen by
//   its owner and the Head only (06 Statuses), and a taken-back Draft keeps its number and its
//   decided stays (review of the plan, Must fix 4; .claude/rules/server-actions.md, permission
//   review of 2.7);
// - `range`: the stays decided on those Tashkent dates; `"open"`: the stays waiting now
//   (decided item 8);
// - the filters of point 2: the supplier filter keeps an order with a record not cancelled from
//   that supplier, as Plan vs actual reads it (decided item 11).

export function stepsWhere(
  actor: Actor,
  range: DateRange | "open",
  filters: AnalyticsFilters,
): SQL {
  return (
    and(
      branchFilter(actor, analyticsSteps.branchId),
      actor.role === "HEAD"
        ? undefined
        : sql`not exists (select 1 from orders dw
                        where dw.id = ${analyticsSteps.orderId} and dw.status = 'DRAFT'
                          and dw.owner_id <> ${actor.userId})`,
      range === "open"
        ? isNull(analyticsSteps.leftAt)
        : and(
            isNotNull(analyticsSteps.leftAt),
            between(analyticsSteps.leftOn, range.first, range.last),
          ),
      filters.branch ? eq(analyticsSteps.branchId, filters.branch) : undefined,
      filters.category ? eq(analyticsSteps.categoryId, filters.category) : undefined,
      departmentWhere(analyticsSteps.departmentId, filters),
      filters.manager ? eq(analyticsSteps.ownerId, filters.manager) : undefined,
      filters.supplier
        ? sql`exists (select 1 from analytics_spending s
                    where s.order_id = ${analyticsSteps.orderId}
                      and s.supplier_id = ${filters.supplier})`
        : undefined,
    ) ?? sql`true`
  );
}
