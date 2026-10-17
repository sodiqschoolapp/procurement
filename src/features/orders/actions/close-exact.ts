import { inArray } from "drizzle-orm";
import type * as z from "zod";

import { now } from "@/server/clock";
import { orders } from "@/server/db/schema";
import { ordersInput } from "@/server/order-action";
import { type MoveActionInput, orderMoveAction } from "@/server/order-moves";

import { exactMatchOf } from "../exact-match";
import { financeOf, noticePerBranch, ownersAndHeads } from "./notices";

// Close of ticked finished orders that match exactly (08-money-and-settlement.md, Closing 1:
// "The Manager ticks finished orders that match exactly and sees 'Close' … One click closes them.
// Finance and the Head are notified. If the Head has switched off this Manager's right to close
// alone, these orders go to settlement instead"; 06 Allowed moves, "Open | Close (exact match) |
// Owner or Head | Closed"; rule 8; plan of 4.4). Exact match is read under the lock by the
// wrapper's `facts` step, so the state machine decides with it (decided item 3, Look first); an
// order that does not match, or whose owner may not close alone, is `not_ready` and nothing
// closes. Told: the owners, every active Head and the branch's active Finance users (10
// Notifications, "Closed, reopened"), never the actor.

const input = ordersInput({}) as z.ZodType<MoveActionInput>;

export const closeExactOrders = orderMoveAction<MoveActionInput>({
  name: "closeExactOrders",
  action: "CLOSE_EXACT",
  input,
  async facts(context) {
    const exact = await exactMatchOf(
      context.tx,
      context.orders.map((order) => order.id),
    );
    return context.orders.map((order) => ({ ...order, exactMatch: exact.get(order.id) === true }));
  },
  async afterMove(context, moves) {
    await context.tx
      .update(orders)
      .set({ closedAt: now() })
      .where(
        inArray(
          orders.id,
          moves.map((move) => move.orderId),
        ),
      );
  },
  async notify(context, result) {
    await noticePerBranch(context, result.actionId, "REQUEST_CLOSED", async (owners, branchId) => [
      ...new Set([
        ...(await ownersAndHeads(context.tx, owners)),
        ...(await financeOf(context.tx, branchId)),
      ]),
    ]);
  },
});
