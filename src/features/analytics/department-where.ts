import { type SQL, eq, isNull } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";

import { type AnalyticsFilters, NO_DEPARTMENT } from "./period-params";

// The one reading of the department filter of point 2 (10-notifications-analytics-reports.md,
// Analytics page per role) in every `*-where.ts` condition: a department's id keeps its rows;
// `none` keeps the rows of orders without a department, the "No department" line (05 Fields the
// Head sets 3; D68; plan of 2.5d-c, decided items 2 and 10); no filter keeps every row.

export function departmentWhere(column: AnyColumn, filters: AnalyticsFilters): SQL | undefined {
  if (filters.department === null) return undefined;
  if (filters.department === NO_DEPARTMENT) return isNull(column);
  return eq(column, filters.department);
}
