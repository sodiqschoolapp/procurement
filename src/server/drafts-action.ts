import * as z from "zod";

import { ORDER_ACTION_MAX } from "@/domain/order-moves";
import type { Actor, Permission } from "@/domain/permissions";
import { now } from "@/server/clock";

import { fieldErrors } from "./action-input";
import { type ActionResult, type OrderFailure, failure } from "./action-result";
import {
  type LockedOrder,
  type Transaction,
  guardOrders,
  lockOrders,
  ordersFailure,
  raiseVersions,
} from "./order-action";

// The wrapper of one edit on many ticked drafts, such as "apply one needed-by date to all ticked"
// (05-order-request-form.md field 8; developer-rules.md rules 3, 9; 06-approval-workflow.md rule
// 8; plan of 2.5a, decided item 10, Look first). It runs on the lock, guard and failure helpers of
// ./order-action.ts, in the same fixed order, in one transaction:
//
//   input     the Zod check, before the transaction: 1 to 200 drafts, no id twice
//   lock      SELECT … FOR UPDATE of every order, ORDER BY id
//   authorize authorizeOrders(): branch, owner and the draft wall read under the lock
//   version   each order's sent version against the locked one
//   check     the status check
//   write     the change; the wrapper raises every version and sets updated_at
//
// A draft edit is no status move, so it writes no `order_actions` or `order_events` row (the enum
// has no such type, and a never-submitted draft has no events: decisions 2.4, item 4), and it
// takes no client key, because it is not a create: a retry after a lost answer meets
// `stale_version` and the grid reloads (06 rule 7). Any failing order saves nothing.

const DRAFTS_SHAPE = {
  orders: z
    .array(z.object({ id: z.uuid(), version: z.int().min(1) }))
    .min(1)
    .max(ORDER_ACTION_MAX),
};

export type DraftsInput = { orders: { id: string; version: number }[] };

/** The input schema of an edit on ticked drafts: 1 to 200, no draft twice, and its own fields. */
export function draftsInput<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.object({ ...DRAFTS_SHAPE, ...shape }).refine(
    (input) => {
      const ticked = (input as DraftsInput).orders;
      return new Set(ticked.map((order) => order.id)).size === ticked.length;
    },
    { path: ["orders"], message: "A draft is ticked twice." },
  );
}

export type DraftsContext<Input> = {
  tx: Transaction;
  input: Input;
  userId: string;
  actor: Actor;
  /** The locked orders behind no wall, in the lock order (by id). */
  orders: readonly LockedOrder[];
};

/** The one result shape: each draft with its raised version. */
export type DraftsResult = { orders: { id: string; version: number }[] };

export type DraftsActionDefinition<Input extends DraftsInput> = {
  /** For the log only. */
  name: string;
  input: z.ZodType<Input>;
  /** The permission one order needs. */
  permission: Permission;
  /** The status check: the orders that fail and why. */
  check(context: DraftsContext<Input>): readonly OrderFailure[];
  write(context: DraftsContext<Input>): Promise<void>;
};

export function defineDraftsAction<Input extends DraftsInput>(
  definition: DraftsActionDefinition<Input>,
): DraftsActionDefinition<Input> {
  return definition;
}

/** Runs an edit on ticked drafts for a user; nothing is saved unless every draft passes. */
export async function runDraftsAction<Input extends DraftsInput>(
  definition: DraftsActionDefinition<Input>,
  userId: string,
  rawInput: unknown,
): Promise<ActionResult<DraftsResult>> {
  const parsed = definition.input.safeParse(rawInput);
  if (!parsed.success) return failure("invalid_input", fieldErrors(parsed.error, rawInput));
  const input = parsed.data;

  try {
    // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
    const { db } = await import("@/server/db/client");
    const data = await db.transaction(async (tx) => {
      const sent = input.orders;
      const locked = await lockOrders(
        tx,
        sent.map((order) => order.id),
      );
      const { actor, failures, visible } = await guardOrders(
        tx,
        userId,
        sent,
        locked,
        () => definition.permission,
      );
      const context: DraftsContext<Input> = { tx, input, userId, actor, orders: visible };
      if (visible.length > 0) {
        for (const { orderId, code } of definition.check(context)) failures.add(orderId, code);
      }
      failures.throwIfAny(sent);

      await definition.write(context);
      const raised = await raiseVersions(tx, locked, now());
      const versionOf = new Map(raised.map((row) => [row.id, row.version]));
      return { orders: sent.map(({ id }) => ({ id, version: versionOf.get(id)! })) };
    });
    return { ok: true, data };
  } catch (error) {
    return ordersFailure(definition.name, error);
  }
}
