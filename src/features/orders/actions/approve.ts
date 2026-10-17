import { and, eq, inArray, sql } from "drizzle-orm";
import * as z from "zod";

import { parseSomOrZero } from "@/domain/money";
import { type CashBlock, actionTotal, approvalCashRows } from "@/domain/money-ledger";
import { PAYMENT_TYPES, type PaymentType } from "@/domain/payment-types";
import { decide } from "@/domain/permissions";
import type { RequestStatus } from "@/domain/request-status";
import type { OrderFailure } from "@/server/action-result";
import { now, today } from "@/server/clock";
import { moneyActions, moneyRows, orders, userBranches, users } from "@/server/db/schema";
import { notify } from "@/server/notify";
import {
  type LockedOrder,
  type OrderEventExtra,
  type OrdersContext,
  type OrdersInput,
  OrdersRefusal,
  type OrdersWriteContext,
  type Transaction,
  ordersInput,
} from "@/server/order-action";
import { ActionError } from "@/server/action";
import { orderMoveAction } from "@/server/order-moves";

import { actionLink, branchNotices } from "./notices";

// Approve of ticked orders at the Head, Principal and Finance steps (06-approval-workflow.md,
// Allowed moves: the three Approve rows; rules 1, 7, 8; 03-roles-and-permissions.md rules 1, 3,
// 8; plan of 2.10). One action for the three steps (decided item 1, Look first): the state
// machine's row of each order's status names the permission the wrapper of
// src/server/order-action.ts asks for, so an order at a step the actor does not decide is
// `forbidden` and the whole action is refused. Its lock, repeat, authorize, version and status
// check run first. Then:
//
//   beforeMove  Finance's payment type per order (06 rule 1; 05 field 13), while the order is
//               still PENDING_FINANCE, the only status at which `orders_guard` of migration 0019
//               lets it change (decided item 2, Look first); the total does not change
//               and the checks of Finance's cash (4.2): only at Finance's step, `money.record` for
//               each order given cash, one branch per Manager (plan of 4.2, decided item 5)
//   afterMove   `approved_at` of the orders Finance opens, from the clock (review of the plan,
//               correction 1; decisions 2.8 item 6); the cash given now, one money action per
//               Manager naming this approval (08 When Finance approves; Money ledger 1; plan of 4.2)
//   notify      one notice per branch to the next step (10 Notifications; decided item 5); an
//               owner given cash gets CASH_GIVEN instead (plan of 4.2, decided item 4, Look first)

/**
 * The input: the ticked orders and, at Finance's step only, a payment type per order and the
 * cash given now per order, whole so'm as digits (08 When Finance approves). An order not in
 * `cash`, or at 0, is given nothing (plan of 4.2, decided item 1, Look first).
 */
export type ApproveInput = OrdersInput & {
  paymentTypes?: Record<string, PaymentType>;
  cash?: Record<string, bigint>;
};

/** Whole so'm from 0, typed as digits; never a JavaScript number (developer-rules.md rule 6). */
const cashField = z
  .string()
  .refine((value) => parseSomOrZero(value) !== null)
  .transform((value) => parseSomOrZero(value)!);

const input = ordersInput({
  paymentTypes: z.record(z.uuid(), z.enum(PAYMENT_TYPES)).optional(),
  cash: z.record(z.uuid(), cashField).optional(),
})
  .refine(
    (value) => {
      const ticked = new Set(value.orders.map((order) => order.id));
      return Object.keys(value.paymentTypes ?? {}).every((id) => ticked.has(id));
    },
    { path: ["paymentTypes"], message: "A payment type names an order that is not ticked." },
  )
  .refine(
    (value) => {
      const ticked = new Set(value.orders.map((order) => order.id));
      return Object.keys(value.cash ?? {}).every((id) => ticked.has(id));
    },
    { path: ["cash"], message: "Cash names an order that is not ticked." },
  ) as unknown as z.ZodType<ApproveInput>;

/** Who is told when an order leaves a step (10 Notifications). */
const NOTICE_OF: Partial<
  Record<
    RequestStatus,
    "REQUEST_HEAD_APPROVED" | "REQUEST_PRINCIPAL_APPROVED" | "REQUEST_FINANCE_APPROVED"
  >
> = {
  PENDING_HEAD: "REQUEST_HEAD_APPROVED",
  PENDING_PRINCIPAL: "REQUEST_PRINCIPAL_APPROVED",
  PENDING_FINANCE: "REQUEST_FINANCE_APPROVED",
};

/**
 * Finance's payment types (06 rule 1: "Finance may change an order's payment type while
 * approving"): a type on an order not at Finance's step refuses the whole action as `forbidden`,
 * before anything is written. A type equal to the order's own is no change: nothing is written
 * and nothing logged (review of the plan, correction 3). One statement for every change.
 */
async function beforeApprove(
  context: OrdersContext<ApproveInput>,
): Promise<ReadonlyMap<string, OrderEventExtra>> {
  checkCash(context);
  const asked = Object.entries(context.input.paymentTypes ?? {});
  const extras = new Map<string, OrderEventExtra>();
  if (asked.length === 0) return extras;

  const statusOf = new Map(context.orders.map((order) => [order.id, order.status]));
  const refused: OrderFailure[] = context.input.orders
    .filter(({ id }) => id in context.input.paymentTypes! && statusOf.get(id) !== "PENDING_FINANCE")
    .map(({ id }) => ({ orderId: id, code: "forbidden" }));
  if (refused.length > 0) throw new OrdersRefusal("forbidden", refused);

  const current = await paymentTypesOf(
    context.tx,
    asked.map(([id]) => id),
  );
  const changed = asked.filter(([id, type]) => current.get(id) !== type);
  if (changed.length === 0) return extras;
  await context.tx.execute(sql`
    update orders o set payment_type = v.type::payment_type
    from (values ${sql.join(
      changed.map(([id, type]) => sql`(${id}::uuid, ${type}::text)`),
      sql`, `,
    )}) as v(id, type)
    where o.id = v.id`);
  for (const [id, type] of changed) {
    extras.set(id, { payload: { paymentType: { from: current.get(id)!, to: type } } });
  }
  return extras;
}

/**
 * The checks of Finance's cash, before anything is written. Cash on an order not at Finance's
 * step refuses the whole action as `forbidden`, as a payment type does; every order given cash
 * also needs `money.record` of its branch (03 matrix, "Record money given, returned, paid back";
 * review of the plan of 4.2, correction 2); and one Manager's cash never spans two branches, since
 * one action per Manager is all the browser id allows (plan of 4.2, decided item 5, Look first).
 */
function checkCash(context: OrdersContext<ApproveInput>): void {
  const given = cashBlocks(context);
  if (given.length === 0) return;
  const orderOf = new Map(context.orders.map((order) => [order.id, order]));
  const refused: OrderFailure[] = [];
  for (const block of given) {
    for (const { orderId } of block.rows) {
      const order = orderOf.get(orderId)!;
      const target = { branchId: order.branchId, ownerId: order.ownerId };
      // money.record and request.approve.step3 are both Finance of the branch today (03 matrix),
      // so the status half refuses every other role first; the permission review of 4.2 notes that
      // this check is reached on its own only if the two rows ever differ.
      if (
        order.status !== "PENDING_FINANCE" ||
        decide("money.record", context.actor, target) !== "allow"
      ) {
        refused.push({ orderId, code: "forbidden" });
      }
    }
  }
  if (refused.length > 0) throw new OrdersRefusal("forbidden", refused);
  for (const block of given) {
    const branches = new Set(block.rows.map(({ orderId }) => orderOf.get(orderId)!.branchId));
    if (branches.size > 1) {
      throw new ActionError("invalid_input", { cash: "errors.field.cashOneBranch" });
    }
  }
}

/**
 * The cash given now, one block per Manager (the owner as locked, never from the input), rows of
 * 0 dropped (08 When Finance approves: "rows of 0 write nothing"), in the lock order.
 */
function cashBlocks(context: OrdersContext<ApproveInput>): CashBlock[] {
  const cash = context.input.cash ?? {};
  return approvalCashRows(
    context.orders
      .filter((order) => order.id in cash)
      .map((order) => ({ id: order.id, ownerId: order.ownerId, amount: cash[order.id]! })),
  );
}

/**
 * 08 When Finance approves: "The cash action is saved in the same transaction as the approval."
 * One money action per Manager (08 Money ledger 1), all with the approval's browser id and their
 * own `manager_id` (14: UNIQUE (client_key, manager_id)), naming the approval; dated today in
 * Tashkent, no comment (decisions 4.1 item 9; plan of 4.2, decided item 3, Look first). The orders
 * are locked; `money_rows_one_manager` reads their owners.
 */
async function giveCash(context: OrdersWriteContext<ApproveInput>): Promise<void> {
  const at = now();
  for (const block of cashBlocks(context)) {
    const [action] = await context.tx
      .insert(moneyActions)
      .values({
        clientKey: context.input.clientKey,
        orderActionId: context.actionId,
        managerId: block.managerId,
        occurredOn: today(),
        createdBy: context.userId,
        createdAt: at,
      })
      .returning({ id: moneyActions.id });
    await context.tx.insert(moneyRows).values(
      block.rows.map((row) => ({
        moneyActionId: action!.id,
        orderId: row.orderId,
        kind: "CASH_GIVEN" as const,
        amount: row.amount,
        createdAt: at,
      })),
    );
  }
}

async function paymentTypesOf(
  tx: Transaction,
  ids: readonly string[],
): Promise<Map<string, PaymentType>> {
  const rows = await tx
    .select({ id: orders.id, paymentType: orders.paymentType })
    .from(orders)
    .where(inArray(orders.id, [...ids]));
  return new Map(rows.map((row) => [row.id, row.paymentType]));
}

/** The users told when orders of one branch leave a step (10 Notifications; decided item 5). */
async function recipientsOf(
  tx: Transaction,
  from: RequestStatus,
  branchId: string,
  ownerIds: readonly string[],
): Promise<string[]> {
  if (from === "PENDING_HEAD" || from === "PENDING_PRINCIPAL") {
    // Head approved → the Principal of the branch; Principal approved → its Finance users.
    const rows = await tx
      .select({ id: userBranches.userId })
      .from(userBranches)
      .where(
        and(
          eq(userBranches.branchId, branchId),
          eq(userBranches.userRole, from === "PENDING_HEAD" ? "PRINCIPAL" : "FINANCE"),
          eq(userBranches.userIsActive, true),
        ),
      );
    return rows.map((row) => row.id);
  }
  // Finance approved → the owners of the orders and every Head; one row each (notify() drops a
  // name given twice, an inactive user and the actor).
  const heads = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "HEAD"), eq(users.isActive, true)));
  return [...new Set([...ownerIds, ...heads.map((head) => head.id)])];
}

/** The cash each owner was given in one branch by this approval (`actionTotal()` of his rows). */
function cashByOwner(context: OrdersContext<ApproveInput>, branchId: string): Map<string, bigint> {
  const branchOf = new Map<string, LockedOrder>(context.orders.map((order) => [order.id, order]));
  const byOwner = new Map<string, bigint>();
  for (const block of cashBlocks(context)) {
    const rows = block.rows.filter(({ orderId }) => branchOf.get(orderId)!.branchId === branchId);
    if (rows.length > 0) byOwner.set(block.managerId, actionTotal(rows));
  }
  return byOwner;
}

export const approveOrders = orderMoveAction<ApproveInput>({
  name: "approveOrders",
  action: "APPROVE",
  input,
  beforeMove: beforeApprove,
  async afterMove(context, moves) {
    const opened = moves.filter((move) => move.to === "PURCHASING").map((move) => move.orderId);
    if (opened.length > 0) {
      await context.tx.update(orders).set({ approvedAt: now() }).where(inArray(orders.id, opened));
    }
    await giveCash(context);
  },
  async notify(context, result) {
    const { tx, userId } = context;
    const at = now();
    // Every order of one action stands at one step: each role approves one step only (03 matrix).
    // Grouped by step all the same, so a notice never names the wrong one.
    const byStep = new Map<RequestStatus, (typeof context.orders)[number][]>();
    for (const order of context.orders) {
      byStep.set(order.status, [...(byStep.get(order.status) ?? []), order]);
    }
    for (const [from, moved] of byStep) {
      const type = NOTICE_OF[from];
      if (!type) continue;
      for (const { branchId, params } of await branchNotices(tx, userId, moved)) {
        const owners = moved
          .filter((order) => order.branchId === branchId)
          .map((order) => order.ownerId);
        const link = actionLink(branchId, result.actionId);
        const cashOf = from === "PENDING_FINANCE" ? cashByOwner(context, branchId) : new Map();
        await notify(
          { tx, userId },
          {
            to: (await recipientsOf(tx, from, branchId, owners)).filter((id) => !cashOf.has(id)),
            type,
            params,
            branchId,
            link,
            at,
          },
        );
        for (const [ownerId, amount] of cashOf) {
          await notify(
            { tx, userId },
            {
              to: [ownerId],
              type: "CASH_GIVEN",
              params: { ...params, amount: amount.toString() },
              branchId,
              link,
              at,
            },
          );
        }
      }
    }
  },
});
