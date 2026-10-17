import { sql } from "drizzle-orm";

import type { Executor } from "@/server/authorize";

// The orders moved to another Manager at or after a moment (plan of 4.10, decided item 3, Look
// first): a money action, a cash purchase record or a trip written before the move is never
// cancelled, as its cash would land on the count of an owner who never held it (03 rule 7: the
// owner moves only at a count of 0; the premise of trigger money_rows_one_manager of 0028). The
// `MOVE_OWNER` events of the orders' history are the one source; a move back leaves the event.
// Read by the cancels in their transaction, after the orders' lock, so a move committed before it
// is seen and none can come between. "At or after": two writes of one moment are taken as the move
// coming last, the side that keeps the count right.

export async function movedSince(
  executor: Executor,
  orderIds: readonly string[],
  since: Date,
): Promise<Set<string>> {
  if (orderIds.length === 0) return new Set();
  const found = await executor.execute<{ order_id: string }>(sql`
    select distinct order_id from order_events
    where type = 'MOVE_OWNER' and created_at >= ${since.toISOString()}::timestamptz
      and order_id in (${sql.join(
        orderIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`);
  return new Set(found.rows.map((row) => row.order_id));
}
