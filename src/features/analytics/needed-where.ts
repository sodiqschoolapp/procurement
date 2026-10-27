import { type SQL, and, eq, sql } from "drizzle-orm";

import { APPROVAL_STATUSES } from "@/domain/money-ledger";
import type { Actor } from "@/domain/permissions";
import { branchFilter } from "@/server/authorize";
import { analyticsOrders } from "@/server/db/schema";

import { departmentWhere } from "./department-where";
import type { AnalyticsFilters, ApprovalStatus, NeededStage } from "./period-params";

// The one condition over `analytics_orders` of Finance's Cash needed soon, its lists and its
// exports (10-notifications-analytics-reports.md, Analytics page per role, Finance, Cash needed
// soon; plan of 6.6a, decided items 4, 5 and 8, Look first): an order whose `cash_needed` is above
// 0, behind the branch wall inside the SQL (developer-rules.md rule 4). The stored status picks
// the stage (and the step of one in approval); the live status keeps the order in it, so a taken-
// back Draft leaves at once (the draft wall, .claude/rules/server-actions.md), and an order the
// Head approves on stays in approval until the next refresh moves its step (review of the plan,
// Should fix 6 and correction 1): the steps always add up to the in-approval total. The filters of
// point 2 as cashWhere() reads them.

const APPROVAL_LIST = sql.raw(APPROVAL_STATUSES.map((status) => `'${status}'`).join(", "));

export function neededWhere(
  actor: Actor,
  filters: AnalyticsFilters,
  stage: NeededStage,
  step: ApprovalStatus | null = null,
): SQL {
  const approval = sql`${analyticsOrders.status} in (${APPROVAL_LIST})
    and exists (select 1 from orders live
                where live.id = ${analyticsOrders.orderId} and live.status in (${APPROVAL_LIST}))`;
  const open = sql`${analyticsOrders.status} = 'PURCHASING'
    and exists (select 1 from orders live
                where live.id = ${analyticsOrders.orderId} and live.status = 'PURCHASING'
                  and live.progress = 'OPEN')`;
  return (
    and(
      branchFilter(actor, analyticsOrders.branchId),
      sql`${analyticsOrders.cashNeeded} > 0`,
      stage === "approval" ? approval : stage === "open" ? open : sql`((${approval}) or (${open}))`,
      step ? eq(analyticsOrders.status, step) : undefined,
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
