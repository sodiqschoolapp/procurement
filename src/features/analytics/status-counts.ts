import { type SQL, sql } from "drizzle-orm";

import { type Change, changeAgainst } from "@/domain/analytics";
import { LIST_STATUSES, type ListStatus } from "@/domain/order-list";
import type { Executor } from "@/server/authorize";

// The count of orders by status now in two sets of `analytics_orders`, each with its change
// (10-notifications-analytics-reports.md, Analytics page per role: the Principal's Orders "By
// status", build-plan 6.5a; the Manager's My orders "By status", build-plan 6.5b). One reading for
// both blocks (plan of 6.5b, decided item 9): the caller has authorized the user and passes two
// ordersWhere() conditions, the walls in them. Not a query of its own: no export of a query file.

export type StatusCount = { status: ListStatus; count: number; change: Change };

export type StatusCounts = {
  /** Every status but Draft, in the order of LIST_STATUSES, each with a count in either set. */
  statuses: StatusCount[];
  total: { count: number; change: Change };
};

export async function statusCountsIn(db: Executor, now: SQL, then: SQL): Promise<StatusCounts> {
  const byStatus = await db.execute<{ status: ListStatus; now: string; before: string }>(sql`
    select status, count(*) filter (where ${now})::text as now,
           count(*) filter (where ${then})::text as before
    from analytics_orders
    where (${now}) or (${then})
    group by status`);
  const found = new Map(byStatus.rows.map((row) => [row.status, row]));
  let nowTotal = 0n;
  let beforeTotal = 0n;
  const statuses = LIST_STATUSES.flatMap((status) => {
    const row = found.get(status);
    if (!row) return [];
    const count = BigInt(row.now);
    nowTotal += count;
    beforeTotal += BigInt(row.before);
    return [{ status, count: Number(count), change: changeAgainst(count, BigInt(row.before)) }];
  });
  return {
    statuses,
    total: { count: Number(nowTotal), change: changeAgainst(nowTotal, beforeTotal) },
  };
}
