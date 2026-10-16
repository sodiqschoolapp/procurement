import * as z from "zod";

import { type MoveActionInput, orderMoveAction } from "@/server/order-moves";
import { ordersInput } from "@/server/order-action";

import { noticePerBranch, ownersAndHeads } from "./notices";

// Reject of ticked orders at the Head, Principal and Finance steps (06-approval-workflow.md,
// Allowed moves: "Any 'Waiting for' step | Reject | The approver of that step | Rejected |
// Reason"; rules 2, 3, 8; 10 Notifications "Sent back, rejected | Owner, Head"; plan of 2.11).
// Rejected is final: no row of the state machine leaves it, `orders_guard` freezes its plan and
// the draft actions refuse it; the owner can still use "Copy as new" (2.13).

const input = ordersInput({ reason: z.string().optional() }) as z.ZodType<MoveActionInput>;

export const rejectOrders = orderMoveAction<MoveActionInput>({
  name: "rejectOrders",
  action: "REJECT",
  input,
  async notify(context, result) {
    await noticePerBranch(context, result.actionId, "REQUEST_REJECTED", (owners) =>
      ownersAndHeads(context.tx, owners),
    );
  },
});
