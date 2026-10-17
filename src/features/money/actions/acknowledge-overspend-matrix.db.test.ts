import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";

import { MANAGER_RIGHTS } from "@/domain/permissions";
import type { ActionResult } from "@/server/action-result";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import { orderSettlements } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertOrder } from "../../../../tests/helpers/orders";
import {
  type MatrixCase,
  describePermissionMatrix,
} from "../../../../tests/helpers/permission-matrix";
import { insertPurchaseRow, insertTrip } from "../../../../tests/helpers/purchases";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";
import { acknowledgeOverspend } from "./acknowledge-overspend";

// The Head's Acknowledge overspend (build plan 4.7) in the permission matrix: the feature
// definition and the page export of `src/app/(app)/orders/actions.ts`, each called directly
// (15-quality-and-acceptance.md, Test layers; 03-roles-and-permissions.md, Permission matrix:
// "Acknowledge a big overspend", Head only, in every branch; .claude/rules/server-actions.md).
// The expected answers come from tests/permission-matrix-expected.ts; the Head acts on a branch
// that is not his (he has none) in both places. The order is above the guard, so an allowed call
// writes the acknowledgment and a refused one writes nothing (D38). Review of the plan,
// correction 2: a Manager holding every Manager right is still refused.

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { acknowledgeOverspendAction } = await import("@/app/(app)/orders/actions");

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
 * A settlement order of a Manager of the case's branch, planned 10 × 5 000 = 50 000 and bought
 * 10 × 20 000 = 200 000: 150 000 and 300% over, above the default guard (10% and 100 000).
 */
async function overspentInput({ branchId }: MatrixCase) {
  setClock("2031-05-10T07:00:00Z");
  const owner = await insertUser("MANAGER", { branches: [branchId] });
  const order = await insertOrder({
    branchId,
    ownerId: owner.id,
    status: "SETTLEMENT",
    progress: "DONE",
  });
  const trip = (await insertTrip(branchId, owner.id)).rows[0]!.id;
  const record = await insertPurchaseRow({
    tripId: trip,
    orderId: order.id,
    branchId,
    variantId: order.variantId,
    createdBy: owner.id,
    qty: "10",
    unitPrice: "20000",
    comment: "Invented: the shop's price today",
  });
  expect(record.rows).toHaveLength(1);
  return {
    order,
    input: {
      clientKey: randomUUID(),
      orders: [{ id: order.id, version: order.version }],
      reason: "Prices rose this week",
    },
  };
}

async function acknowledgedBy(orderId: string) {
  const [row] = await db
    .select({ by: orderSettlements.overspendAckBy })
    .from(orderSettlements)
    .where(eq(orderSettlements.orderId, orderId));
  return row?.by ?? null;
}

describePermissionMatrix("acknowledgeOverspend", {
  permission: "request.acknowledge_overspend",
  async run(each) {
    const { order, input } = await overspentInput(each);
    const result = await runOrdersAction(acknowledgeOverspend, each.user.id, input);
    expect(await acknowledgedBy(order.id)).toBe(result.ok ? each.user.id : null);
    asMatrixAnswer(result);
  },
});

describePermissionMatrix("acknowledgeOverspend (the page export)", {
  permission: "request.acknowledge_overspend",
  async run(each) {
    const { order, input } = await overspentInput(each);
    signedIn(each.user);
    const answer = await acknowledgeOverspendAction(input);
    expect(await acknowledgedBy(order.id)).toBe(answer.ok ? each.user.id : null);
    asMatrixAnswer(answer.ok ? answer : { ok: false, error: answer.error });
  },
});

it("a Manager with every Manager right switched on is refused; the Head on the same order is allowed (03 Permission matrix: no right names this row)", async () => {
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  for (const right of MANAGER_RIGHTS) await setManagerRight(manager.id, right, true);
  const each: MatrixCase = {
    user: manager,
    branchId: branch.id,
    ownBranchId: branch.id,
    ownerId: manager.id,
  };
  const { order, input } = await overspentInput(each);
  expect(await runOrdersAction(acknowledgeOverspend, manager.id, input)).toMatchObject({
    ok: false,
    error: { orders: [{ orderId: order.id, code: "forbidden" }] },
  });
  expect(await acknowledgedBy(order.id)).toBeNull();

  const head = await insertUser("HEAD");
  const allowed = await runOrdersAction(acknowledgeOverspend, head.id, {
    ...input,
    clientKey: randomUUID(),
  });
  expect(allowed).toMatchObject({ ok: true });
  expect(await acknowledgedBy(order.id)).toBe(head.id);
});
