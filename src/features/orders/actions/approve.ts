import { and, eq, inArray, sql } from "drizzle-orm";
import * as z from "zod";

import { PAYMENT_TYPES, type PaymentType } from "@/domain/payment-types";
import type { RequestStatus } from "@/domain/request-status";
import type { OrderFailure } from "@/server/action-result";
import { now } from "@/server/clock";
import { orders, userBranches, users } from "@/server/db/schema";
import { notify } from "@/server/notify";
import {
  type OrderEventExtra,
  type OrdersContext,
  type OrdersInput,
  OrdersRefusal,
  type Transaction,
  ordersInput,
} from "@/server/order-action";
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
//   afterMove   `approved_at` of the orders Finance opens, from the clock (review of the plan,
//               correction 1; decisions 2.8 item 6)
//   notify      one notice per branch to the next step (10 Notifications; decided item 5)

/** The input: the ticked orders and, at Finance's step only, a payment type per order. */
export type ApproveInput = OrdersInput & { paymentTypes?: Record<string, PaymentType> };

const input = ordersInput({
  paymentTypes: z.record(z.uuid(), z.enum(PAYMENT_TYPES)).optional(),
}).refine(
  (value) => {
    const ticked = new Set(value.orders.map((order) => order.id));
    return Object.keys(value.paymentTypes ?? {}).every((id) => ticked.has(id));
  },
  { path: ["paymentTypes"], message: "A payment type names an order that is not ticked." },
) as z.ZodType<ApproveInput>;

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
        await notify(
          { tx, userId },
          {
            to: await recipientsOf(tx, from, branchId, owners),
            type,
            params,
            branchId,
            link: actionLink(branchId, result.actionId),
            at,
          },
        );
      }
    }
  },
});
