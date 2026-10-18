import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/server/action-result";
import { runAction } from "@/server/action";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertDepartment, insertItem } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { postDocument, receive } from "../../../../tests/helpers/stock-documents";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";
import { getReversePreview } from "../queries/reverse-preview";
import { reverseStockDocument } from "./reverse";

// Reverse a document in the permission matrix (15-quality-and-acceptance.md, Test layers: "each
// action × each role × own branch and other branch"; 03-roles-and-permissions.md, Permission
// matrix "Issue, return, transfer stock": Head any branch, Manager own branches, Principal and
// Finance no; Manager right RETURN_REVERSE, "Take returns and reverse documents"; rule 1: another
// branch is "Not found"; plan of 5.7). The user acts on an issue they made themselves, so only the
// matrix decides (09 Issue 3: its creator). The page's two exports are proved through themselves
// with the session mock (.claude/rules/server-actions.md). The expected answers come from
// tests/permission-matrix-expected.ts.

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { reverseStockDocumentAction, reversePreviewAction } =
  await import("@/app/(app)/warehouse/items/[id]/actions");

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

/** The answer as the matrix reads it: a refusal of the wall or the matrix is thrown. */
function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const code = result.error.code;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

/** A posted issue of 2 out of 5, made by `createdBy` in the branch. */
async function issuedBy(branchId: string, createdBy: string) {
  const variantId = (await insertItem()).variantId;
  const departmentId = (await insertDepartment(branchId)).id;
  await receive(branchId, variantId, "5", 1000n, createdBy);
  return postDocument({
    type: "ISSUE",
    branchId,
    departmentId,
    createdBy,
    lines: [{ variantId, qty: "2" }],
  });
}

const REASON = "Sinov sababi";

describePermissionMatrix("reverseStockDocument", {
  permission: "stock.return_reverse",
  async run({ user, branchId }) {
    const made = await issuedBy(branchId, user.id);
    asMatrixAnswer(
      await runAction(reverseStockDocument, user.id, {
        documentId: made.documentId,
        reason: REASON,
      }),
    );
  },
});

describePermissionMatrix("reverseStockDocumentAction", {
  permission: "stock.return_reverse",
  async run({ user, branchId }) {
    const made = await issuedBy(branchId, user.id);
    signedIn(user);
    asMatrixAnswer(
      await reverseStockDocumentAction({ documentId: made.documentId, reason: REASON }),
    );
  },
});

describePermissionMatrix("getReversePreview", {
  permission: "stock.return_reverse",
  async run({ user, branchId }) {
    const made = await issuedBy(branchId, user.id);
    const preview = await getReversePreview(user.id, made.documentId);
    expect(preview.number).toBe(made.number);
  },
});

describePermissionMatrix("reversePreviewAction", {
  permission: "stock.return_reverse",
  async run({ user, branchId }) {
    const made = await issuedBy(branchId, user.id);
    signedIn(user);
    asMatrixAnswer(await reversePreviewAction({ documentId: made.documentId }));
  },
});

describe("reverse and the two Manager rights (03 Manager rights)", () => {
  it("a Manager with ISSUE_STOCK off and RETURN_REVERSE on reverses their issue", async () => {
    const own = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [own.id] });
    const made = await issuedBy(own.id, manager.id);
    await setManagerRight(manager.id, "ISSUE_STOCK", false);
    const result = await runAction(reverseStockDocument, manager.id, {
      documentId: made.documentId,
      reason: REASON,
    });
    expect(result.ok).toBe(true);
  });
});
