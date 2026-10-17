import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { expect } from "vitest";

import type { Permission } from "@/domain/permissions";
import type { RequestStatus } from "@/domain/request-status";
import type { ActionResult } from "@/server/action-result";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import { moneyActions } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { insertOrder } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { newestMoves } from "../queries/newest-moves";
import { approveOrders } from "./approve";

// Approve (build plan 2.10) in the permission matrix, the feature definition and the new query
// called directly (15-quality-and-acceptance.md, Test layers: "each action × each role × own
// branch and other branch"; 03-roles-and-permissions.md, Permission matrix "Approve, send back or
// reject at step 1 / 2 / 3" and "See orders, stock and reports"; permission review of 1.10). One
// action for the three steps (plan of 2.10, decided item 1, Look first): each step is proved with
// an order at its status. The expected answers come from tests/permission-matrix-expected.ts.

/** The answer as the matrix reads it: a refusal of the wall or the matrix is thrown. */
function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const code = result.error.orders?.[0]?.code ?? result.error.code;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

const STEPS: readonly [RequestStatus, Permission][] = [
  ["PENDING_HEAD", "request.approve_step1"],
  ["PENDING_PRINCIPAL", "request.approve_step2"],
  ["PENDING_FINANCE", "request.approve_step3"],
];

for (const [status, permission] of STEPS) {
  describePermissionMatrix(`approveOrders at ${status}`, {
    permission,
    async run({ user, branchId }) {
      const owner = await insertUser("MANAGER", { branches: [branchId] });
      const order = await insertOrder({ branchId, ownerId: owner.id, status });
      asMatrixAnswer(
        await runOrdersAction(approveOrders, user.id, {
          clientKey: randomUUID(),
          orders: [{ id: order.id, version: order.version }],
        }),
      );
    },
  });
}

// Finance's cash with the approval (build plan 4.2; review of the plan, correction 2): giving cash
// is "Record money given, returned, paid back" (money.record), proved with an order at Finance's
// step and an amount above 0. An allowed call writes the cash (D38).
describePermissionMatrix("approveOrders with cash at PENDING_FINANCE", {
  permission: "money.record",
  async run({ user, branchId }) {
    const owner = await insertUser("MANAGER", { branches: [branchId] });
    const order = await insertOrder({ branchId, ownerId: owner.id, status: "PENDING_FINANCE" });
    const clientKey = randomUUID();
    const result = await runOrdersAction(approveOrders, user.id, {
      clientKey,
      orders: [{ id: order.id, version: order.version }],
      cash: { [order.id]: "50000" },
    });
    asMatrixAnswer(result);
    const given = await db
      .select({ id: moneyActions.id })
      .from(moneyActions)
      .where(eq(moneyActions.clientKey, clientKey));
    expect(given).toHaveLength(1);
  },
});

// Who approved a refused order: "See orders", the branch and the draft wall inside the SQL. An
// empty answer is the query's "not found".
describePermissionMatrix("newestMoves", {
  permission: "data.view",
  async run({ user, branchId }) {
    const owner = await insertUser("MANAGER", { branches: [branchId] });
    const order = await insertOrder({ branchId, ownerId: owner.id, status: "PENDING_HEAD" });
    const head = await insertUser("HEAD");
    // The fixture must succeed, or a refusal here would read as the expected "not found" (D38).
    expect(
      await runOrdersAction(approveOrders, head.id, {
        clientKey: randomUUID(),
        orders: [{ id: order.id, version: order.version }],
      }),
    ).toMatchObject({ ok: true });
    if (!(await newestMoves(user.id, [order.id])).has(order.id)) {
      throw new AuthorizationError("not_found");
    }
  },
});
