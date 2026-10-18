import { type SQL, and, between, eq, sql } from "drizzle-orm";

import type { DateRange } from "@/domain/analytics";
import type { Actor } from "@/domain/permissions";
import { branchFilter } from "@/server/authorize";
import { analyticsStockMoves } from "@/server/db/schema";

import type { AnalyticsFilters, MoveKind } from "./period-params";

// The one condition over `analytics_stock_moves` of the Warehouse block's numbers of the period
// (use by department, value written off), their list and their export (10-notifications-
// analytics-reports.md, Analytics page per role, Head; plan of 6.4d, decided items 4 to 6, Look
// first): the branch wall inside the SQL (developer-rules.md rule 4), the document's date in the
// period, and the filters of point 2 that a movement has: branch, category (the product's), and,
// for use only, department; a write-off has no department, and Manager and supplier are not read
// (decided item 6). `use` keeps issues and returns, `writeoff` the approved write-offs.

export function movesWhere(
  actor: Actor,
  range: DateRange,
  filters: AnalyticsFilters,
  move: MoveKind,
): SQL {
  return (
    and(
      branchFilter(actor, analyticsStockMoves.branchId),
      between(analyticsStockMoves.movedOn, range.first, range.last),
      move === "use"
        ? sql`${analyticsStockMoves.type} in ('ISSUE', 'RETURN')`
        : sql`${analyticsStockMoves.type} = 'WRITE_OFF'`,
      filters.branch ? eq(analyticsStockMoves.branchId, filters.branch) : undefined,
      filters.category ? eq(analyticsStockMoves.categoryId, filters.category) : undefined,
      move === "use" && filters.department
        ? eq(analyticsStockMoves.departmentId, filters.department)
        : undefined,
    ) ?? sql`true`
  );
}

/** A movement's part of use: an issue adds its value, a return takes it away (decided item 4). */
export const SIGNED_VALUE = sql`case when ${analyticsStockMoves.type} = 'RETURN'
  then -${analyticsStockMoves.value} else ${analyticsStockMoves.value} end`;
