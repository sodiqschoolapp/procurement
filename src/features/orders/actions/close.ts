import { inArray } from "drizzle-orm";
import type * as z from "zod";

import { readyToClose } from "@/domain/money-ledger";
import { settlementFactsOf } from "@/features/money/settlement-facts";
import { now } from "@/server/clock";
import { orders } from "@/server/db/schema";
import { ordersInput } from "@/server/order-action";
import { type MoveActionInput, orderMoveAction } from "@/server/order-moves";
import { readSettings } from "@/server/settings";

import { financeOf, noticePerBranch, ownersAndHeads } from "./notices";

// Finance's Close of ticked orders in settlement (08-money-and-settlement.md, Closing 3: "Finance
// ticks orders and clicks 'Close'. It works when, for every ticked order, the cash count is 0,
// every block is confirmed, and any required Head acknowledgment is given; otherwise nothing
// closes and the screen names the orders that are not ready"; 06 Allowed moves, "Waiting for
// settlement | Close | Finance | Closed"; rule 8; plan of 4.6). The state machine's row names
// `request.settle`, Finance of its own branches. Readiness is `readyToClose()` over
// `settlementFactsOf()` and the guard settings, read under the lock by the wrapper's `facts` step,
// so the machine decides with it (decided items 1 and 2, Look first); an order that is not ready
// is `not_ready` and nothing closes. `closed_at` is set as `closeExactOrders` sets it. Told: the
// owners, every active Head and the branch's active Finance users (10 Notifications, "Closed,
// reopened"), never the actor.

const input = ordersInput({}) as z.ZodType<MoveActionInput>;

export const closeOrders = orderMoveAction<MoveActionInput>({
  name: "closeOrders",
  action: "CLOSE",
  input,
  async facts(context) {
    const facts = await settlementFactsOf(
      context.tx,
      context.orders.map((order) => order.id),
    );
    const guard = await readSettings(context.tx);
    return context.orders.map((order) => {
      const found = facts.get(order.id);
      return { ...order, readyToClose: found !== undefined && readyToClose(found, guard) };
    });
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
