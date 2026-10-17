import { eq, inArray } from "drizzle-orm";
import * as z from "zod";

import { isMoveReason, moveReason } from "@/domain/order-moves";
import {
  type BuyingAction,
  type OrderProgress,
  actualQuantity,
  buyingRefusal,
  buyingStatusAllows,
  finishedProgress,
} from "@/domain/purchases";
import { ActionError } from "@/server/action";
import type { OrderFailure } from "@/server/action-result";
import { orders } from "@/server/db/schema";
import {
  type OrderEventExtra,
  type OrdersContext,
  type OrdersInput,
  defineOrdersAction,
  ordersInput,
} from "@/server/order-action";
import { reasonFields } from "@/server/order-moves";

import { recordsOfOrders } from "../order-records";

// "Finish order", "Not bought" and "Reopen buying" on ticked Open orders (07-purchasing.md, Order
// progress: "'Finish order' and 'Not bought' work on ticked orders at once, with one reason";
// "While the order is Open, the Manager can reopen a finished order's buying"; plan of 3.5). They
// move no status (06 Statuses), so they are writes of `ORDER_EVENT_TYPES`, not rows of the state
// machine (decided item 13). Each runs in the wrapper of src/server/order-action.ts: lock, repeat,
// authorize `purchase.record` (the Head in any branch, the owner with RECORD_PURCHASES on; decided
// item 2, Look first), version, then:
//
//   check    status Open and the progress the action starts from (`wrong_status`)
//   inspect  Finish and Not bought: what the order has received, read from its records under the
//            orders' row locks, so a record saved at the same moment waits (it locks the order
//            too) and cannot pass it (`not_ready`; decided item 15, Look first)
//   write    progress and `finish_reason`; the wrapper raises the version and writes one history
//            event per order with the reason and `progress: {from, to}`
//
// buyingRefusal() of src/domain/purchases.ts is the rule; the screens ask buyingActions(). No
// notification (decided item 9).

export type FinishInput = OrdersInput & { reason: string };
export type ReopenInput = OrdersInput;

const withReason = ordersInput({ reason: z.string().optional() }) as unknown as z.ZodType<FinishInput>;
const noReason = ordersInput({}) as unknown as z.ZodType<ReopenInput>;

/** The status check of one buying action: every order it does not start from is `wrong_status`. */
function statusCheck(kind: BuyingAction, context: OrdersContext<OrdersInput>): OrderFailure[] {
  return context.orders
    .filter((order) => !buyingStatusAllows(kind, order))
    .map((order) => ({ orderId: order.id, code: "wrong_status" as const }));
}

/** What each locked order has received and its planned quantity, read under the lock. */
async function receivedOf(context: OrdersContext<OrdersInput>) {
  const ids = context.orders.map((order) => order.id);
  const plans = await context.tx
    .select({ id: orders.id, plannedQty: orders.plannedQty })
    .from(orders)
    .where(inArray(orders.id, ids));
  const records = await recordsOfOrders(context.tx, ids);
  return new Map(
    plans.map((plan) => [
      plan.id,
      { plannedQty: plan.plannedQty!, received: actualQuantity(records.get(plan.id) ?? []) },
    ]),
  );
}

/** The received rule of Finish and Not bought, after the status check (`not_ready`). */
async function receivedCheck(
  kind: "FINISH_ORDER" | "MARK_NOT_BOUGHT",
  context: OrdersContext<OrdersInput>,
): Promise<OrderFailure[]> {
  const facts = await receivedOf(context);
  return context.orders
    .filter((order) => buyingStatusAllows(kind, order))
    .filter((order) => buyingRefusal(kind, { ...order, ...facts.get(order.id)! }) === "not_ready")
    .map((order) => ({ orderId: order.id, code: "not_ready" as const }));
}

/** One reason for every ticked order, 5 to 500 once trimmed (06 rule 3; decided item 7). */
function storedReason(input: FinishInput): string {
  if (!isMoveReason(input.reason)) throw new ActionError("invalid_input", reasonFields(input.reason));
  return moveReason(input.reason);
}

/** Writes each order's progress and finish reason; the event's payload names the change. */
async function writeProgress(
  context: OrdersContext<OrdersInput>,
  next: (orderId: string) => { progress: OrderProgress; finishReason: string | null },
): Promise<Map<string, OrderEventExtra>> {
  const extras = new Map<string, OrderEventExtra>();
  for (const order of context.orders) {
    const { progress, finishReason } = next(order.id);
    await context.tx
      .update(orders)
      .set({ progress, finishReason })
      .where(eq(orders.id, order.id));
    extras.set(order.id, { payload: { progress: { from: order.progress, to: progress } } });
  }
  return extras;
}

/** Finish order: Done short below the plan, Done at or above it after a reopen (decided item 1). */
export const finishOrders = defineOrdersAction<FinishInput>({
  name: "finishOrders",
  type: "FINISH_ORDER",
  input: withReason,
  permission: () => "purchase.record",
  repeatPermission: () => "purchase.record",
  reason: (input) => (isMoveReason(input.reason) ? moveReason(input.reason) : null),
  check(context) {
    storedReason(context.input);
    return statusCheck("FINISH_ORDER", context);
  },
  inspect: (context) => receivedCheck("FINISH_ORDER", context),
  async write(context) {
    const reason = storedReason(context.input);
    const facts = await receivedOf(context);
    return writeProgress(context, (orderId) => {
      const { plannedQty, received } = facts.get(orderId)!;
      const done = finishedProgress("FINISH", plannedQty, received);
      // The inspect step refused every order without something received.
      if (!("progress" in done)) throw new ActionError("unexpected");
      // Done keeps no reason; the history does (orders_finish_reason_check).
      return {
        progress: done.progress,
        finishReason: done.progress === "DONE_SHORT" ? reason : null,
      };
    });
  },
});

/** Not bought: nothing received, with one reason (07; edge case "The item cannot be found"). */
export const markNotBought = defineOrdersAction<FinishInput>({
  name: "markNotBought",
  type: "MARK_NOT_BOUGHT",
  input: withReason,
  permission: () => "purchase.record",
  repeatPermission: () => "purchase.record",
  reason: (input) => (isMoveReason(input.reason) ? moveReason(input.reason) : null),
  check(context) {
    storedReason(context.input);
    return statusCheck("MARK_NOT_BOUGHT", context);
  },
  inspect: (context) => receivedCheck("MARK_NOT_BOUGHT", context),
  async write(context) {
    const reason = storedReason(context.input);
    return writeProgress(context, () => ({ progress: "NOT_BOUGHT", finishReason: reason }));
  },
});

/** Reopen buying: a finished order's buying is Open again, no reason (decided item 3). */
export const reopenBuying = defineOrdersAction<ReopenInput>({
  name: "reopenBuying",
  type: "REOPEN_BUYING",
  input: noReason,
  permission: () => "purchase.record",
  repeatPermission: () => "purchase.record",
  reason: () => null,
  check: (context) => statusCheck("REOPEN_BUYING", context),
  write: (context) => writeProgress(context, () => ({ progress: "OPEN", finishReason: null })),
});
