import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { expect, vi } from "vitest";

import type { ActionResult } from "@/server/action-result";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import { orders } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { setClock } from "../../../../tests/helpers/clock";
import { insertMoneyAction, insertMoneyRow } from "../../../../tests/helpers/money";
import { insertOrder } from "../../../../tests/helpers/orders";
import {
  type MatrixCase,
  describePermissionMatrix,
} from "../../../../tests/helpers/permission-matrix";
import { insertPurchaseRow, insertTrip } from "../../../../tests/helpers/purchases";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";
import { closeOrders } from "./close";

// Finance's Close (build plan 4.6) in the permission matrix: the feature definition and the page
// export of `src/app/(app)/orders/actions.ts`, each called directly (15-quality-and-acceptance.md,
// Test layers; 03-roles-and-permissions.md, Permission matrix: "Settle and close an order with
// differences", Finance of its own branches; 06 Allowed moves, "Waiting for settlement | Close |
// Finance"; .claude/rules/server-actions.md). The expected answers come from
// tests/permission-matrix-expected.ts. The order is ready, so an allowed call closes it and a
// refused one leaves it in settlement (D38).

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { closeOrdersAction } = await import("@/app/(app)/orders/actions");

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
 * A ready settlement order of a Manager of the case's branch: given 50 000 in cash and bought
 * 10 × 5 000 on a Cash trip, so its count is 0 and it has no other block (08 Closing 3).
 */
async function closeInput({ branchId }: MatrixCase) {
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
  const trip = (await insertTrip(branchId, owner.id)).rows[0]!.id;
  const record = await insertPurchaseRow({
    tripId: trip,
    orderId: order.id,
    branchId,
    variantId: order.variantId,
    createdBy: owner.id,
    qty: "10",
  });
  expect(record.rows).toHaveLength(1);
  return {
    order,
    input: { clientKey: randomUUID(), orders: [{ id: order.id, version: order.version }] },
  };
}

async function statusOf(orderId: string) {
  const [row] = await db
    .select({ status: orders.status })
    .from(orders)
    .where(eq(orders.id, orderId));
  return row?.status;
}

describePermissionMatrix("closeOrders", {
  permission: "request.settle",
  async run(each) {
    const { order, input } = await closeInput(each);
    const result = await runOrdersAction(closeOrders, each.user.id, input);
    expect(await statusOf(order.id)).toBe(result.ok ? "CLOSED" : "SETTLEMENT");
    asMatrixAnswer(result);
  },
});

describePermissionMatrix("closeOrders (the page export)", {
  permission: "request.settle",
  async run(each) {
    const { order, input } = await closeInput(each);
    signedIn(each.user);
    const answer = await closeOrdersAction(input);
    expect(await statusOf(order.id)).toBe(answer.ok ? "CLOSED" : "SETTLEMENT");
    asMatrixAnswer(answer.ok ? answer : { ok: false, error: answer.error });
  },
});
