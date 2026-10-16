import * as z from "zod";

import { MOVE_REASON_MAX } from "@/domain/order-moves";
import { type MoveActionInput, orderMoveAction } from "@/server/order-moves";
import { type OrderEventExtra, ordersInput } from "@/server/order-action";

import { noticePerBranch, ownersAndHeads } from "./notices";

// Send back of ticked orders at the Head, Principal and Finance steps (06-approval-workflow.md,
// Allowed moves: "Any 'Waiting for' step | Send back | The approver of that step | Sent back for
// editing | Reason; optional note per order"; rules 2, 3, 8; 10 Notifications "Sent back,
// rejected | Owner, Head"; plan of 2.11). The state machine's rows name each step's permission,
// as Approve's do (decisions 2.10 item 1); the reason (06 rule 3) is checked by the machine before
// any order is judged. The returned orders are edited by their owner in the drafts grid (05
// Drafts 5); their next submit is Submit again (./submit-again.ts).

/** The input: the ticked orders, one reason, and an optional note per order (06 rule 3). */
export type SendBackInput = MoveActionInput & { notes?: Record<string, string> };

/** A note as it is stored: trimmed; an empty one is no note. Up to 500 code points (decided item 8). */
const note = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => Array.from(value).length <= MOVE_REASON_MAX, {
    message: "A note is longer than 500 characters.",
  });

const input = ordersInput({
  reason: z.string().optional(),
  notes: z.record(z.uuid(), note).optional(),
}) as z.ZodType<SendBackInput>;

export const sendBackOrders = orderMoveAction<SendBackInput>({
  name: "sendBackOrders",
  action: "SEND_BACK",
  input,
  async afterMove(context, moves) {
    // The note of each order on its own event (14 order_events: "note: the per-order note on
    // 'send back'"); a note of an order that is not ticked has no event to go on.
    const extras = new Map<string, OrderEventExtra>();
    const notes = context.input.notes ?? {};
    for (const { orderId } of moves) {
      const text = notes[orderId];
      if (text) extras.set(orderId, { note: text });
    }
    return extras;
  },
  async notify(context, result) {
    await noticePerBranch(context, result.actionId, "REQUEST_SENT_BACK", (owners) =>
      ownersAndHeads(context.tx, owners),
    );
  },
});
