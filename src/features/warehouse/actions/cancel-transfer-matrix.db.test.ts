import { describe, expect, it, vi } from "vitest";
import { beforeEach } from "vitest";

import type { ActionResult } from "@/server/action-result";
import { runAction } from "@/server/action";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertItem } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { receive, sendTransferDocument } from "../../../../tests/helpers/stock-documents";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";
import { cancelTransfer } from "./cancel-transfer";

// The cancel of a transfer in the permission matrix (15-quality-and-acceptance.md, Test layers:
// "each action × each role × own branch and other branch"; 03-roles-and-permissions.md,
// Permission matrix "Issue, return, transfer stock": Head any branch, Manager own branches with
// TRANSFER_STOCK; rule 1; plan of 7.4c, decided item 3). The matrix's branch is the sending
// branch; the receiving branch is a fresh one nobody is of. The page's export is proved through
// itself with the session mock (.claude/rules/server-actions.md). The expected answers come from
// tests/permission-matrix-expected.ts.

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { cancelTransferAction } = await import("@/app/(app)/warehouse/documents/[id]/actions");

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

const REASON = "Sinov sababi";

/** The answer as the matrix reads it: a refusal of the wall or the matrix is thrown. */
function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const code = result.error.code;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

/** A transfer In transit from the branch to a fresh one. */
async function inTransit(branchId: string): Promise<string> {
  const item = await insertItem();
  const keeper = await insertUser("HEAD");
  await receive(branchId, item.variantId, "5", 1000n, keeper.id);
  const to = await insertBranch();
  const sent = await sendTransferDocument({
    branchId,
    toBranchId: to.id,
    createdBy: keeper.id,
    lines: [{ variantId: item.variantId, qty: "1" }],
  });
  return sent.documentId;
}

describePermissionMatrix("cancelTransfer", {
  permission: "stock.transfer",
  async run({ user, branchId }) {
    const documentId = await inTransit(branchId);
    asMatrixAnswer(await runAction(cancelTransfer, user.id, { documentId, reason: REASON }));
  },
});

describePermissionMatrix("cancelTransferAction", {
  permission: "stock.transfer",
  async run({ user, branchId }) {
    const documentId = await inTransit(branchId);
    signedIn(user);
    asMatrixAnswer(await cancelTransferAction({ documentId, reason: REASON }));
  },
});

describe("cancelTransfer: a Manager of the receiving branch only, and the right off (03 Manager rights; decided item 3)", () => {
  it("a receiving Manager is Not found; a sending Manager with TRANSFER_STOCK off is forbidden; nothing moves", async () => {
    const from = await insertBranch();
    const item = await insertItem();
    const keeper = await insertUser("HEAD");
    await receive(from.id, item.variantId, "5", 1000n, keeper.id);
    const to = await insertBranch();
    const sent = await sendTransferDocument({
      branchId: from.id,
      toBranchId: to.id,
      createdBy: keeper.id,
      lines: [{ variantId: item.variantId, qty: "1" }],
    });
    const there = await insertUser("MANAGER", { branches: [to.id] });
    const rightOff = await insertUser("MANAGER", { branches: [from.id] });
    await setManagerRight(rightOff.id, "TRANSFER_STOCK", false);
    expect(
      await runAction(cancelTransfer, there.id, { documentId: sent.documentId, reason: REASON }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(
      await runAction(cancelTransfer, rightOff.id, {
        documentId: sent.documentId,
        reason: REASON,
      }),
    ).toMatchObject({ ok: false, error: { code: "forbidden" } });
    // Both refused, the transfer still waits: the Head may cancel it.
    expect(
      (await runAction(cancelTransfer, keeper.id, { documentId: sent.documentId, reason: REASON }))
        .ok,
    ).toBe(true);
  });
});
