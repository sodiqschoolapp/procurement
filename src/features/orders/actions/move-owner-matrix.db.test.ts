import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { expect, vi } from "vitest";

import type { ActionResult } from "@/server/action-result";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import { orders } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { insertOrder } from "../../../../tests/helpers/orders";
import {
  type MatrixCase,
  describePermissionMatrix,
} from "../../../../tests/helpers/permission-matrix";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";
import { moveOwnerChoices } from "../queries/move-owner-choices";
import { moveOrdersToManager } from "./move-owner";

// Move orders to another Manager (build plan 4.10) in the permission matrix: the feature
// definition, the choices query and both page exports of `src/app/(app)/orders/actions.ts`, each
// called directly (15-quality-and-acceptance.md, Test layers; 03-roles-and-permissions.md,
// Permission matrix: "Move orders to another Manager", the Head only;
// .claude/rules/server-actions.md). The expected answers come from
// tests/permission-matrix-expected.ts. An allowed move leaves the order with the new owner, a
// refused one with the old (D38).

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { moveOrdersToManagerAction, moveOwnerChoicesAction } =
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

/** An Open order of a Manager of the case's branch at a count of 0, and a second Manager there. */
async function moveInput({ branchId }: MatrixCase) {
  const owner = await insertUser("MANAGER", { branches: [branchId] });
  const next = await insertUser("MANAGER", { branches: [branchId] });
  const order = await insertOrder({ branchId, ownerId: owner.id, status: "PURCHASING" });
  return {
    order,
    owner,
    next,
    input: {
      clientKey: randomUUID(),
      orders: [{ id: order.id, version: order.version }],
      managerId: next.id,
    },
  };
}

async function ownerOf(orderId: string) {
  const [row] = await db
    .select({ owner: orders.ownerId })
    .from(orders)
    .where(eq(orders.id, orderId));
  return row?.owner;
}

describePermissionMatrix("moveOrdersToManager", {
  permission: "request.move_owner",
  async run(each) {
    const { order, owner, next, input } = await moveInput(each);
    const result = await runOrdersAction(moveOrdersToManager, each.user.id, input);
    expect(await ownerOf(order.id)).toBe(result.ok ? next.id : owner.id);
    asMatrixAnswer(result);
  },
});

describePermissionMatrix("moveOrdersToManager (the page export)", {
  permission: "request.move_owner",
  async run(each) {
    const { order, owner, next, input } = await moveInput(each);
    signedIn(each.user);
    const answer = await moveOrdersToManagerAction(input);
    expect(await ownerOf(order.id)).toBe(answer.ok ? next.id : owner.id);
    asMatrixAnswer(answer.ok ? answer : { ok: false, error: answer.error });
  },
});

describePermissionMatrix("moveOwnerChoices", {
  permission: "request.move_owner",
  async run(each) {
    const { order, next } = await moveInput(each);
    const choices = await moveOwnerChoices(each.user.id, [order.id]);
    expect(choices.map((choice) => choice.id)).toContain(next.id);
  },
});

describePermissionMatrix("moveOwnerChoices (the page export)", {
  permission: "request.move_owner",
  async run(each) {
    const { order, next } = await moveInput(each);
    signedIn(each.user);
    const answer = await moveOwnerChoicesAction({ ids: [order.id] });
    asMatrixAnswer(answer);
    expect(answer.ok && answer.data.map((choice) => choice.id)).toContain(next.id);
  },
});
