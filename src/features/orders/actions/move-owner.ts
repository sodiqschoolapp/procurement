import { inArray, sql } from "drizzle-orm";
import * as z from "zod";

import { orderCashCount } from "@/domain/money-ledger";
import { ownerMoveAllows } from "@/domain/order-moves";
import { ActionError } from "@/server/action";
import type { OrderFailure } from "@/server/action-result";
import { orders } from "@/server/db/schema";
import {
  type OrdersContext,
  type OrdersInput,
  defineOrdersAction,
  ordersInput,
} from "@/server/order-action";

import { moneyRowsOf } from "@/features/money/money-rows";
import { cashRecordsOf } from "@/features/purchasing/order-records";

// The Head moves ticked orders to another Manager of the same branch, only orders whose cash
// count is 0, all or nothing (03-roles-and-permissions.md rules 7 and 8; Permission matrix: "Move
// orders to another Manager", the Head only; edge cases "A Manager with cash in hand leaves the
// branch" and "A user is deactivated with work waiting"; plan of 4.10). In the wrapper of
// src/server/order-action.ts: lock, repeat, authorize `request.move_owner` per order, version,
// then:
//
//   check    every order in a status that can be moved (`ownerMoveAllows()`; decided item 1, Look
//            first), else `wrong_status`
//   inspect  the chosen user FOR SHARE: an active Manager in user_branches of every order's branch,
//            else the whole action `invalid_input` on `managerId` (decided item 4); each order's
//            `orderCashCount()` read under the orders' lock, which every money action and purchase
//            takes too, not 0 → `not_ready` (decided item 2, Look first); an order the chosen
//            Manager owns already → `not_ready` (03 rule 7: "another Manager")
//   write    `owner_id`; the event's payload names the old and the new owner
//
// It moves no status and tells nobody (decided item 5). Past money actions keep their Manager and
// past purchases their creator (decided item 8).

export type MoveOwnerInput = OrdersInput & { managerId: string };

const input = ordersInput({ managerId: z.uuid() }) as unknown as z.ZodType<MoveOwnerInput>;

/** Whether the chosen user is an active Manager of every branch of the orders, read FOR SHARE. */
async function isBranchManager(context: OrdersContext<MoveOwnerInput>): Promise<boolean> {
  const found = await context.tx.execute<{ id: string }>(sql`
    select id from users
    where id = ${context.input.managerId} and role = 'MANAGER' and is_active
    for share`);
  if (found.rows.length === 0) return false;
  const branchIds = [...new Set(context.orders.map((order) => order.branchId))];
  const member = await context.tx.execute<{ count: number }>(sql`
    select count(*)::int as count from user_branches
    where user_id = ${context.input.managerId} and branch_id in (${sql.join(
      branchIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})`);
  return member.rows[0]!.count === branchIds.length;
}

export const moveOrdersToManager = defineOrdersAction<MoveOwnerInput>({
  name: "moveOrdersToManager",
  type: "MOVE_OWNER",
  input,
  permission: () => "request.move_owner",
  repeatPermission: () => "request.move_owner",
  reason: () => null,
  check(context) {
    return context.orders
      .filter((order) => !ownerMoveAllows(order.status))
      .map((order) => ({ orderId: order.id, code: "wrong_status" as const }));
  },
  async inspect(context) {
    if (!(await isBranchManager(context))) {
      throw new ActionError("invalid_input", { managerId: "errors.field.notBranchManager" });
    }
    const ids = context.orders.map((order) => order.id);
    const rows = await moneyRowsOf(context.tx, ids);
    const records = await cashRecordsOf(context.tx, ids);
    const refused: OrderFailure[] = [];
    for (const order of context.orders) {
      if (order.ownerId === context.input.managerId) {
        refused.push({
          orderId: order.id,
          code: "not_ready",
          fields: { managerId: "errors.field.alreadyOwner" },
        });
      } else if (orderCashCount(rows.get(order.id) ?? [], records.get(order.id) ?? []) !== 0n) {
        refused.push({
          orderId: order.id,
          code: "not_ready",
          fields: { cashCount: "errors.field.cashNotZero" },
        });
      }
    }
    return refused;
  },
  async write(context) {
    const managerId = context.input.managerId;
    await context.tx
      .update(orders)
      .set({ ownerId: managerId })
      .where(
        inArray(
          orders.id,
          context.orders.map((order) => order.id),
        ),
      );
    return new Map(
      context.orders.map(
        (order) =>
          [order.id, { payload: { owner: { from: order.ownerId, to: managerId } } }] as const,
      ),
    );
  },
});
