import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { expect, vi } from "vitest";

import type { ActionResult } from "@/server/action-result";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import { moneyActions, orderSettlements, orders } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { sendBackForCorrectionOrders } from "@/features/orders/actions/send-back-for-correction";

import { setClock } from "../../../tests/helpers/clock";
import { insertMoneyAction, insertMoneyRow } from "../../../tests/helpers/money";
import { insertOrder } from "../../../tests/helpers/orders";
import {
  type MatrixCase,
  describePermissionMatrix,
} from "../../../tests/helpers/permission-matrix";
import { insertPurchaseRow, insertTrip } from "../../../tests/helpers/purchases";
import { type InsertedUser, insertUser } from "../../../tests/helpers/users";
import { confirmSettlement } from "./actions/confirm-settlement";
import { settleCash } from "./actions/settle-cash";
import { getSettlement } from "./queries/settlement";

// The settlement screen (build plan 4.5) in the permission matrix: each feature definition, each
// page export of `src/app/(app)/orders/actions.ts` and the screen's query, called directly
// (15-quality-and-acceptance.md, Test layers; 03-roles-and-permissions.md, Permission matrix:
// "Settle and close an order with differences", Finance of its own branches; 06 Allowed moves,
// "Waiting for settlement | Send back for correction | Finance"; .claude/rules/server-actions.md).
// The expected answers come from tests/permission-matrix-expected.ts. An allowed call writes, a
// refused one writes nothing (D38).

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { confirmSettlementAction, sendBackForCorrectionOrdersAction, settleCashAction } =
  await import("@/app/(app)/orders/actions");

function signedIn(user: InsertedUser): void {
  store.user = {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    role: user.role,
    locale: "uz",
  } as CurrentUser;
}

/** The answer as the matrix reads it: a refusal of the wall or the matrix is thrown. */
function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const code = result.error.orders?.[0]?.code ?? result.error.code;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

/**
 * A settlement order of a Manager of the case's branch: given 50 000 in cash, bought 10 × 5 000
 * on a Card trip, so it holds 50 000 and has a Card block.
 */
async function settlementOrder({ branchId }: MatrixCase) {
  setClock("2031-05-10T07:00:00Z");
  const owner = await insertUser("MANAGER", { branches: [branchId] });
  const finance = await insertUser("FINANCE", { branches: [branchId] });
  const order = await insertOrder({
    branchId,
    ownerId: owner.id,
    status: "SETTLEMENT",
    progress: "DONE",
  });
  const action = (await insertMoneyAction({ managerId: owner.id, createdBy: finance.id })).rows[0]!
    .id;
  await insertMoneyRow({ moneyActionId: action, orderId: order.id, amount: "50000" });
  const trip = (await insertTrip(branchId, owner.id, randomUUID(), "2031-05-02", "CARD")).rows[0]!
    .id;
  await insertPurchaseRow({
    tripId: trip,
    orderId: order.id,
    branchId,
    variantId: order.variantId,
    createdBy: owner.id,
    qty: "10",
  });
  return order;
}

async function settleInput(each: MatrixCase) {
  const order = await settlementOrder(each);
  return {
    clientKey: randomUUID(),
    orders: [{ id: order.id, version: order.version }],
    occurredOn: "2031-05-10",
    comment: "Invented settlement",
    rows: { [order.id]: { kind: "CASH_RETURNED", amount: "50000" } },
  };
}

async function confirmInput(each: MatrixCase) {
  const order = await settlementOrder(each);
  return {
    order,
    input: {
      clientKey: randomUUID(),
      orders: [{ id: order.id, version: order.version }],
      block: "CARD",
      confirmed: true,
    },
  };
}

async function correctionInput(each: MatrixCase) {
  const order = await settlementOrder(each);
  return {
    order,
    input: {
      clientKey: randomUUID(),
      orders: [{ id: order.id, version: order.version }],
      reason: "A record has the wrong price",
    },
  };
}

async function written(clientKey: string): Promise<number> {
  return (
    await db
      .select({ id: moneyActions.id })
      .from(moneyActions)
      .where(eq(moneyActions.clientKey, clientKey))
  ).length;
}

async function confirmed(orderId: string): Promise<boolean> {
  const [row] = await db
    .select({ at: orderSettlements.cardConfirmedAt })
    .from(orderSettlements)
    .where(eq(orderSettlements.orderId, orderId));
  return row?.at != null;
}

async function statusOf(orderId: string) {
  const [row] = await db
    .select({ status: orders.status })
    .from(orders)
    .where(eq(orders.id, orderId));
  return row!.status;
}

describePermissionMatrix("settleCash", {
  permission: "request.settle",
  async run(each) {
    const input = await settleInput(each);
    const result = await runOrdersAction(settleCash, each.user.id, input);
    expect(await written(input.clientKey)).toBe(result.ok ? 1 : 0);
    asMatrixAnswer(result);
  },
});

describePermissionMatrix("settleCash (the page export)", {
  permission: "request.settle",
  async run(each) {
    const input = await settleInput(each);
    signedIn(each.user);
    const answer = await settleCashAction(input);
    expect(await written(input.clientKey)).toBe(answer.ok ? 1 : 0);
    asMatrixAnswer(answer.ok ? answer : { ok: false, error: answer.error });
  },
});

describePermissionMatrix("confirmSettlement", {
  permission: "request.settle",
  async run(each) {
    const { order, input } = await confirmInput(each);
    const result = await runOrdersAction(confirmSettlement, each.user.id, input);
    expect(await confirmed(order.id)).toBe(result.ok);
    asMatrixAnswer(result);
  },
});

describePermissionMatrix("confirmSettlement (the page export)", {
  permission: "request.settle",
  async run(each) {
    const { order, input } = await confirmInput(each);
    signedIn(each.user);
    const answer = await confirmSettlementAction(input);
    expect(await confirmed(order.id)).toBe(answer.ok);
    asMatrixAnswer(answer.ok ? answer : { ok: false, error: answer.error });
  },
});

describePermissionMatrix("sendBackForCorrectionOrders", {
  permission: "request.settle",
  async run(each) {
    const { order, input } = await correctionInput(each);
    const result = await runOrdersAction(sendBackForCorrectionOrders, each.user.id, input);
    expect(await statusOf(order.id)).toBe(result.ok ? "PURCHASING" : "SETTLEMENT");
    asMatrixAnswer(result);
  },
});

describePermissionMatrix("sendBackForCorrectionOrders (the page export)", {
  permission: "request.settle",
  async run(each) {
    const { order, input } = await correctionInput(each);
    signedIn(each.user);
    const answer = await sendBackForCorrectionOrdersAction(input);
    expect(await statusOf(order.id)).toBe(answer.ok ? "PURCHASING" : "SETTLEMENT");
    asMatrixAnswer(answer.ok ? answer : { ok: false, error: answer.error });
  },
});

// The screen's read: `request.settle`, the branch wall inside the SQL. A dropped order is the
// query's "not found".
describePermissionMatrix("getSettlement", {
  permission: "request.settle",
  async run(each) {
    const order = await settlementOrder(each);
    if ((await getSettlement(each.user.id, [order.id])) === null) {
      throw new AuthorizationError("not_found");
    }
  },
});
