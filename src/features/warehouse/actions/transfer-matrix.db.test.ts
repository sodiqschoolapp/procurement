import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/server/action-result";
import { runAction } from "@/server/action";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertItem } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { receive } from "../../../../tests/helpers/stock-documents";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";
import { searchTransferItems, transferBranchChoices } from "../queries/issue-form";
import { transferDestinationChoices } from "../queries/transfer-form";
import { sendTransfer } from "./transfer";

// The transfer in the permission matrix (15-quality-and-acceptance.md, Test layers: "each action
// × each role × own branch and other branch"; 03-roles-and-permissions.md, Permission matrix
// "Issue, return, transfer stock": Head any branch, Manager own branches with TRANSFER_STOCK;
// rule 1; plan of 7.1). The matrix's branch is the sending branch; the receiving branch is a
// fresh one nobody is of. The pages' exports are proved through themselves with the session mock
// (.claude/rules/server-actions.md). The expected answers come from
// tests/permission-matrix-expected.ts.

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { sendTransferAction, transferDestinationChoicesAction, searchTransferItemsAction } =
  await import("@/app/(app)/warehouse/documents/new/actions");

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

/** A goods subtype with 5 in the branch. */
async function stocked(branchId: string): Promise<{ variantId: string; name: string }> {
  const item = await insertItem();
  const keeper = await insertUser("HEAD");
  await receive(branchId, item.variantId, "5", 1000n, keeper.id);
  return item;
}

async function sendInput(branchId: string, variantId: string) {
  const to = await insertBranch();
  return {
    clientKey: randomUUID(),
    branchId,
    toBranchId: to.id,
    docDate: "2031-05-03",
    receivedByName: null,
    comment: null,
    lines: [{ variantId, qty: "1" }],
  };
}

describePermissionMatrix("sendTransfer", {
  permission: "stock.transfer",
  async run({ user, branchId }) {
    const { variantId } = await stocked(branchId);
    asMatrixAnswer(await runAction(sendTransfer, user.id, await sendInput(branchId, variantId)));
  },
});

describePermissionMatrix("sendTransferAction", {
  permission: "stock.transfer",
  async run({ user, branchId }) {
    const { variantId } = await stocked(branchId);
    const input = await sendInput(branchId, variantId);
    signedIn(user);
    asMatrixAnswer(await sendTransferAction(input));
  },
});

describePermissionMatrix("searchTransferItems", {
  permission: "stock.transfer",
  async run({ user, branchId }) {
    const { variantId, name } = await stocked(branchId);
    const items = await searchTransferItems(user.id, { branchId, q: name });
    expect(items.flatMap((each) => each.subtypes.map((subtype) => subtype.id))).toContain(
      variantId,
    );
  },
});

describePermissionMatrix("searchTransferItemsAction", {
  permission: "stock.transfer",
  async run({ user, branchId }) {
    signedIn(user);
    asMatrixAnswer(await searchTransferItemsAction({ branchId, q: "" }));
  },
});

describePermissionMatrix("transferDestinationChoices", {
  permission: "stock.transfer",
  async run({ user, branchId }) {
    const to = await insertBranch();
    const listed = (await transferDestinationChoices(user.id, { branchId })).map((each) => each.id);
    expect(listed).toContain(to.id);
    expect(listed).not.toContain(branchId);
  },
});

describePermissionMatrix("transferDestinationChoicesAction", {
  permission: "stock.transfer",
  async run({ user, branchId }) {
    signedIn(user);
    asMatrixAnswer(await transferDestinationChoicesAction({ branchId }));
  },
});

describe("transferDestinationChoices: every active branch but the sender, code and name only (plan of 7.1, decided item 1)", () => {
  it("lists a branch the Manager is not of, leaves out the sender and an inactive branch", async () => {
    const own = await insertBranch();
    const elsewhere = await insertBranch();
    const closed = await insertBranch({ isActive: false });
    const manager = await insertUser("MANAGER", { branches: [own.id] });
    const listed = await transferDestinationChoices(manager.id, { branchId: own.id });
    const ids = listed.map((each) => each.id);
    expect(ids).toContain(elsewhere.id);
    expect(ids).not.toContain(own.id);
    expect(ids).not.toContain(closed.id);
    expect(Object.keys(listed[0]!).sort()).toEqual(["code", "id", "name"]);
  });
});

// A list without a branch: refused for a role without the right before any branch is read, so its
// cases are written by hand (the wall itself is the branch filter in the SQL), as for the issue.
describe("transferBranchChoices: the branches the user may send from (03 matrix; plan of 7.1)", () => {
  it("the Head every active branch; a Manager their own with TRANSFER_STOCK; Principal and Finance refused", async () => {
    const own = await insertBranch();
    const other = await insertBranch();
    const closed = await insertBranch();
    await db.execute(sql`update branches set is_active = false where id = ${closed.id}`);
    const head = await insertUser("HEAD");
    const listed = (await transferBranchChoices(head.id)).map((each) => each.id);
    expect(listed).toEqual(expect.arrayContaining([own.id, other.id]));
    expect(listed).not.toContain(closed.id);

    const manager = await insertUser("MANAGER", { branches: [own.id, closed.id] });
    expect((await transferBranchChoices(manager.id)).map((each) => each.id)).toEqual([own.id]);
    await setManagerRight(manager.id, "TRANSFER_STOCK", false);
    await expect(transferBranchChoices(manager.id)).rejects.toMatchObject({ kind: "forbidden" });

    const principal = await insertUser("PRINCIPAL", { branches: [own.id] });
    const finance = await insertUser("FINANCE", { branches: [own.id] });
    for (const user of [principal, finance]) {
      await expect(transferBranchChoices(user.id)).rejects.toMatchObject({ kind: "forbidden" });
    }
  });
});
