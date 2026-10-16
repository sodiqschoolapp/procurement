import { and, eq } from "drizzle-orm";
import type * as z from "zod";

import { businessDate } from "@/domain/business-date";
import { now } from "@/server/clock";
import { users } from "@/server/db/schema";
import { type MoveActionInput, orderMoveAction } from "@/server/order-moves";
import { OrdersRefusal, ordersInput } from "@/server/order-action";

import { noticePerBranch } from "./notices";
import { failuresOf, readSubmitRows, writePlan, writeSnapshots } from "./submit-steps";

// Submit again of ticked sent-back orders by their owner (06-approval-workflow.md, Allowed
// moves: "Sent back for editing | Submit again | Owner | Waiting for Head | Revision number goes
// up by 1"; rules 4, 8; 02 A4; 05 Order number 4; plan of 2.11). The state machine raises the
// revision; the number stays. Then, as Submit does (./submit-steps.ts):
//
//   beforeMove  the checks of 05 per order, refused with `not_ready` and the cells; then
//               planned_total = orderTotal() and stock_at_submit, while the order is still
//               RETURNED (`orders_guard`; decided item 4, Look first)
//   afterMove   the full copy of the new revision (14 order_revisions), its submission 1
//   notify      every active Head, one per branch: "Orders submitted or submitted again"
//
// Earlier approvals stay in History and no longer count: the stepper reads only the moves after
// the newest Submit or Submit again (orderSteps() of src/domain/order-steps.ts; 06 rule 4).

const input = ordersInput({}) as z.ZodType<MoveActionInput>;

export const submitAgainOrders = orderMoveAction<MoveActionInput>({
  name: "submitAgainOrders",
  action: "SUBMIT_AGAIN",
  input,
  async beforeMove(context) {
    const at = now();
    const rows = await readSubmitRows(
      context.tx,
      context.orders.map((order) => order.id),
    );
    const failed = failuresOf(context.input.orders, rows, businessDate(at));
    if (failed.length > 0) throw new OrdersRefusal("not_ready", failed);
    // Every order already has its number (05 Order number 4).
    await writePlan(context.tx, rows, new Map(), at);
  },
  async afterMove(context) {
    await writeSnapshots(
      context.tx,
      context.orders.map((order) => order.id),
      now(),
    );
  },
  async notify(context, result) {
    await noticePerBranch(context, result.actionId, "REQUEST_SUBMITTED", async () => {
      const heads = await context.tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, "HEAD"), eq(users.isActive, true)));
      return heads.map((head) => head.id);
    });
  },
});
