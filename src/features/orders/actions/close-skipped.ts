import { inArray } from "drizzle-orm";
import type * as z from "zod";

import { orderOverspend } from "@/domain/money-ledger";
import { settlementFactsOf } from "@/features/money/settlement-facts";
import { now } from "@/server/clock";
import { orders } from "@/server/db/schema";
import { ordersInput } from "@/server/order-action";
import { type MoveActionInput, orderMoveAction } from "@/server/order-moves";
import { readSettings } from "@/server/settings";

import { financeOf, noticePerBranch, ownersAndHeads } from "./notices";

// Close of ticked finished orders that skipped Finance (06-approval-workflow.md, Allowed moves:
// "Open, skipped Finance | Close | Owner or Head | Closed | The order's buying is finished";
// Finance step switched off 3 and 4; rule 8; plan of 4.10c, decided items 3 and 4, Look first).
// Whatever the difference: no exact match, no settlement, no acknowledgment. The owner closes
// when CLOSE_ALONE is on, the Head always (`request.close_skipped`). The state machine reads the
// mark and the progress from the locked order; nothing else is read before the move.
//
// Told: the owners, every active Head and the branch's active Finance users (10 Notifications,
// "Closed, reopened"; decided item 11), never the actor. Then "Overspend above the guard" to every
// active Head, for the closed orders above the guard under the settings of this moment, one notice
// per branch, none when no order is above it (08 Overspend guard: "An order that skipped Finance
// needs no acknowledgment; the Head is still notified"; decided item 8, Look first).

const input = ordersInput({}) as z.ZodType<MoveActionInput>;

export const closeSkippedOrders = orderMoveAction<MoveActionInput>({
  name: "closeSkippedOrders",
  action: "CLOSE_SKIPPED",
  input,
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
    const facts = await settlementFactsOf(
      context.tx,
      context.orders.map((order) => order.id),
    );
    const guard = await readSettings(context.tx);
    const over = context.orders.filter((order) => {
      const found = facts.get(order.id);
      return found !== undefined && orderOverspend(found, guard).needsHead;
    });
    if (over.length === 0) return;
    await noticePerBranch(
      { ...context, orders: over },
      result.actionId,
      "OVERSPEND_ABOVE_GUARD",
      () => ownersAndHeads(context.tx, []),
    );
  },
});
