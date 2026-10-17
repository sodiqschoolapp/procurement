import { inArray, sql } from "drizzle-orm";
import * as z from "zod";

import { ORDER_ACTION_MAX, type OrderEventType, behindDraftWall } from "@/domain/order-moves";
import type { Actor, Permission } from "@/domain/permissions";
import type { RequestStatus } from "@/domain/request-status";
import { type CurrentUser, getCurrentUser } from "@/server/auth/session";
import { AuthorizationError, authorizeOrders } from "@/server/authorize";
import { now } from "@/server/clock";
import type { db as Database } from "@/server/db/client";
import { orderActions, orderEvents, orders } from "@/server/db/schema";

import { ActionError, describeForLog } from "./action";
import { fieldErrors } from "./action-input";
import {
  type ActionFailure,
  type ActionResult,
  ORDER_REFUSAL_CODES,
  type OrderFailure,
  type OrderRefusalCode,
  type ServerErrorCode,
  failure,
} from "./action-result";

// The action wrapper for one action on many ticked orders (developer-rules.md rules 3, 8 and 9;
// 06-approval-workflow.md rules 7 and 8; plan of 2.4). The single-record wrapper of action.ts
// stays for everything else; this one keeps its rules and adds the many orders. One transaction,
// in this fixed order (plan of 2.4, decision 9, Look first):
//
//   input     the Zod check, before the transaction: 1 to 200 orders, no id twice
//   lock      SELECT … FOR UPDATE of every order, ORDER BY id: one fixed order, no deadlock
//   repeat    the client_key seen before: the first result, after its own authorizeOrders()
//   authorize authorizeOrders(): branch and owner read under the lock, the draft wall
//   version   each order's sent version against the locked one
//   check     the status check (a move: the state machine)
//   inspect   optional: what the check needs from other tables, read under the same lock (plan
//             of 3.5, decided item 15, Look first); its failures join the check's
//   action    the order_actions row, before the write, so a row the write adds can name it
//             (money_actions.order_action_id; plan of 4.2, decided item 8)
//   write     the change; the wrapper raises every version and sets updated_at
//   history   one order_events row per order
//   notify    the notifications
//
// Every failing order is collected and named with its first code in the order of
// ORDER_REFUSAL_CODES (decision 1, Look first; review of the plan, correction 2); any failure
// saves nothing.

export type Transaction = Parameters<Parameters<typeof Database.transaction>[0]>[0];

/** The input every action on ticked orders carries: its browser-made id and the orders it saw. */
const ORDERS_SHAPE = {
  clientKey: z.uuid(),
  orders: z
    .array(z.object({ id: z.uuid(), version: z.int().min(1) }))
    .min(1)
    .max(ORDER_ACTION_MAX),
};

/**
 * The input schema of an action on ticked orders: the client key, 1 to 200 orders with the
 * version each was seen at, no order twice (06 rule 8), and the action's own fields.
 */
export function ordersInput<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.object({ ...ORDERS_SHAPE, ...shape }).refine(
    (input) => {
      const ticked = (input as OrdersInput).orders;
      return new Set(ticked.map((order) => order.id)).size === ticked.length;
    },
    { path: ["orders"], message: "An order is ticked twice." },
  );
}

export type OrdersInput = { clientKey: string; orders: { id: string; version: number }[] };

/** One order as the lock read it: every fact the state machine needs, from the database. */
export type LockedOrder = {
  id: string;
  branchId: string;
  ownerId: string;
  status: RequestStatus;
  version: number;
  revision: number;
  progress: "OPEN" | "DONE" | "DONE_SHORT" | "NOT_BOUGHT";
  /**
   * The creator's role is HEAD (plan of 2.4, decision 8, Look first), and the order was never
   * submitted: only a first Submit skips the Head step (03 rule 6). A taken-back order has its
   * number and goes to the Head like any re-submitted one (06 rule 4; permission review of 2.11,
   * Must fix 1, Look first).
   */
  createdByHead: boolean;
  /** The owner is the Head, or a Manager whose CLOSE_ALONE is not switched off. */
  ownerClosesAlone: boolean;
};

/** What the history step writes for one order besides its statuses. */
export type OrderEventExtra = { note?: string | null; payload?: Record<string, unknown> | null };

/** The one result shape of every action on ticked orders, the first call and a repeat alike. */
export type OrdersResult = {
  actionId: string;
  orders: { id: string; status: RequestStatus }[];
};

export type OrdersContext<Input> = {
  tx: Transaction;
  input: Input;
  userId: string;
  actor: Actor;
  /** The locked orders, in the lock order (by id). */
  orders: readonly LockedOrder[];
};

/** The context of the write: also this action's `order_actions` row, written just before it. */
export type OrdersWriteContext<Input> = OrdersContext<Input> & { actionId: string };

export type OrdersActionDefinition<Input extends OrdersInput> = {
  /** For the log only. */
  name: string;
  /** The `order_actions.type` and `order_events.type` it writes. */
  type: OrderEventType;
  input: z.ZodType<Input>;
  /** The permission one order needs now; a move takes its row's (src/server/order-moves.ts). */
  permission(order: LockedOrder): Permission;
  /**
   * The permission a repeat is checked with, per order of the stored action: that of the move as
   * it was made, from the event's `from_status`, so a repeat does not depend on where the order
   * stands now (review of the plan of 2.4, Must fix 1).
   */
  repeatPermission(fromStatus: RequestStatus): Permission;
  /** The action's reason as stored, trimmed; `null` when the action has none. */
  reason(input: Input): string | null;
  /**
   * The status check: the orders that fail and why. A refusal of the whole action (a short
   * reason) throws ActionError.
   */
  check(context: OrdersContext<Input>): readonly OrderFailure[];
  /**
   * A check that reads rows besides the locked orders (the purchase records of 3.5), inside the
   * transaction after the lock and the status check, on the orders behind no wall. Its failures
   * are named with the check's in one answer (06 rule 8).
   */
  inspect?(context: OrdersContext<Input>): Promise<readonly OrderFailure[]>;
  /** The change. Returns what each order's event adds (a note, a payload). */
  write(context: OrdersWriteContext<Input>): Promise<ReadonlyMap<string, OrderEventExtra> | void>;
  notify?(context: OrdersContext<Input>, result: OrdersResult): Promise<void>;
};

/** Declares an action on ticked orders. */
export function defineOrdersAction<Input extends OrdersInput>(
  definition: OrdersActionDefinition<Input>,
): OrdersActionDefinition<Input> {
  return definition;
}

/**
 * Thrown inside the transaction to roll it back with a refusal. Exported with the lock, guard and
 * failure helpers below for the many-drafts edit of ./drafts-action.ts (plan of 2.5a, decided item
 * 10, Look first; review of the plan: reused, not copied).
 */
export class OrdersRefusal extends Error {
  constructor(
    readonly code: ServerErrorCode,
    readonly orders?: readonly OrderFailure[],
  ) {
    super(code);
  }
}

const RANK = new Map<OrderRefusalCode, number>(ORDER_REFUSAL_CODES.map((code, at) => [code, at]));

function firstCode(codes: Iterable<OrderRefusalCode>): OrderRefusalCode | undefined {
  let first: OrderRefusalCode | undefined;
  for (const code of codes) if (!first || RANK.get(code)! < RANK.get(first)!) first = code;
  return first;
}

/** Collects the codes of each failing order; refuses with every order's first code. */
export class Failures {
  private readonly byOrder = new Map<string, Set<OrderRefusalCode>>();

  add(orderId: string, code: OrderRefusalCode): void {
    const codes = this.byOrder.get(orderId) ?? new Set<OrderRefusalCode>();
    codes.add(code);
    this.byOrder.set(orderId, codes);
  }

  has(orderId: string, code?: OrderRefusalCode): boolean {
    const codes = this.byOrder.get(orderId);
    return code ? codes?.has(code) === true : codes !== undefined;
  }

  /** Throws the refusal when any order failed; the orders in the order they were sent. */
  throwIfAny(sent: readonly { id: string }[]): void {
    if (this.byOrder.size === 0) return;
    const named: OrderFailure[] = [];
    for (const { id } of sent) {
      const code = firstCode(this.byOrder.get(id) ?? []);
      if (code) named.push({ orderId: id, code });
    }
    throw new OrdersRefusal(firstCode(named.map((order) => order.code))!, named);
  }
}

/** The lock: every order and the facts about its owner and creator, by id, FOR UPDATE. */
export async function lockOrders(tx: Transaction, ids: readonly string[]): Promise<LockedOrder[]> {
  const found = await tx.execute<{
    id: string;
    branch_id: string;
    owner_id: string;
    status: RequestStatus;
    version: number;
    revision: number;
    progress: LockedOrder["progress"];
    created_by_head: boolean;
    owner_closes_alone: boolean;
  }>(sql`
    select o.id, o.branch_id, o.owner_id, o.status, o.version, o.revision, o.progress,
           (c.role = 'HEAD' and o.number is null) as created_by_head,
           (w.role = 'HEAD' or (w.role = 'MANAGER' and not exists (
             select 1 from manager_rights mr
             where mr.user_id = w.id and mr."right" = 'CLOSE_ALONE' and not mr.enabled
           ))) as owner_closes_alone
    from orders o
    join users w on w.id = o.owner_id
    join users c on c.id = o.created_by
    where o.id in (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )})
    order by o.id
    for update of o`);
  return found.rows.map((row) => ({
    id: row.id,
    branchId: row.branch_id,
    ownerId: row.owner_id,
    status: row.status,
    version: row.version,
    revision: row.revision,
    progress: row.progress,
    createdByHead: row.created_by_head,
    ownerClosesAlone: row.owner_closes_alone,
  }));
}

/**
 * The safe repeat (developer-rules.md rule 8; decisions 0.8 nos. 3 and 4): the first result goes
 * back only to who made it, and only while every order of the stored action still passes the
 * permission of the move as it was made; nothing else runs. `null` when the key is new.
 */
async function repeated<Input extends OrdersInput>(
  definition: OrdersActionDefinition<Input>,
  tx: Transaction,
  userId: string,
  clientKey: string,
): Promise<OrdersResult | null> {
  // Two calls with one key wait for each other here; the second finds the first's row.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${clientKey}, 0))`);
  const stored = await tx.execute<{ id: string; actor_id: string; type: OrderEventType }>(
    sql`select id, actor_id, type from order_actions where client_key = ${clientKey}`,
  );
  const action = stored.rows[0];
  if (!action) return null;
  // A key of another user, or of another action of the same user: the first result is not this
  // action's, and its permission would be judged by the wrong move (permission review of 2.4).
  if (action.actor_id !== userId || action.type !== definition.type) {
    throw new OrdersRefusal("not_found");
  }

  const events = await tx.execute<{
    order_id: string;
    from_status: RequestStatus;
    to_status: RequestStatus;
    branch_id: string;
    owner_id: string;
    status: RequestStatus;
  }>(sql`
    select e.order_id, e.from_status, e.to_status, o.branch_id, o.owner_id, o.status
    from order_events e join orders o on o.id = e.order_id
    where e.action_id = ${action.id}
    order by e.order_id`);
  const { actor, decisions } = await authorizeOrders(
    userId,
    events.rows.map((event) => ({
      permission: definition.repeatPermission(event.from_status),
      target: { branchId: event.branch_id, ownerId: event.owner_id },
    })),
    tx,
  );
  const failures = new Failures();
  events.rows.forEach((event, at) => {
    const decision = decisions[at];
    if (decision === "not_found" || behindDraftWall(actor, { ...event, ownerId: event.owner_id })) {
      failures.add(event.order_id, "not_found");
    } else if (decision === "forbidden") {
      failures.add(event.order_id, "forbidden");
    }
  });
  failures.throwIfAny(events.rows.map((event) => ({ id: event.order_id })));
  return {
    actionId: action.id,
    orders: events.rows.map((event) => ({ id: event.order_id, status: event.to_status })),
  };
}

/**
 * The ids a repeat sends pass the branch wall and the draft wall, as on a first call: a known key
 * sent with an order id the user may not see is "Not found", never the first answer under that id
 * (.claude/rules/server-actions.md; permission review of 2.15, Should fix 2). Only seeing is
 * asked: a repeat answers what the first call did, whatever the orders' status is now.
 */
async function wallSent(
  tx: Transaction,
  userId: string,
  sent: readonly { id: string }[],
  locked: readonly LockedOrder[],
): Promise<void> {
  const failures = new Failures();
  const found = new Set(locked.map((order) => order.id));
  for (const { id } of sent) if (!found.has(id)) failures.add(id, "not_found");
  const { actor, decisions } = await authorizeOrders(
    userId,
    locked.map((order) => ({
      permission: "data.view",
      target: { branchId: order.branchId, ownerId: order.ownerId },
    })),
    tx,
  );
  locked.forEach((order, at) => {
    if (decisions[at] !== "allow" || behindDraftWall(actor, order)) {
      failures.add(order.id, "not_found");
    }
  });
  failures.throwIfAny(sent);
}

/**
 * Runs an action on ticked orders for a user: the Zod check, then every step in one transaction.
 * Returns the one result shape, or a refusal that names every failing order; nothing is saved
 * unless every step succeeded for every order (06 rule 8).
 */
export async function runOrdersAction<Input extends OrdersInput>(
  definition: OrdersActionDefinition<Input>,
  userId: string,
  rawInput: unknown,
): Promise<ActionResult<OrdersResult>> {
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

      const first = await repeated(definition, tx, userId, input.clientKey);
      if (first) {
        await wallSent(tx, userId, sent, locked);
        return first;
      }

      const { actor, failures, visible } = await guardOrders(
        tx,
        userId,
        sent,
        locked,
        definition.permission,
      );
      const checking: OrdersContext<Input> = { tx, input, userId, actor, orders: visible };
      if (visible.length > 0) {
        for (const { orderId, code } of definition.check(checking)) failures.add(orderId, code);
        for (const { orderId, code } of (await definition.inspect?.(checking)) ?? []) {
          failures.add(orderId, code);
        }
      }
      failures.throwIfAny(sent);

      const at = now();
      const [action] = await tx
        .insert(orderActions)
        .values({
          clientKey: input.clientKey,
          type: definition.type,
          actorId: userId,
          reason: definition.reason(input),
          orderCount: locked.length,
          createdAt: at,
        })
        .returning({ id: orderActions.id });
      const context: OrdersWriteContext<Input> = { ...checking, actionId: action!.id };
      const extras = (await definition.write(context)) ?? new Map<string, OrderEventExtra>();
      const raised = await raiseVersions(tx, locked, at);
      const statusOf = new Map(raised.map((row) => [row.id, row.status]));

      await tx.insert(orderEvents).values(
        locked.map((order) => ({
          orderId: order.id,
          actionId: action!.id,
          type: definition.type,
          fromStatus: order.status,
          toStatus: statusOf.get(order.id)!,
          actorId: userId,
          comment: definition.reason(input),
          note: extras.get(order.id)?.note ?? null,
          payload: extras.get(order.id)?.payload ?? null,
          createdAt: at,
        })),
      );

      const result: OrdersResult = {
        actionId: action!.id,
        orders: locked.map((order) => ({ id: order.id, status: statusOf.get(order.id)! })),
      };
      await definition.notify?.(context, result);
      return result;
    });
    return { ok: true, data };
  } catch (error) {
    return ordersFailure(definition.name, error);
  }
}

/** The answer of a thrown refusal or error of an action on ticked orders; logged by name only. */
export function ordersFailure(name: string, error: unknown): { ok: false; error: ActionFailure } {
  if (error instanceof OrdersRefusal) return failure(error.code, undefined, error.orders);
  if (error instanceof ActionError) return failure(error.code, error.fields);
  if (error instanceof AuthorizationError) return failure(error.kind);
  console.error(`Action ${name} failed: ${describeForLog(error)}`);
  return failure("unexpected");
}

/**
 * The guard of every action on ticked orders, under the lock: an order not found, behind the
 * branch wall or the draft wall is `not_found`, one the permission refuses `forbidden`, one sent
 * with an old version `stale_version` (developer-rules.md rules 4, 9; 06 rule 8). Returns the
 * actor, the failures so far and the orders behind no wall, which alone the status check sees:
 * an order of another branch tells nothing.
 */
export async function guardOrders(
  tx: Transaction,
  userId: string,
  sent: readonly { id: string; version: number }[],
  locked: readonly LockedOrder[],
  permission: (order: LockedOrder) => Permission,
): Promise<{ actor: Actor; failures: Failures; visible: LockedOrder[] }> {
  const failures = new Failures();
  const byId = new Map(locked.map((order) => [order.id, order]));
  for (const { id } of sent) if (!byId.has(id)) failures.add(id, "not_found");

  const { actor, decisions } = await authorizeOrders(
    userId,
    locked.map((order) => ({
      permission: permission(order),
      target: { branchId: order.branchId, ownerId: order.ownerId },
    })),
    tx,
  );
  locked.forEach((order, at) => {
    const decision = decisions[at];
    if (decision === "not_found" || behindDraftWall(actor, order)) {
      failures.add(order.id, "not_found");
    } else if (decision === "forbidden") {
      failures.add(order.id, "forbidden");
    }
  });

  for (const { id, version } of sent) {
    const order = byId.get(id);
    if (order && !failures.has(id, "not_found") && order.version !== version) {
      failures.add(id, "stale_version");
    }
  }

  const visible = locked.filter((order) => !failures.has(order.id, "not_found"));
  return { actor, failures, visible };
}

/** Raises the version of every locked order and sets `updated_at`, in one statement (rule 12). */
export async function raiseVersions(
  tx: Transaction,
  locked: readonly LockedOrder[],
  at: Date,
): Promise<{ id: string; status: RequestStatus; version: number }[]> {
  const raised = await tx.execute<{ id: string; status: RequestStatus; version: number }>(sql`
    update orders set version = version + 1, updated_at = ${at}
    where ${inArray(
      orders.id,
      locked.map((order) => order.id),
    )}
    returning id, status, version`);
  return raised.rows;
}

/**
 * The function a `"use server"` file exports for an action on ticked orders. `currentUser` is for
 * tests, which run outside a request.
 */
export function ordersServerAction<Input extends OrdersInput>(
  definition: OrdersActionDefinition<Input>,
  currentUser: () => Promise<CurrentUser | null> = getCurrentUser,
): (input: unknown) => Promise<ActionResult<OrdersResult>> {
  return async (input) => {
    const user = await currentUser();
    if (!user) return failure("signed_out");
    return runOrdersAction(definition, user.id, input);
  };
}
