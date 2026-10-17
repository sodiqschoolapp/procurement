import type * as z from "zod";

import { overspendNeedsAck } from "@/domain/money-ledger";
import { settlementFactsOf } from "@/features/money/settlement-facts";
import { ordersInput } from "@/server/order-action";
import { type MoveActionInput, orderMoveAction } from "@/server/order-moves";
import { readSettings } from "@/server/settings";

import { financeOf, noticePerBranch, ownersAndHeads } from "./notices";

// Send to settlement of ticked finished orders (06-approval-workflow.md, Allowed moves: "Open |
// Send to settlement | Owner or Head | Waiting for settlement | The order's buying is finished";
// 08 Closing 1 and 2; rule 8; plan of 4.4, decided item 1, Look first): the way an order with a
// difference, a substitution (07 Substitution), or of a Manager whose CLOSE_ALONE is off goes to
// Finance. No reason. Told: the branch's active Finance users (10 Notifications, "Sent to
// settlement"). Finance's settlement screen is 4.5. Since 4.7 also "Overspend above the guard" to
// every active Head, counting only the sent orders above the guard under the settings of this
// moment, one notice per branch, none when no order is above it (08 Overspend guard; 10
// Notifications; plan of 4.7, decided item 1, Look first).

const input = ordersInput({}) as z.ZodType<MoveActionInput>;

export const sendToSettlementOrders = orderMoveAction<MoveActionInput>({
  name: "sendToSettlementOrders",
  action: "SEND_TO_SETTLEMENT",
  input,
  async notify(context, result) {
    await noticePerBranch(context, result.actionId, "REQUEST_SENT_TO_SETTLEMENT", (_, branchId) =>
      financeOf(context.tx, branchId),
    );
    const facts = await settlementFactsOf(
      context.tx,
      context.orders.map((order) => order.id),
    );
    const guard = await readSettings(context.tx);
    const over = context.orders.filter((order) => {
      const found = facts.get(order.id);
      return found !== undefined && overspendNeedsAck(found, guard);
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
