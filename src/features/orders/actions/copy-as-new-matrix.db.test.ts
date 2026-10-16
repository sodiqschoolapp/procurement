import { randomUUID } from "node:crypto";

import type { ActionResult } from "@/server/action-result";
import { AuthorizationError } from "@/server/authorize";
import { runCopyAction } from "@/server/copy-action";

import { insertOrder } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { copyOrdersAsNew } from "./copy-as-new";

// copyOrdersAsNew of build plan 2.13 in the permission matrix, called directly (15-quality-and-
// acceptance.md, Test layers: "each action × each role × own branch and other branch"; permission
// review of 1.10): `request.create` on the ticked order's branch, the right CREATE_REQUESTS (03
// Permission matrix "Create, edit, submit, cancel a request"; plan of 2.13, decided item 1, Look
// first). The expected answers come from tests/permission-matrix-expected.ts.

/** The wrapper's answer as the matrix reads it: a refusal of the wall or the matrix is thrown. */
function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const code = result.error.orders?.[0]?.code ?? result.error.code;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

describePermissionMatrix("copyOrdersAsNew", {
  permission: "request.create",
  async run({ user, branchId, ownerId }) {
    const order = await insertOrder({ branchId, ownerId, status: "REJECTED" });
    asMatrixAnswer(
      await runCopyAction(copyOrdersAsNew, user.id, {
        orders: [{ id: order.id, version: order.version, clientKey: randomUUID() }],
      }),
    );
  },
});
