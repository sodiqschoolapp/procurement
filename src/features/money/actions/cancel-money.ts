import { eq, sql } from "drizzle-orm";
import * as z from "zod";

import { moneyCancelAllows } from "@/domain/money-ledger";
import { isMoveReason, moveReason } from "@/domain/order-moves";
import { ActionError } from "@/server/action";
import type { OrderFailure } from "@/server/action-result";
import { now } from "@/server/clock";
import { moneyActions } from "@/server/db/schema";
import {
  type OrdersContext,
  type OrdersInput,
  defineOrdersAction,
  ordersInput,
} from "@/server/order-action";
import { reasonFields } from "@/server/order-moves";

import { movedSince } from "@/features/orders/moved-since";

// Cancel a wrong money action whole, with a reason, while none of its orders is Closed
// (08-money-and-settlement.md, Money ledger; edge cases "A money action must be cancelled but one
// of its orders is already Closed"; Decided ahead, question 3; plan of 4.3). In the wrapper of
// src/server/order-action.ts: lock, repeat, authorize `money.record` per order (Finance of its own
// branches; 03 Permission matrix), version, then:
//
//   check    the reason (5 to 500, as every move; decided item 9)
//   inspect  the action locked FOR UPDATE after its orders; its orders must be exactly the sent
//            ones (decided item 10), so every order it changes passed the lock, the branch wall
//            and the version; `moneyCancelAllows()`: an action cancelled before, or with an order
//            Closed, is `wrong_status` (the Closed order named: the Head reopens it first); so is
//            one whose order's owner now is not the owner it had when the action was written,
//            naming that owner (`movedSince()`; 08 Money ledger; plan of 4.10b, Look first)
//   write    the one cancel update the trigger money_actions_cancel_only of 0028 allows
//
// Nothing else changes: the action's rows are left out of every count from now on (08 Order's
// cash count). The wrapper raises the versions and writes one history event per order with the
// reason. Nobody is told (decided item 7).

export type CancelMoneyInput = OrdersInput & { moneyActionId: string; reason: string };

const input = ordersInput({
  moneyActionId: z.uuid(),
  reason: z.string().optional(),
}) as unknown as z.ZodType<CancelMoneyInput>;

function storedReason(value: CancelMoneyInput): string {
  if (!isMoveReason(value.reason)) {
    throw new ActionError("invalid_input", reasonFields(value.reason));
  }
  return moveReason(value.reason);
}

/** The action and the orders of its rows, the action locked FOR UPDATE. */
async function lockAction(context: OrdersContext<CancelMoneyInput>) {
  const [action] = await context.tx
    .select({
      id: moneyActions.id,
      isCancelled: moneyActions.isCancelled,
      createdAt: moneyActions.createdAt,
    })
    .from(moneyActions)
    .where(eq(moneyActions.id, context.input.moneyActionId))
    .for("update");
  if (!action) return null;
  const rows = await context.tx.execute<{ order_id: string }>(
    sql`select order_id from money_rows where money_action_id = ${action.id} order by order_id`,
  );
  return { ...action, orderIds: rows.rows.map((row) => row.order_id) };
}

export const cancelMoney = defineOrdersAction<CancelMoneyInput>({
  name: "cancelMoney",
  type: "CANCEL_MONEY",
  input,
  permission: () => "money.record",
  repeatPermission: () => "money.record",
  reason: (value) => (isMoveReason(value.reason) ? moveReason(value.reason) : null),
  check(context) {
    storedReason(context.input);
    return [];
  },
  async inspect(context) {
    const action = await lockAction(context);
    const sent = context.orders;
    // An action of no sent order tells nothing about it (03 rule 1).
    const sentIds = new Set(sent.map((order) => order.id));
    if (!action || !action.orderIds.some((id) => sentIds.has(id))) {
      return sent.map((order) => ({ orderId: order.id, code: "not_found" as const }));
    }
    if (action.orderIds.length !== sent.length || !action.orderIds.every((id) => sentIds.has(id))) {
      throw new ActionError("invalid_input", { orders: "errors.field.notAllowed" });
    }
    if (
      moneyCancelAllows(
        action,
        sent.map((order) => order.status),
      )
    ) {
      // An order whose owner now is not the one it had when the action was written: its cash
      // would land on the new owner's count; the Head first moves it back (08 Money ledger; D55
      // (2); plan of 4.10b, decided item 3, Look first).
      const moved = await movedSince(context.tx, sent, action.createdAt);
      return sent.flatMap((order) => {
        const then = moved.get(order.id);
        return then
          ? [
              {
                orderId: order.id,
                code: "wrong_status" as const,
                fields: { status: "errors.field.movedSince" as const },
                values: { manager: then.name },
              },
            ]
          : [];
      });
    }
    const refused: OrderFailure[] = action.isCancelled
      ? sent.map((order) => ({ orderId: order.id, code: "wrong_status" }))
      : sent
          .filter((order) => order.status === "CLOSED")
          .map((order) => ({
            orderId: order.id,
            code: "wrong_status",
            fields: { status: "errors.field.closedReopenFirst" },
          }));
    return refused;
  },
  async write(context) {
    await context.tx
      .update(moneyActions)
      .set({
        isCancelled: true,
        cancelReason: storedReason(context.input),
        cancelledBy: context.userId,
        cancelledAt: now(),
      })
      .where(eq(moneyActions.id, context.input.moneyActionId));
    const extras = new Map<string, { payload: Record<string, unknown> }>();
    for (const order of context.orders) {
      extras.set(order.id, { payload: { money: { actionId: context.input.moneyActionId } } });
    }
    return extras;
  },
});
