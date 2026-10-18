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
import { searchWriteOffItems, writeOffBranchChoices } from "../queries/issue-form";
import { askWriteOff } from "./write-off";
import { decideWriteOff } from "./write-off-decision";

// The write-off in the permission matrix (15-quality-and-acceptance.md, Test layers: "each action
// × each role × own branch and other branch"; 03-roles-and-permissions.md, Permission matrix "Ask
// for a write-off or stock correction": Head any branch, Manager own branches with WRITE_OFF_COUNT;
// "Approve a write-off or stock correction": the Head only; rule 1; plan of 5.11). The pages'
// exports are proved through themselves with the session mock (.claude/rules/server-actions.md).
// The expected answers come from tests/permission-matrix-expected.ts.

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { askWriteOffAction, searchWriteOffItemsAction } =
  await import("@/app/(app)/warehouse/documents/new/actions");
const { decideWriteOffAction } = await import("@/app/(app)/warehouse/documents/[id]/actions");

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

function askInput(branchId: string, variantId: string) {
  return {
    clientKey: randomUUID(),
    branchId,
    docDate: "2031-05-03",
    reason: "DAMAGED",
    comment: "Sinov izoh",
    lines: [{ variantId, qty: "1" }],
  };
}

/** A waiting write-off of the branch, asked by a Manager of it; asserted (D38). */
async function waiting(branchId: string): Promise<string> {
  const { variantId } = await stocked(branchId);
  const asker = await insertUser("MANAGER", { branches: [branchId] });
  const asked = await runAction(askWriteOff, asker.id, askInput(branchId, variantId));
  if (!asked.ok) throw new Error(`fixture: ${asked.error.code}`);
  expect(asked.data.posted).toBe(false);
  return asked.data.documentId;
}

describePermissionMatrix("askWriteOff", {
  permission: "stock.ask_write_off",
  async run({ user, branchId }) {
    const { variantId } = await stocked(branchId);
    asMatrixAnswer(await runAction(askWriteOff, user.id, askInput(branchId, variantId)));
  },
});

describePermissionMatrix("askWriteOffAction", {
  permission: "stock.ask_write_off",
  async run({ user, branchId }) {
    const { variantId } = await stocked(branchId);
    signedIn(user);
    asMatrixAnswer(await askWriteOffAction(askInput(branchId, variantId)));
  },
});

describePermissionMatrix("searchWriteOffItems", {
  permission: "stock.ask_write_off",
  async run({ user, branchId }) {
    const { variantId, name } = await stocked(branchId);
    const items = await searchWriteOffItems(user.id, { branchId, q: name });
    expect(items.flatMap((each) => each.subtypes.map((subtype) => subtype.id))).toContain(
      variantId,
    );
  },
});

describePermissionMatrix("searchWriteOffItemsAction", {
  permission: "stock.ask_write_off",
  async run({ user, branchId }) {
    signedIn(user);
    asMatrixAnswer(await searchWriteOffItemsAction({ branchId, q: "" }));
  },
});

describePermissionMatrix("decideWriteOff", {
  permission: "stock.approve_write_off",
  async run({ user, branchId }) {
    const documentId = await waiting(branchId);
    asMatrixAnswer(await runAction(decideWriteOff, user.id, { documentId, outcome: "APPROVE" }));
  },
});

describePermissionMatrix("decideWriteOffAction", {
  permission: "stock.approve_write_off",
  async run({ user, branchId }) {
    const documentId = await waiting(branchId);
    signedIn(user);
    asMatrixAnswer(await decideWriteOffAction({ documentId, outcome: "REFUSE" }));
  },
});

describe("the asker cannot decide their own write-off (03 matrix: approve is the Head's only)", () => {
  it("a Manager who asked is refused, and the write-off keeps waiting", async () => {
    const branch = await insertBranch();
    const { variantId } = await stocked(branch.id);
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const asked = await runAction(askWriteOff, manager.id, askInput(branch.id, variantId));
    if (!asked.ok) throw new Error(`fixture: ${asked.error.code}`);
    for (const outcome of ["APPROVE", "REFUSE"] as const) {
      expect(
        await runAction(decideWriteOff, manager.id, { documentId: asked.data.documentId, outcome }),
      ).toMatchObject({ ok: false, error: { code: "forbidden" } });
    }
    const status = await db.execute<{ status: string }>(
      sql`select status from stock_documents where id = ${asked.data.documentId}`,
    );
    expect(status.rows[0]!.status).toBe("PENDING_APPROVAL");
  });
});

// A list without a branch: refused for a role without the right before any branch is read, so its
// cases are written by hand (the wall itself is the branch filter in the SQL), as for the issue.
describe("writeOffBranchChoices: the branches where the user may ask (03 matrix; plan of 5.11)", () => {
  it("the Head every active branch; a Manager their own with WRITE_OFF_COUNT; Principal and Finance refused", async () => {
    const own = await insertBranch();
    const other = await insertBranch();
    const closed = await insertBranch();
    await db.execute(sql`update branches set is_active = false where id = ${closed.id}`);
    const head = await insertUser("HEAD");
    const listed = (await writeOffBranchChoices(head.id)).map((each) => each.id);
    expect(listed).toEqual(expect.arrayContaining([own.id, other.id]));
    expect(listed).not.toContain(closed.id);

    const manager = await insertUser("MANAGER", { branches: [own.id, closed.id] });
    expect((await writeOffBranchChoices(manager.id)).map((each) => each.id)).toEqual([own.id]);
    await setManagerRight(manager.id, "WRITE_OFF_COUNT", false);
    await expect(writeOffBranchChoices(manager.id)).rejects.toMatchObject({ kind: "forbidden" });

    const principal = await insertUser("PRINCIPAL", { branches: [own.id] });
    const finance = await insertUser("FINANCE", { branches: [own.id] });
    for (const user of [principal, finance]) {
      await expect(writeOffBranchChoices(user.id)).rejects.toMatchObject({ kind: "forbidden" });
    }
  });
});
