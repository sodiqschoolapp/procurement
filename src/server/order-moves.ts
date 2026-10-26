import { inArray, sql } from "drizzle-orm";
import type * as z from "zod";

import {
  ORDER_ACTION_MAX,
  ORDER_MOVES,
  type MoveInput,
  type OrderAction,
  type OrderState,
  type PlannedMove,
  assertMove,
  checkMoves,
  isMoveReason,
  moveReason,
  MOVE_REASON_MAX,
} from "@/domain/order-moves";
import type { Permission } from "@/domain/permissions";
import type { RequestStatus } from "@/domain/request-status";
import { orders } from "@/server/db/schema";

import { ActionError } from "./action";
import type { FieldMessageKey, OrderFailure } from "./action-result";
import {
  type LockedOrder,
  type OrderEventExtra,
  type OrdersActionDefinition,
  type OrdersContext,
  type OrdersInput,
  type OrdersResult,
  type OrdersWriteContext,
  defineOrdersAction,
} from "./order-action";

// The status move of ticked orders, on the wrapper of order-action.ts (plan of 2.4): the server
// asks the one state machine of src/domain/order-moves.ts again before it writes
// (developer-rules.md rule 2). Every fact of OrderState is read from the locked order and its
// owner, never from the input (rule 13; progress 2.3, "For 2.4"). The facts of phases 3 and 4 are
// `false` until those phases build them. Submit's checks and numbers (2.7) go in through
// `beforeMove`, while the orders are still DRAFT; Finance's payment type (2.10) also through
// `beforeMove`, while the order is still PENDING_FINANCE, the only status at which `orders_guard`
// lets it change. Finance's `approved_at` (2.10), its cash (4.2) and the per-order notes of a
// send-back (2.11) go in through `afterMove`.

/** The input of a move: the orders, and a reason where the move needs one (06 rule 3). */
export type MoveActionInput = OrdersInput & { reason?: string };

/** The permission of the move row of a status, or `data.view` when there is none. */
function permissionOf(status: RequestStatus, action: OrderAction): Permission {
  // Without a row the wall still answers first (`not_found`), and the machine then says
  // `wrong_status` (plan of 2.4, Server actions).
  return (
    ORDER_MOVES.find((move) => move.from === status && move.action === action)?.permission ??
    "data.view"
  );
}

/** The machine's view of one locked order. */
export function orderState(order: LockedOrder): OrderState {
  return {
    id: order.id,
    status: order.status,
    branchId: order.branchId,
    ownerId: order.ownerId,
    createdByHead: order.createdByHead,
    numbered: order.numbered,
    buyingFinished: order.progress !== "OPEN",
    // 08 Exact match: read by the `facts` step of Close (plan of 4.4); 08 Closing 3: read by the
    // `facts` step of Finance's Close (plan of 4.6). Unread is false, never a guess.
    exactMatch: order.exactMatch ?? false,
    ownerClosesAlone: order.ownerClosesAlone,
    readyToClose: order.readyToClose ?? false,
    skippedFinance: order.skippedFinance,
  };
}

/**
 * What the move reads besides the orders: the reason, and the setting `finance_step` as the
 * approval's facts step read it, once for the whole action under the settings lock (plan of
 * 4.10c, decided item 1, Look first). Unread is on: no other move reads it.
 */
function moveInput<Input extends MoveActionInput>(context: OrdersContext<Input>): MoveInput {
  return {
    reason: context.input.reason,
    financeStep: !context.orders.some((order) => order.financeStep === false),
  };
}

/** Why a reason is refused, as the field error of `reason` (06 rule 3). */
export function reasonFields(reason: unknown): Record<string, FieldMessageKey> {
  if (typeof reason !== "string" || reason.trim() === "")
    return { reason: "errors.field.required" };
  if (Array.from(moveReason(reason)).length > MOVE_REASON_MAX) {
    return { reason: "errors.field.tooLong" };
  }
  return { reason: "errors.field.tooShort" };
}

/** The machine's answer for the visible orders, as the wrapper's per-order failures. */
function checkOf<Input extends MoveActionInput>(
  action: OrderAction,
  context: OrdersContext<Input>,
): readonly OrderFailure[] {
  // The machine judges at most 200 orders at once; a Submit with nothing ticked takes in its whole
  // submit set and sends at most 200 of it (plan of 2.5c), so its set is judged 200 at a time.
  const failed: OrderFailure[] = [];
  for (let at = 0; at < context.orders.length; at += ORDER_ACTION_MAX) {
    const check = checkMoves(
      context.actor,
      context.orders.slice(at, at + ORDER_ACTION_MAX).map(orderState),
      action,
      moveInput(context),
    );
    if (check.ok) continue;
    const refusal = check.refusal;
    if (refusal.kind === "reason") {
      throw new ActionError("invalid_input", reasonFields(context.input.reason));
    }
    // `none`, `too_many` and `duplicate` are refused by the input schema first.
    if (refusal.kind !== "orders") throw new ActionError("invalid_input");
    for (const { orderId, reason } of refusal.orders) failed.push({ orderId, code: reason });
  }
  return failed;
}

/** Writes each order's new status, and its revision where the move raises it. */
async function writeMoves(
  context: OrdersWriteContext<MoveActionInput>,
  moves: readonly PlannedMove[],
): Promise<void> {
  // One statement per target status and revision step, never one per order (rule 12).
  const groups = new Map<string, { to: RequestStatus; revisionUp: boolean; ids: string[] }>();
  for (const move of moves) {
    const key = `${move.to}:${move.revisionUp}`;
    const group = groups.get(key) ?? { to: move.to, revisionUp: move.revisionUp, ids: [] };
    group.ids.push(move.orderId);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    await context.tx
      .update(orders)
      .set({
        status: group.to,
        ...(group.revisionUp ? { revision: sql`${orders.revision} + 1` } : {}),
      })
      .where(inArray(orders.id, group.ids));
  }
}

/**
 * An action that makes one status move on ticked orders. `beforeMove` runs before the status is
 * written (2.7: the submit checks, which may throw a refusal before anything is written, then the
 * number, `submitted_at`, `planned_total` and `stock_at_submit`, which the CHECKs and
 * `orders_guard` of migration 0019 need while the order is still DRAFT; review of the plan of
 * 2.7, correction 5); 2.10: Finance's payment type, which `orders_guard` allows only while the
 * order is still PENDING_FINANCE. `afterMove` writes what a move adds after it (2.10:
 * `approved_at`; 4.2: the cash, which names `context.actionId`; 2.11: the notes) in the same
 * transaction. Both may return each order's event extras; `headStepAuto` is logged in the Submit event's
 * payload as `{ "headStepAuto": true }`, "Created by Head" (03 rule 6; review of the plan of 2.4,
 * correction 5).
 */
export function orderMoveAction<Input extends MoveActionInput>(options: {
  name: string;
  action: OrderAction;
  input: z.ZodType<Input>;
  beforeMove?(
    context: OrdersWriteContext<Input>,
    moves: readonly PlannedMove[],
  ): Promise<ReadonlyMap<string, OrderEventExtra> | void>;
  afterMove?(
    context: OrdersWriteContext<Input>,
    moves: readonly PlannedMove[],
  ): Promise<ReadonlyMap<string, OrderEventExtra> | void>;
  notify?(context: OrdersContext<Input>, result: OrdersResult): Promise<void>;
  /** The state machine's facts other tables hold, under the lock (plan of 4.4). */
  facts?(context: OrdersContext<Input>): Promise<readonly LockedOrder[]>;
  /** A check of the action's own beside the machine's, under the lock (plan of 2.5c). */
  inspect?: OrdersActionDefinition<Input>["inspect"];
  /** The orders left untouched, and the same answer for a repeat (plan of 2.5c). */
  leave?: OrdersActionDefinition<Input>["leave"];
  leftOnRepeat?: OrdersActionDefinition<Input>["leftOnRepeat"];
}): OrdersActionDefinition<Input> {
  const { action } = options;
  return defineOrdersAction<Input>({
    name: options.name,
    type: action,
    input: options.input,
    permission: (order) => permissionOf(order.status, action),
    repeatPermission: (fromStatus) => permissionOf(fromStatus, action),
    reason: (input) => (isMoveReason(input.reason) ? moveReason(input.reason) : null),
    facts: options.facts,
    check: (context) => checkOf(action, context),
    inspect: options.inspect,
    leave: options.leave,
    leftOnRepeat: options.leftOnRepeat,
    async write(context) {
      const moves = assertMove(
        context.actor,
        context.orders.map(orderState),
        action,
        moveInput(context),
      );
      const before = await options.beforeMove?.(context, moves);
      await writeMoves(context, moves);
      const extras = new Map<string, OrderEventExtra>();
      for (const move of moves) {
        if (move.headStepAuto) extras.set(move.orderId, { payload: { headStepAuto: true } });
      }
      const after = await options.afterMove?.(context, moves);
      for (const added of [before, after]) {
        for (const [orderId, extra] of added ?? []) {
          const had = extras.get(orderId);
          extras.set(orderId, {
            ...had,
            ...extra,
            payload:
              had?.payload || extra.payload ? { ...had?.payload, ...extra.payload } : undefined,
          });
        }
      }
      return extras;
    },
    notify: options.notify,
  });
}
