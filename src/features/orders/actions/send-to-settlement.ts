import type * as z from "zod";

import { ordersInput } from "@/server/order-action";
import { type MoveActionInput, orderMoveAction } from "@/server/order-moves";

import { financeOf, noticePerBranch } from "./notices";

// Send to settlement of ticked finished orders (06-approval-workflow.md, Allowed moves: "Open |
// Send to settlement | Owner or Head | Waiting for settlement | The order's buying is finished";
// 08 Closing 1 and 2; rule 8; plan of 4.4, decided item 1, Look first): the way an order with a
// difference, a substitution (07 Substitution), or of a Manager whose CLOSE_ALONE is off goes to
// Finance. No reason. Told: the branch's active Finance users (10 Notifications, "Sent to
// settlement"). Finance's settlement screen is 4.5.

const input = ordersInput({}) as z.ZodType<MoveActionInput>;

export const sendToSettlementOrders = orderMoveAction<MoveActionInput>({
  name: "sendToSettlementOrders",
  action: "SEND_TO_SETTLEMENT",
  input,
  async notify(context, result) {
    await noticePerBranch(context, result.actionId, "REQUEST_SENT_TO_SETTLEMENT", (_, branchId) =>
      financeOf(context.tx, branchId),
    );
  },
});
