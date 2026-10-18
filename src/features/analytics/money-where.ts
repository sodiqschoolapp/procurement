import { type SQL, and, between, eq, sql } from "drizzle-orm";

import type { DateRange } from "@/domain/analytics";
import type { MoneyRowKind } from "@/domain/money-ledger";
import type { Actor } from "@/domain/permissions";
import { branchFilter } from "@/server/authorize";
import { analyticsMoney } from "@/server/db/schema";

import type { AnalyticsFilters } from "./period-params";

// The one condition over `analytics_money` of Finance's Cash amounts, their list and their export
// (10-notifications-analytics-reports.md, Analytics page per role, Finance, Cash; plan of 6.6a,
// decided items 2 and 8, Look first): the branch wall inside the SQL (developer-rules.md rule 4),
// the action's date in the range, and the filters of point 2. Category the planned subtype's,
// department the order's, Manager the action's (08 Money ledger 1: one Manager per action); the
// supplier filter keeps an order with a record not cancelled from that supplier, as cashWhere()
// (6.4b decided item 11). A money row exists only on an order Finance approved, never on a Draft.

export function moneyWhere(
  actor: Actor,
  range: DateRange | null,
  filters: AnalyticsFilters,
  kind: MoneyRowKind | null = null,
): SQL {
  return (
    and(
      branchFilter(actor, analyticsMoney.branchId),
      range ? between(analyticsMoney.occurredOn, range.first, range.last) : undefined,
      kind ? eq(analyticsMoney.kind, kind) : undefined,
      filters.branch ? eq(analyticsMoney.branchId, filters.branch) : undefined,
      filters.category ? eq(analyticsMoney.categoryId, filters.category) : undefined,
      filters.department ? eq(analyticsMoney.departmentId, filters.department) : undefined,
      filters.manager ? eq(analyticsMoney.managerId, filters.manager) : undefined,
      filters.supplier
        ? sql`exists (select 1 from analytics_spending s
                    where s.order_id = ${analyticsMoney.orderId}
                      and s.supplier_id = ${filters.supplier})`
        : undefined,
    ) ?? sql`true`
  );
}
