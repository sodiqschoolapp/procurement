import { type SQL, and, eq, inArray, or, sql } from "drizzle-orm";

import { STILL_DUE_OPEN, STILL_DUE_STATUSES } from "@/domain/order-steps";
import { orderEvents, orders } from "@/server/db/schema";

// The SQL of two order readings that more than one reader needs, written once (CLAUDE.md rule 1;
// plan of 8.1, review Should fix 1): the order list's `stuck=1` and `due=soon` filters (2.13, 6.1,
// 6.2) and the reminders job (8.1) read them from here.

/**
 * When the order entered its current status: its newest event into that status that moved it
 * (06 rule 9; progress of 2.11, correction 2; plan of 6.2, decided item 1). An event that moves no
 * status (Move to another Manager) is not an entry; a Submit again after Sent back is.
 */
export const enteredCurrentStatusAt: SQL = sql`(select max(${orderEvents.createdAt})
  from ${orderEvents}
  where ${orderEvents.orderId} = ${orders.id}
    and ${orderEvents.toStatus} = ${orders.status}
    and ${orderEvents.fromStatus} <> ${orderEvents.toStatus})`;

/**
 * The order still waits for its needed-by date, as isOverdue() of src/domain/order-steps.ts reads
 * it: a Waiting step, Sent back, or Open while its buying is not finished (plan of 2.13, decided
 * item 8).
 */
export function stillDueWhere(): SQL {
  return or(
    inArray(orders.status, [...STILL_DUE_STATUSES]),
    and(eq(orders.status, STILL_DUE_OPEN.status), eq(orders.progress, STILL_DUE_OPEN.progress)),
  )!;
}
