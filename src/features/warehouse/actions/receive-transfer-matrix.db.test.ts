import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/server/action-result";
import { runAction } from "@/server/action";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertItem } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { receive, sendTransferDocument } from "../../../../tests/helpers/stock-documents";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";
import { receiveTransfer } from "./receive-transfer";

// Receiving a transfer in the permission matrix (15-quality-and-acceptance.md, Test layers: "each
// action × each role × own branch and other branch"; 03-roles-and-permissions.md, Permission
// matrix "Issue, return, transfer stock"; 09 Movement types: "the receiving Manager confirms";
// plan of 7.2, decided item 2, Look first). The branch of each case is the transfer's receiving
// branch; it is sent from a third branch. The page's export is proved through itself with the
// session mock (.claude/rules/server-actions.md). The expected answers come from
// tests/permission-matrix-expected.ts.

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { receiveTransferAction } = await import("@/app/(app)/warehouse/documents/[id]/actions");

function signedIn(user: InsertedUser): void {
  store.user = {
    id: user.id,
    fullName: user.fullName,
    username: user.username,
    role: user.role,
    locale: "uz",
    sessionToken: "invented-token",
  };
}

beforeEach(() => {
  setClock("2031-05-03T06:00:00Z");
  store.user = null;
});

function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const code = result.error.code;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

/** An In-transit transfer of 5 from `fromBranchId` (a new branch if none) to the branch. */
async function inTransit(toBranchId: string, fromBranchId?: string) {
  const from = fromBranchId ?? (await insertBranch()).id;
  const { variantId } = await insertItem();
  const keeper = await insertUser("HEAD");
  await receive(from, variantId, "5", 1000n, keeper.id);
  const made = await sendTransferDocument({
    branchId: from,
    toBranchId,
    createdBy: keeper.id,
    lines: [{ variantId, qty: "5" }],
  });
  return {
    documentId: made.documentId,
    receivedByName: null,
    lines: [{ lineId: made.lineIds[0]!, receivedQty: "4" }],
  };
}

describePermissionMatrix("receiveTransfer", {
  permission: "stock.receive_transfer",
  async run({ user, branchId }) {
    asMatrixAnswer(await runAction(receiveTransfer, user.id, await inTransit(branchId)));
  },
});

describePermissionMatrix("receiveTransferAction", {
  permission: "stock.receive_transfer",
  async run({ user, branchId }) {
    const input = await inTransit(branchId);
    signedIn(user);
    asMatrixAnswer(await receiveTransferAction(input));
  },
});

describe("only the receiving branch receives (09 Movement types: the receiving Manager confirms; plan of 7.2)", () => {
  it("a Manager of the sending branch only is Not found; one of both branches receives", async () => {
    const sender = await insertBranch();
    const receiver = await insertBranch();
    const senderOnly = await insertUser("MANAGER", { branches: [sender.id] });
    const input = await inTransit(receiver.id, sender.id);
    expect(await runAction(receiveTransfer, senderOnly.id, input)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    const both = await insertUser("MANAGER", { branches: [sender.id, receiver.id] });
    expect(await runAction(receiveTransfer, both.id, input)).toMatchObject({ ok: true });
  });
});
