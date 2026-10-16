import { randomUUID } from "node:crypto";

import type { Permission } from "@/domain/permissions";
import type { RequestStatus } from "@/domain/request-status";
import type { ActionResult } from "@/server/action-result";
import { AuthorizationError } from "@/server/authorize";
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

// Who approved a refused order: "See orders", the branch and the draft wall inside the SQL. An
// empty answer is the query's "not found".
describePermissionMatrix("newestMoves", {
  permission: "data.view",
  async run({ user, branchId }) {
    const owner = await insertUser("MANAGER", { branches: [branchId] });
    const order = await insertOrder({ branchId, ownerId: owner.id, status: "PENDING_HEAD" });
    const head = await insertUser("HEAD");
    asMatrixAnswer(
      await runOrdersAction(approveOrders, head.id, {
        clientKey: randomUUID(),
        orders: [{ id: order.id, version: order.version }],
      }),
    );
    if (!(await newestMoves(user.id, [order.id])).has(order.id)) {
      throw new AuthorizationError("not_found");
    }
  },
});
