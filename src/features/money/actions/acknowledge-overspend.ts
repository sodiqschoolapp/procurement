import { sql } from "drizzle-orm";
import * as z from "zod";

import { overspendNeedsAck, settlementAllows } from "@/domain/money-ledger";
import { isMoveReason, moveReason } from "@/domain/order-moves";
import { ActionError } from "@/server/action";
import type { OrderFailure } from "@/server/action-result";
import { now } from "@/server/clock";
import { orderSettlements } from "@/server/db/schema";
import {
  type OrdersInput,
  OrdersRefusal,
  defineOrdersAction,
  ordersInput,
} from "@/server/order-action";
import { reasonFields } from "@/server/order-moves";
import { readSettings } from "@/server/settings";

import { financeOf, noticePerBranch } from "@/features/orders/actions/notices";

import { settlementFactsOf } from "../settlement-facts";

// The Head's "Acknowledge overspend" of ticked orders (08-money-and-settlement.md, Overspend guard:
// "the Head is notified and must click 'Acknowledge overspend' with a comment before Finance can
// close it … The Head can acknowledge several ticked orders with one comment"; 03 Permission
// matrix: "Acknowledge a big overspend", Head only; plan of 4.7). In the wrapper of
// src/server/order-action.ts: lock, repeat, authorize `request.acknowledge_overspend` per order,
// version, then:
//
//   check    the comment, 5 to 500 once trimmed (the action's reason; decided item 4); every order
//            Waiting for settlement (`settlementAllows()`, as Confirm; decided item 2, Look first)
//   write    the plan, records and confirmations read under the orders' lock with the guard
//            settings of the moment: an order not above the guard now, or already acknowledged, is
//            refused `not_ready` and nothing is written (`overspendNeedsAck()`; decided items 3
//            and 5, Look first); otherwise each order's row of order_settlements gets by, at (the
//            clock) and the comment. The row is updated, never deleted.
//   notify   "Overspend acknowledged": the active Finance users of each branch, one notice per
//            branch (10 Notifications; decided item 6), never the actor.
//
// It moves no status. The wrapper raises the versions and writes one history event per order
// with the comment.

export type AcknowledgeOverspendInput = OrdersInput & { reason: string };

const input = ordersInput({
  reason: z.string().optional(),
}) as unknown as z.ZodType<AcknowledgeOverspendInput>;

export const acknowledgeOverspend = defineOrdersAction<AcknowledgeOverspendInput>({
  name: "acknowledgeOverspend",
  type: "ACKNOWLEDGE_OVERSPEND",
  input,
  permission: () => "request.acknowledge_overspend",
  repeatPermission: () => "request.acknowledge_overspend",
  reason: (value) => (isMoveReason(value.reason) ? moveReason(value.reason) : null),
  check(context) {
    if (!isMoveReason(context.input.reason))
      throw new ActionError("invalid_input", reasonFields(context.input.reason));
    return context.orders
      .filter((order) => !settlementAllows(order.status))
      .map((order) => ({ orderId: order.id, code: "wrong_status" as const }));
  },
  async write(context) {
    const ids = context.orders.map((order) => order.id);
    const facts = await settlementFactsOf(context.tx, ids);
    const guard = await readSettings(context.tx);
    const refused: OrderFailure[] = ids
      .filter((id) => {
        const found = facts.get(id);
        return found === undefined || !overspendNeedsAck(found, guard);
      })
      .map((orderId) => ({ orderId, code: "not_ready" as const }));
    if (refused.length > 0) throw new OrdersRefusal("not_ready", refused);

    const at = now();
    const comment = moveReason(context.input.reason);
    // One statement for every ticked order: the row is updated, never deleted.
    await context.tx
      .insert(orderSettlements)
      .values(
        ids.map((orderId) => ({
          orderId,
          overspendAckBy: context.userId,
          overspendAckAt: at,
          overspendAckComment: comment,
          createdAt: at,
        })),
      )
      .onConflictDoUpdate({
        target: orderSettlements.orderId,
        set: {
          overspendAckBy: sql`excluded.overspend_ack_by`,
          overspendAckAt: sql`excluded.overspend_ack_at`,
          overspendAckComment: sql`excluded.overspend_ack_comment`,
        },
      });
  },
  async notify(context, result) {
    await noticePerBranch(context, result.actionId, "OVERSPEND_ACKNOWLEDGED", (_, branchId) =>
      financeOf(context.tx, branchId),
    );
  },
});
