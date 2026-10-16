import { sql } from "drizzle-orm";
import * as z from "zod";

import type { NewestMove } from "@/domain/already-decided";
import type { OrderAction } from "@/domain/order-moves";
import type { RequestStatus } from "@/domain/request-status";
import { authorizeList, branchFilter } from "@/server/authorize";
import { orders } from "@/server/db/schema";

// The newest event of each refused order, for "Already approved by … at …" (06-approval-
// workflow.md rule 7; plan of 2.10, decided item 3, Look first; progress 2.4, "For 2.10"). Under
// `data.view` with the branch wall and the draft wall inside the SQL (developer-rules.md rule 4;
// .claude/rules/server-actions.md): an order of another branch, another user's Draft and an
// unknown id give nothing, so the answer names nobody behind a wall (03 rule 1). The order's
// version and its newest event are read in one statement, so they are of one moment.

const idsInput = z.array(z.uuid()).max(200);

/** The order's version now and its newest event, by id, for the orders the user may see. */
export async function newestMoves(
  userId: string,
  orderIds: readonly string[],
): Promise<Map<string, NewestMove>> {
  const actor = await authorizeList(userId, "data.view");
  const ids = idsInput.parse(orderIds);
  if (ids.length === 0) return new Map();
  const { db } = await import("@/server/db/client");
  const draftWall =
    actor.role === "HEAD"
      ? sql`true`
      : sql`(orders.status <> 'DRAFT' or orders.owner_id = ${actor.userId})`;
  const rows = await db.execute<{
    id: string;
    version: number;
    type: OrderAction;
    from_status: RequestStatus;
    actor_id: string;
    actor_name: string;
    at: Date | string;
  }>(sql`
    select orders.id, orders.version, e.type, e.from_status, e.actor_id, u.full_name as actor_name,
           e.created_at as at
    from orders
    join lateral (
      select e.type, e.from_status, e.actor_id, e.created_at
      from order_events e
      where e.order_id = orders.id
      order by e.created_at desc, e.id desc
      limit 1
    ) e on true
    join users u on u.id = e.actor_id
    where orders.id in (${sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})
      and ${branchFilter(actor, orders.branchId) ?? sql`true`}
      and ${draftWall}`);
  return new Map(
    rows.rows.map((row) => [
      row.id,
      {
        version: row.version,
        type: row.type,
        from: row.from_status,
        actorId: row.actor_id,
        actorName: row.actor_name,
        at: new Date(row.at),
      },
    ]),
  );
}
