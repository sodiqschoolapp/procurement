import { sql } from "drizzle-orm";

import type { Executor } from "@/server/authorize";

// The orders whose owner now is not the owner they had at a moment (08 Money ledger: "When one of
// its orders was moved to another Manager since, the Head first moves it back"; edge case "A typo
// in a purchase record"; D55 (2); plans of 4.10, decided item 3, and 4.10b, decided item 3, Look
// first): a money action or a purchase record written then is cancelled only once the order is
// back with that owner, as its cash would otherwise land on the count of an owner who never held
// it (03 rule 7: the owner moves only at a count of 0). The `MOVE_OWNER` events of the orders'
// history are the one source: the owner then is the `from` of the earliest move at or after the
// moment, else the owner now. "At or after": a move sharing the write's exact moment is taken as
// after it (4.10's choice kept), the side that keeps the count right. Read by the cancels in their
// transaction, after the orders' lock, so a move committed before it is seen and none can come
// between. Each refused order comes with the owner then, id and full name, for the refusal to name.

export type OwnerThen = { id: string; name: string };

export async function movedSince(
  executor: Executor,
  orders: readonly { id: string; ownerId: string }[],
  since: Date,
): Promise<Map<string, OwnerThen>> {
  if (orders.length === 0) return new Map();
  const found = await executor.execute<{ order_id: string; owner_id: string; name: string }>(sql`
    select distinct on (e.order_id) e.order_id, u.id as owner_id, u.full_name as name
    from order_events e
    join users u on u.id = (e.payload -> 'owner' ->> 'from')::uuid
    where e.type = 'MOVE_OWNER' and e.created_at >= ${since.toISOString()}::timestamptz
      and e.order_id in (${sql.join(
        orders.map((order) => sql`${order.id}::uuid`),
        sql`, `,
      )})
    order by e.order_id, e.created_at, e.id`);
  const ownerNow = new Map(orders.map((order) => [order.id, order.ownerId]));
  const moved = new Map<string, OwnerThen>();
  for (const row of found.rows) {
    if (ownerNow.get(row.order_id) !== row.owner_id) {
      moved.set(row.order_id, { id: row.owner_id, name: row.name });
    }
  }
  return moved;
}
