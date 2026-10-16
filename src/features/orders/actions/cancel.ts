import * as z from "zod";

import { type MoveActionInput, orderMoveAction } from "@/server/order-moves";
import { ordersInput } from "@/server/order-action";

// Cancel of ticked orders by their owner or the Head (06-approval-workflow.md, Allowed moves:
// "Any 'Waiting for' step, Sent back | Cancel | Owner or Head | Cancelled | Reason"; rules 3, 8;
// 03 matrix "Add, edit, submit, cancel orders"; plan of 2.11). Nobody is told: 10 Notifications
// has no row for it (decided item 5, Look first).

const input = ordersInput({ reason: z.string().optional() }) as z.ZodType<MoveActionInput>;

export const cancelOrders = orderMoveAction<MoveActionInput>({
  name: "cancelOrders",
  action: "CANCEL",
  input,
});
