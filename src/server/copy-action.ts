import { sql } from "drizzle-orm";
import * as z from "zod";

import { ORDER_ACTION_MAX } from "@/domain/order-moves";
import type { Actor, Permission } from "@/domain/permissions";
import { type CurrentUser, getCurrentUser } from "@/server/auth/session";
import { authorizeOrders } from "@/server/authorize";

import { ActionError, type FirstResult } from "./action";
import { fieldErrors } from "./action-input";
import { type ActionResult, type OrderFailure, failure } from "./action-result";
import {
  Failures,
  type LockedOrder,
  OrdersRefusal,
  type Transaction,
  guardOrders,
  lockOrders,
  ordersFailure,
} from "./order-action";

// The wrapper of a create from ticked orders: "Copy as new" makes one draft, or one add to a
// draft, from each ticked order (05-order-request-form.md, Ticking and filters; plan of 2.13,
// review Must fix 1). It runs on the lock, guard and failure helpers of ./order-action.ts, in one
// transaction, in this fixed order:
//
//   input     the Zod check, before the transaction: 1 to 200 orders, no id and no key twice
//   lock      SELECT … FOR UPDATE of every ticked order, ORDER BY id
//   repeat    every key seen before: the first answers, to their maker only (rule 8)
//   authorize authorizeOrders(): branch, owner and the draft wall read under the lock
//   version   each order's sent version against the locked one (decided item 5, Look first)
//   prepare   reads the ticked orders once and says what the action refuses (an inactive branch)
//   write     one create per ticked order; a refusal it throws names that order (06 rule 8)
//
// Each ticked order carries its own browser-made key, since each makes its own draft or add
// (developer-rules.md rule 8; decided item 4, Look first). A ticked order is read, never written:
// its version is not raised and no `order_actions` or `order_events` row is written, as a draft
// write has none (decisions 2.5a, item 21). Any failing order saves nothing.

const COPY_SHAPE = {
  orders: z
    .array(z.object({ id: z.uuid(), version: z.int().min(1), clientKey: z.uuid() }))
    .min(1)
    .max(ORDER_ACTION_MAX),
};

export type CopyInput = { orders: { id: string; version: number; clientKey: string }[] };

/** The input of a create from ticked orders: 1 to 200, no order and no key twice (06 rule 8). */
export const copyInput = z
  .object(COPY_SHAPE)
  .refine((input) => new Set(input.orders.map((order) => order.id)).size === input.orders.length, {
    path: ["orders"],
    message: "An order is ticked twice.",
  })
  .refine(
    (input) => new Set(input.orders.map((order) => order.clientKey)).size === input.orders.length,
    { path: ["orders"], message: "A key is sent twice." },
  );

export type CopyContext = {
  tx: Transaction;
  input: CopyInput;
  userId: string;
  actor: Actor;
  /** The locked orders behind no wall, in the lock order (by id). */
  orders: readonly LockedOrder[];
};

export type CopyActionDefinition<Item, Prepared> = {
  /** For the log only. */
  name: string;
  /** The permission the user needs on each ticked order's branch. */
  permission: Permission;
  /** The first answer of a key, with its maker and the branch it was made in; null when new. */
  find(tx: Transaction, clientKey: string): Promise<FirstResult<Item> | null>;
  /**
   * Runs once, after the walls: reads what the creates need, takes the advisory locks they take
   * in one sorted order, and names the orders the action refuses besides the walls and versions.
   */
  prepare(context: CopyContext): Promise<{ failures: readonly OrderFailure[]; data: Prepared }>;
  /** The create of one ticked order. A thrown ActionError names that order (`not_ready`). */
  write(
    context: CopyContext,
    data: Prepared,
    order: { id: string; clientKey: string },
  ): Promise<Item>;
};

/** One ticked order and what its create made. */
export type CopyResult<Item> = { orders: { id: string; made: Item }[] };

export function defineCopyAction<Item, Prepared>(
  definition: CopyActionDefinition<Item, Prepared>,
): CopyActionDefinition<Item, Prepared> {
  return definition;
}

/**
 * The safe repeat (developer-rules.md rule 8): every key known gives back the first answers, only
 * to the user who made them and only while `permission` still allows that user in each branch the
 * answers were made in; no key known is a new call; some known and some new is `conflict`, because
 * a half repeat cannot be all or nothing.
 */
async function repeated<Item, Prepared>(
  definition: CopyActionDefinition<Item, Prepared>,
  tx: Transaction,
  userId: string,
  sent: CopyInput["orders"],
): Promise<CopyResult<Item> | null> {
  // Sorted, so two calls with shared keys wait for each other in one order.
  for (const key of sent.map((order) => order.clientKey).toSorted()) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }
  const found: (FirstResult<Item> | null)[] = [];
  for (const order of sent) found.push(await definition.find(tx, order.clientKey));
  const known = found.filter((first) => first !== null);
  if (known.length === 0) return null;
  if (known.length !== sent.length) throw new OrdersRefusal("conflict");
  if (known.some((first) => first.userId !== userId || first.branchId === null)) {
    throw new OrdersRefusal("not_found");
  }
  const { decisions } = await authorizeOrders(
    userId,
    known.map((first) => ({
      permission: definition.permission,
      target: { branchId: first.branchId!, ownerId: userId },
    })),
    tx,
  );
  if (decisions.some((decision) => decision !== "allow")) throw new OrdersRefusal("not_found");
  return { orders: sent.map((order, at) => ({ id: order.id, made: known[at]!.result })) };
}

/** Runs a create from ticked orders for a user; nothing is saved unless every order passes. */
export async function runCopyAction<Item, Prepared>(
  definition: CopyActionDefinition<Item, Prepared>,
  userId: string,
  rawInput: unknown,
): Promise<ActionResult<CopyResult<Item>>> {
  const parsed = copyInput.safeParse(rawInput);
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

      const first = await repeated(definition, tx, userId, sent);
      if (first) return first;

      const { actor, failures, visible } = await guardOrders(
        tx,
        userId,
        sent,
        locked,
        () => definition.permission,
      );
      failures.throwIfAny(sent);
      const context: CopyContext = { tx, input, userId, actor, orders: visible };
      const prepared = await definition.prepare(context);
      for (const { orderId, code } of prepared.failures) failures.add(orderId, code);
      failures.throwIfAny(sent);

      const made: { id: string; made: Item }[] = [];
      const refused = new Failures();
      for (const order of sent) {
        try {
          // A savepoint each, so a refusal from the database (a unique index) leaves the
          // transaction usable and every failing order is named (review of the plan, Must fix 3).
          const item = await tx.transaction((savepoint) =>
            definition.write({ ...context, tx: savepoint }, prepared.data, order),
          );
          made.push({ id: order.id, made: item });
        } catch (error) {
          if (!(error instanceof ActionError)) throw error;
          refused.add(order.id, "not_ready");
        }
      }
      refused.throwIfAny(sent);
      return { orders: made };
    });
    return { ok: true, data };
  } catch (error) {
    return ordersFailure(definition.name, error);
  }
}

/**
 * A create from ticked orders as a server action of a page: the signed-in user, then
 * runCopyAction(). `currentUser` is for tests, which run outside a request.
 */
export function copyServerAction<Item, Prepared>(
  definition: CopyActionDefinition<Item, Prepared>,
  currentUser: () => Promise<CurrentUser | null> = getCurrentUser,
): (input: unknown) => Promise<ActionResult<CopyResult<Item>>> {
  return async (input) => {
    const user = await currentUser();
    if (!user) return failure("signed_out");
    return runCopyAction(definition, user.id, input);
  };
}
