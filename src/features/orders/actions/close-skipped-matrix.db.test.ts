import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { vi } from "vitest";

import type { ActionResult } from "@/server/action-result";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import { orders } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { setClock } from "../../../../tests/helpers/clock";
import { insertOrder } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import type { InsertedUser } from "../../../../tests/helpers/users";
import { closeSkippedOrders } from "./close-skipped";

// Close of orders that skipped Finance (build plan 4.10c) in the permission matrix: the feature
// definition and the page export of `src/app/(app)/orders/actions.ts`, each called directly
// (03-roles-and-permissions.md, Permission matrix: "Close a finished order that skipped Finance |
// Yes | Yes, own orders | No | No"; Manager rights: CLOSE_ALONE, "An order that skipped Finance is
// closed by the Head"; plan of 4.10c, decided item 4, Look first). The generator runs the
// Manager on a colleague's order and with CLOSE_ALONE off, and the Head on that Manager's order,
// which the Head closes. The expected answers come from tests/permission-matrix-expected.ts. Each
// order is a finished Open order that skipped Finance, so only the permission can refuse it.

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { closeSkippedOrdersAction } = await import("@/app/(app)/orders/actions");

function signedIn(user: InsertedUser): void {
  store.user = {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    role: user.role,
    locale: "uz",
  } as CurrentUser;
}

/** A refusal of the wall or the matrix is thrown; every allowed cell must close. */
function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const code = result.error.orders?.[0]?.code ?? result.error.code;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

/** A finished Open order of the case's branch and owner that skipped Finance. */
async function skippedOrder({ branchId, ownerId }: { branchId: string; ownerId: string }) {
  setClock("2031-05-10T07:00:00Z");
  const order = await insertOrder({
    branchId,
    ownerId,
    status: "PURCHASING",
    progress: "DONE",
    approvedAt: new Date("2031-05-01T07:00:00Z"),
  });
  await db.update(orders).set({ skippedFinance: true }).where(eq(orders.id, order.id));
  return order;
}

function input(order: { id: string; version: number }) {
  return { clientKey: randomUUID(), orders: [{ id: order.id, version: order.version }] };
}

describePermissionMatrix("closeSkippedOrders", {
  permission: "request.close_skipped",
  async run(each) {
    const order = await skippedOrder(each);
    asMatrixAnswer(await runOrdersAction(closeSkippedOrders, each.user.id, input(order)));
  },
});

describePermissionMatrix("closeSkippedOrders (the page export)", {
  permission: "request.close_skipped",
  async run(each) {
    const order = await skippedOrder(each);
    signedIn(each.user);
    asMatrixAnswer(await closeSkippedOrdersAction(input(order)));
  },
});
