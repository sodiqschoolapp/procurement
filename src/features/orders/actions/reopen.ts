import { inArray } from "drizzle-orm";
import * as z from "zod";

import { orderSettlements, orders } from "@/server/db/schema";
import { ordersInput } from "@/server/order-action";
import { type MoveActionInput, orderMoveAction } from "@/server/order-moves";

import { financeOf, noticePerBranch, ownersAndHeads } from "./notices";

// The Head's Reopen of ticked Closed orders (06-approval-workflow.md, Allowed moves: "Closed |
// Reopen | Head | Open | Reason. Settlement confirmations and the overspend acknowledgment are
// cleared"; rules 3 and 8; 08 Overspend guard, last sentence; edge cases "An error is found after
// closing" and "A money action must be cancelled but one of its orders is already Closed"; plan of
// 4.8). The state machine's row names `request.reopen`, the Head only, and the reason (06 rule 3).
// The order is Open again with its buying progress as it was (decided item 3, Look first), so a
// record or a money action can be cancelled and the order settled again through the Open rows.
// `closed_at` is cleared, so the "closed" date filter no longer finds it (decided item 1, Look
// first); the next Close writes it again. The transfer and card confirmations, the transfer note
// and the acknowledgment are cleared as Send back for correction clears them (decided item 2, Look
// first): the row is updated, never deleted, and the event says so (`payload.settlementCleared`).
// The counts are read from the rows on every read, so nothing else is written (decided item 5).
// Told: the owners, every active Head and the branch's active Finance users (10 Notifications,
// "Closed, reopened"; decided item 4, Look first), never the actor.

const input = ordersInput({ reason: z.string().optional() }) as z.ZodType<MoveActionInput>;

export const reopenOrders = orderMoveAction<MoveActionInput>({
  name: "reopenOrders",
  action: "REOPEN",
  input,
  async afterMove(context, moves) {
    const ids = moves.map((move) => move.orderId);
    await context.tx.update(orders).set({ closedAt: null }).where(inArray(orders.id, ids));
    const cleared = await context.tx
      .update(orderSettlements)
      .set({
        transferConfirmedBy: null,
        transferConfirmedAt: null,
        transferNote: null,
        cardConfirmedBy: null,
        cardConfirmedAt: null,
        overspendAckBy: null,
        overspendAckAt: null,
        overspendAckComment: null,
      })
      .where(inArray(orderSettlements.orderId, ids))
      .returning({ orderId: orderSettlements.orderId });
    return new Map(
      cleared.map((row) => [row.orderId, { payload: { settlementCleared: true } }] as const),
    );
  },
  async notify(context, result) {
    await noticePerBranch(
      context,
      result.actionId,
      "REQUEST_REOPENED",
      async (owners, branchId) => [
        ...new Set([
          ...(await ownersAndHeads(context.tx, owners)),
          ...(await financeOf(context.tx, branchId)),
        ]),
      ],
    );
  },
});
