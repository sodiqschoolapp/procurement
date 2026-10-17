import { inArray } from "drizzle-orm";
import * as z from "zod";

import { orderSettlements } from "@/server/db/schema";
import { ordersInput } from "@/server/order-action";
import { type MoveActionInput, orderMoveAction } from "@/server/order-moves";

import { noticePerBranch, ownersAndHeads } from "./notices";

// Send back for correction of ticked orders in settlement (06-approval-workflow.md, Allowed
// moves: "Waiting for settlement | Send back for correction | Finance | Open | Reason"; 08 Closing
// 4: "If Finance finds a wrong record, it sends the order back to Open with a reason"; edge case
// "Finance finds an error during settlement"; plan of 4.5). The state machine's row names
// `request.settle`, Finance of its own branches, and the reason (06 rule 3). The order is Open
// again so its records can be corrected, so its transfer and card confirmations, the transfer note
// and the overspend acknowledgment are cleared, as a reopen clears them (08 Overspend guard, last
// sentence; decided item 6, Look first): the row is updated, never deleted. Told: the owners and
// the Heads (10 Notifications, "Sent back, rejected | Owner, Head"; decided item 7, Look first).

const input = ordersInput({ reason: z.string().optional() }) as z.ZodType<MoveActionInput>;

export const sendBackForCorrectionOrders = orderMoveAction<MoveActionInput>({
  name: "sendBackForCorrectionOrders",
  action: "SEND_BACK_FOR_CORRECTION",
  input,
  async afterMove(context, moves) {
    await context.tx
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
      .where(
        inArray(
          orderSettlements.orderId,
          moves.map((move) => move.orderId),
        ),
      );
  },
  async notify(context, result) {
    await noticePerBranch(context, result.actionId, "REQUEST_SENT_BACK_FOR_CORRECTION", (owners) =>
      ownersAndHeads(context.tx, owners),
    );
  },
});
