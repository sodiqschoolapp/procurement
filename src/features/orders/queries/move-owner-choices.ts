import { sql } from "drizzle-orm";
import * as z from "zod";

import { ORDER_ACTION_MAX } from "@/domain/order-moves";
import { authorizeList, branchFilter } from "@/server/authorize";
import { orders } from "@/server/db/schema";

// The Managers the ticked orders can be moved to (03-roles-and-permissions.md rule 7: "another
// Manager of the same branch"; plan of 4.10): the active Managers in user_branches of every branch
// of the ticked orders, by name. Under `request.move_owner`, the Head only; the branches are read
// from the orders, never from the input, with the branch wall in the SQL. The move asks again.

export type MoveOwnerChoice = { id: string; name: string };

const idsInput = z.array(z.uuid()).min(1).max(ORDER_ACTION_MAX);

export async function moveOwnerChoices(
  userId: string,
  orderIds: readonly string[],
): Promise<MoveOwnerChoice[]> {
  const actor = await authorizeList(userId, "request.move_owner");
  const ids = idsInput.parse(orderIds);
  const { db } = await import("@/server/db/client");
  const wall = branchFilter(actor, orders.branchId) ?? sql`true`;
  const found = await db.execute<{ id: string; name: string }>(sql`
    with ticked as (
      select distinct orders.branch_id from orders
      where orders.id in (${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}) and ${wall}
    )
    select u.id, u.full_name as name from users u
    where u.role = 'MANAGER' and u.is_active and exists (select 1 from ticked)
      and (select count(*) from user_branches ub
           where ub.user_id = u.id and ub.branch_id in (select branch_id from ticked))
          = (select count(*) from ticked)
    order by u.full_name, u.id`);
  return found.rows;
}
