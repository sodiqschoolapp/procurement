import { randomUUID } from "node:crypto";

import type { Permission } from "@/domain/permissions";
import type { RequestStatus } from "@/domain/request-status";
import type { ActionResult } from "@/server/action-result";
import { AuthorizationError } from "@/server/authorize";
import { runOrdersAction } from "@/server/order-action";

import { insertOrder } from "../../../../tests/helpers/orders";
import { describeOwnerMoveMatrix } from "../../../../tests/helpers/owner-move-matrix";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { cancelOrders } from "./cancel";
import { rejectOrders } from "./reject";
import { sendBackOrders } from "./send-back";
import { submitAgainOrders } from "./submit-again";
import { takeBackOrders } from "./take-back";

// Send back, Reject, Cancel, Take back and Submit again (build plan 2.11) in the permission
// matrix, each feature definition called directly (15-quality-and-acceptance.md, Test layers:
// "each action × each role × own branch and other branch"; 03-roles-and-permissions.md,
// Permission matrix "Approve, send back or reject at step 1 / 2 / 3" and "Add, edit, submit,
// cancel orders"; Manager rights: CREATE_REQUESTS; permission review of 1.10). The approver's
// moves are proved at each step, as Approve's (plan of 2.10, decided item 1). The expected answers
// come from tests/permission-matrix-expected.ts; the owner's moves by hand
// (tests/helpers/owner-move-matrix.ts).

const REASON = "Invented reason for the test";

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

for (const [name, definition] of [
  ["sendBackOrders", sendBackOrders],
  ["rejectOrders", rejectOrders],
] as const) {
  for (const [status, permission] of STEPS) {
    describePermissionMatrix(`${name} at ${status}`, {
      permission,
      async run({ user, branchId }) {
        const owner = await insertUser("MANAGER", { branches: [branchId] });
        const order = await insertOrder({ branchId, ownerId: owner.id, status });
        asMatrixAnswer(
          await runOrdersAction(definition, user.id, {
            clientKey: randomUUID(),
            orders: [{ id: order.id, version: order.version }],
            reason: REASON,
          }),
        );
      },
    });
  }
}

// Cancel: "Owner or Head" (06 Allowed moves), the request.edit row: the Head on any order, a
// Manager on his own; from each Waiting step and from Sent back.
for (const status of [
  "PENDING_HEAD",
  "PENDING_PRINCIPAL",
  "PENDING_FINANCE",
  "RETURNED",
] as const satisfies readonly RequestStatus[]) {
  describePermissionMatrix(`cancelOrders at ${status}`, {
    permission: "request.edit",
    async run({ user, branchId, ownerId }) {
      const order = await insertOrder({ branchId, ownerId, status });
      asMatrixAnswer(
        await runOrdersAction(cancelOrders, user.id, {
          clientKey: randomUUID(),
          orders: [{ id: order.id, version: order.version }],
          reason: REASON,
        }),
      );
    },
  });
}

describeOwnerMoveMatrix("takeBackOrders", "PENDING_HEAD", (user, orders) =>
  runOrdersAction(takeBackOrders, user.id, { clientKey: randomUUID(), orders }),
);

describeOwnerMoveMatrix("submitAgainOrders", "RETURNED", (user, orders) =>
  runOrdersAction(submitAgainOrders, user.id, { clientKey: randomUUID(), orders }),
);
