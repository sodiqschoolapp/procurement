import { inArray, sql } from "drizzle-orm";
import * as z from "zod";

import { ORDER_ACTION_MAX } from "@/domain/order-moves";
import { AuthorizationError, authorize } from "@/server/authorize";
import { orders } from "@/server/db/schema";

// The Managers the ticked orders can be moved to (03-roles-and-permissions.md rule 7: "another
// Manager of the same branch"; plan of 4.10): the active Managers in user_branches of every branch
// of the ticked orders, by name. `request.move_owner` (the Head only) is asked on each order's
// branch, read from the order, never from the input: another branch is "Not found" (03 rule 1),
// and an id that is no order is too. The move asks everything again.

export type MoveOwnerChoice = { id: string; name: string };

const idsInput = z.array(z.uuid()).min(1).max(ORDER_ACTION_MAX);

export async function moveOwnerChoices(
  userId: string,
  orderIds: readonly string[],
): Promise<MoveOwnerChoice[]> {
  const ids = [...new Set(idsInput.parse(orderIds))];
  const { db } = await import("@/server/db/client");
  const found = await db
    .select({ id: orders.id, branchId: orders.branchId })
    .from(orders)
    .where(inArray(orders.id, ids));
  if (found.length !== ids.length) throw new AuthorizationError("not_found");
  const branchIds = [...new Set(found.map((row) => row.branchId))].sort();
  for (const branchId of branchIds) await authorize(userId, "request.move_owner", { branchId });

  const rows = await db.execute<{ id: string; name: string }>(sql`
    select u.id, u.full_name as name from users u
    where u.role = 'MANAGER' and u.is_active
      and (select count(*)::int from user_branches ub
           where ub.user_id = u.id and ub.branch_id in (${sql.join(
             branchIds.map((id) => sql`${id}::uuid`),
             sql`, `,
           )})) = ${branchIds.length}
    order by u.full_name, u.id`);
  return rows.rows;
}
