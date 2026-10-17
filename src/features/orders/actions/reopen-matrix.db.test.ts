import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { expect, vi } from "vitest";

import type { ActionResult } from "@/server/action-result";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import { orders } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { REASON } from "../../../../tests/helpers/moves";
import { insertOrder } from "../../../../tests/helpers/orders";
import {
  type MatrixCase,
  describePermissionMatrix,
} from "../../../../tests/helpers/permission-matrix";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";
import { reopenOrders } from "./reopen";

// The Head's Reopen (build plan 4.8) in the permission matrix: the feature definition and the page
// export of `src/app/(app)/orders/actions.ts`, each called directly (15-quality-and-acceptance.md,
// Test layers; 03-roles-and-permissions.md, Permission matrix: "Reopen a closed order", the Head
// only; 06 Allowed moves, "Closed | Reopen | Head | Open | Reason"; .claude/rules/server-actions.md).
// The expected answers come from tests/permission-matrix-expected.ts. An allowed call leaves the
// order Open, a refused one Closed (D38).

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { reopenOrdersAction } = await import("@/app/(app)/orders/actions");

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

/** A Closed order of a Manager of the case's branch, with the reason. */
async function reopenInput({ branchId }: MatrixCase) {
  const owner = await insertUser("MANAGER", { branches: [branchId] });
  const order = await insertOrder({ branchId, ownerId: owner.id, status: "CLOSED" });
  return {
    order,
    input: {
      clientKey: randomUUID(),
      orders: [{ id: order.id, version: order.version }],
      reason: REASON,
    },
  };
}

async function statusOf(orderId: string) {
  const [row] = await db
    .select({ status: orders.status })
    .from(orders)
    .where(eq(orders.id, orderId));
  return row?.status;
}

describePermissionMatrix("reopenOrders", {
  permission: "request.reopen",
  async run(each) {
    const { order, input } = await reopenInput(each);
    const result = await runOrdersAction(reopenOrders, each.user.id, input);
    expect(await statusOf(order.id)).toBe(result.ok ? "PURCHASING" : "CLOSED");
    asMatrixAnswer(result);
  },
});

describePermissionMatrix("reopenOrders (the page export)", {
  permission: "request.reopen",
  async run(each) {
    const { order, input } = await reopenInput(each);
    signedIn(each.user);
    const answer = await reopenOrdersAction(input);
    expect(await statusOf(order.id)).toBe(answer.ok ? "PURCHASING" : "CLOSED");
    asMatrixAnswer(answer.ok ? answer : { ok: false, error: answer.error });
  },
});
