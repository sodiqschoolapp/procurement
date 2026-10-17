import { randomUUID } from "node:crypto";

import { expect, vi } from "vitest";

import type { ActionResult } from "@/server/action-result";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { runOrdersAction } from "@/server/order-action";

import { setClock } from "../../../../tests/helpers/clock";
import { insertOrder } from "../../../../tests/helpers/orders";
import {
  type MatrixCase,
  describePermissionMatrix,
} from "../../../../tests/helpers/permission-matrix";
import type { InsertedUser } from "../../../../tests/helpers/users";
import { getPurchaseForm } from "../queries/purchase-form";
import { recordPurchase } from "./record-purchase";

// Record a purchase (build plan 3.3) in the permission matrix: the feature definition, the page's
// own "use server" export and the form's query, each called directly (15-quality-and-acceptance.md,
// Test layers; 03-roles-and-permissions.md, Permission matrix "Record purchases"; Manager rights:
// RECORD_PURCHASES; .claude/rules/server-actions.md). The case generator also runs the Manager on
// a colleague's order of the own branch, and the Manager with RECORD_PURCHASES off. The expected
// answers come from tests/permission-matrix-expected.ts.

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { recordPurchaseAction } = await import("@/app/(app)/orders/[id]/purchase/actions");

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

/** An Open order of the case's branch and owner, approved by Finance yesterday. */
async function openOrder({ branchId, ownerId }: MatrixCase) {
  setClock("2031-05-10T07:00:00Z");
  return insertOrder({
    branchId,
    ownerId,
    status: "PURCHASING",
    approvedAt: new Date("2031-05-09T07:00:00Z"),
  });
}

function input(order: { id: string; version: number }) {
  return {
    clientKey: randomUUID(),
    orders: [{ id: order.id, version: order.version }],
    purchasedOn: "2031-05-10",
    paymentType: "CASH",
    supplierId: null,
    receiptFileIds: [],
    lines: [{ orderId: order.id, qty: "10", unitPrice: "5000", extras: [], comment: null }],
  };
}

describePermissionMatrix("recordPurchase", {
  permission: "purchase.record",
  async run(each) {
    const order = await openOrder(each);
    asMatrixAnswer(await runOrdersAction(recordPurchase, each.user.id, input(order)));
  },
});

describePermissionMatrix("recordPurchaseAction (the page export)", {
  permission: "purchase.record",
  async run(each) {
    const order = await openOrder(each);
    signedIn(each.user);
    asMatrixAnswer(await recordPurchaseAction(input(order)));
  },
});

describePermissionMatrix("getPurchaseForm", {
  permission: "purchase.record",
  async run(each) {
    const order = await openOrder(each);
    const form = await getPurchaseForm(each.user.id, [order.id]);
    if (!form) throw new AuthorizationError("not_found");
    expect(form.orders.map((each) => each.orderId)).toEqual([order.id]);
  },
});

// The draft wall inside the SQL (.claude/rules/tests.md: a numbered Draft is the case the matrix
// misses; permission review of 3.3, Should fix 1): a colleague's taken-back Draft is never read.
describePermissionMatrix("getPurchaseForm on a numbered Draft", {
  permission: "purchase.record",
  async run(each) {
    const order = await openOrder(each);
    const draft = await insertOrder({
      branchId: each.branchId,
      ownerId: each.ownerId,
      status: "DRAFT",
      number: `TST-26-${String(Math.floor(Math.random() * 90_000) + 10_000)}`,
    });
    expect(await getPurchaseForm(each.user.id, [draft.id])).toBeNull();
    const form = await getPurchaseForm(each.user.id, [order.id]);
    if (!form) throw new AuthorizationError("not_found");
  },
});
