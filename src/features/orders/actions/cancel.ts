import { and, eq, inArray } from "drizzle-orm";
import * as z from "zod";

import { cancelPlanGaps } from "@/domain/submit-checks";
import type { FieldMessageKey, OrderFailure } from "@/server/action-result";
import { orders } from "@/server/db/schema";
import { type MoveActionInput, orderMoveAction } from "@/server/order-moves";
import { OrdersRefusal, ordersInput } from "@/server/order-action";

import { noticePerOwner } from "./notices";

// Cancel of ticked orders by their owner or the Head (06-approval-workflow.md, Allowed moves:
// "Any 'Waiting for' step, Sent back, Draft with a number (taken back) | Cancel | Owner or Head |
// Cancelled | Reason"; rules 3, 8; 03 matrix "Add, edit, submit, cancel orders"; plans of 2.11 and
// 2.3b). The state machine refuses a Draft without a number (it is deleted instead). Then:
//
//   beforeMove  a taken-back Draft whose plan misses a cell is refused `not_ready` with the cells,
//               so the order never reaches `orders_submitted_plan_check` half-filled (plan of
//               2.3b, decided item 14, Look first)
//   notify      each owner whose orders someone else cancelled, one per owner and branch (10
//               Notifications: "Cancelled by someone other than its owner | Owner"; decided item 8)

const input = ordersInput({ reason: z.string().optional() }) as z.ZodType<MoveActionInput>;

export const cancelOrders = orderMoveAction<MoveActionInput>({
  name: "cancelOrders",
  action: "CANCEL",
  input,
  async beforeMove(context) {
    const drafts = context.orders.filter((order) => order.status === "DRAFT");
    if (drafts.length === 0) return;
    const rows = await context.tx
      .select({
        id: orders.id,
        variantId: orders.variantId,
        departmentId: orders.departmentId,
        neededBy: orders.neededBy,
        quantity: orders.plannedQty,
        price: orders.plannedPrice,
        total: orders.plannedTotal,
        priority: orders.priority,
        urgentReason: orders.urgentReason,
      })
      .from(orders)
      .where(
        and(
          eq(orders.status, "DRAFT"),
          inArray(
            orders.id,
            drafts.map((order) => order.id),
          ),
        ),
      );
    const byId = new Map(rows.map((row) => [row.id, row]));
    const failed: OrderFailure[] = [];
    for (const { id } of context.input.orders) {
      const row = byId.get(id);
      if (!row) continue;
      const gaps = Object.entries(cancelPlanGaps(row));
      if (gaps.length === 0) continue;
      const fields: Record<string, FieldMessageKey> = {};
      for (const [cell, kind] of gaps) fields[cell] = `errors.field.${kind}`;
      failed.push({ orderId: id, code: "not_ready", fields });
    }
    if (failed.length > 0) throw new OrdersRefusal("not_ready", failed);
  },
  async notify(context, result) {
    await noticePerOwner(context, result.actionId, "REQUEST_CANCELLED", {});
  },
});
