import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/server/action-result";
import { runAction } from "@/server/action";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import { postMovement } from "@/server/stock-ledger";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { insertDepartment, insertItem } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { setClock } from "../../../../tests/helpers/clock";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";
import { issueBranchChoices, issueFormChoices, searchIssueItems } from "../queries/issue-form";
import { getIssueNote } from "../queries/issue-note";
import { issueStock } from "./issue";

// Issue to a department in the permission matrix (15-quality-and-acceptance.md, Test layers:
// "each action × each role × own branch and other branch"; 03-roles-and-permissions.md, Permission
// matrix "Issue, return, transfer stock": Head any branch, Manager own branches with ISSUE_STOCK,
// Principal and Finance no; "Export to Excel, download PDF, print": every role, for what it sees;
// rule 1: another branch is "Not found"; plan of 5.4). The page's three exports are proved through
// themselves with the session mock (.claude/rules/server-actions.md). The expected answers come
// from tests/permission-matrix-expected.ts.

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { issueStockAction, issueFormChoicesAction, searchIssueItemsAction } =
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
  store.user = null;
  setClock("2031-05-03T06:00:00Z");
});

/** The answer as the matrix reads it: a refusal of the wall or the matrix is thrown. */
function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const code = result.error.code;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

/** A subtype with 5 in the branch's stock and a department of the branch. */
async function stocked(branchId: string) {
  const variantId = (await insertItem()).variantId;
  const creator = (await insertUser("HEAD")).id;
  await db.transaction((tx) =>
    postMovement(tx, {
      branchId,
      variantId,
      type: "RECEIPT",
      qtyDelta: "5",
      unitCost: 1000n,
      createdBy: creator,
    }),
  );
  const departmentId = (await insertDepartment(branchId, { responsibleName: "Sinov Mas'ul" })).id;
  return { variantId, departmentId };
}

function issueInput(branchId: string, made: Awaited<ReturnType<typeof stocked>>) {
  return {
    clientKey: randomUUID(),
    branchId,
    docDate: "2031-05-03",
    departmentId: made.departmentId,
    receivedByName: "Sinov Mas'ul",
    comment: null,
    lines: [{ variantId: made.variantId, qty: "2" }],
  };
}

describePermissionMatrix("issueStock", {
  permission: "stock.issue",
  async run({ user, branchId }) {
    const made = await stocked(branchId);
    asMatrixAnswer(await runAction(issueStock, user.id, issueInput(branchId, made)));
  },
});

describePermissionMatrix("issueStockAction", {
  permission: "stock.issue",
  async run({ user, branchId }) {
    const made = await stocked(branchId);
    signedIn(user);
    asMatrixAnswer(await issueStockAction(issueInput(branchId, made)));
  },
});

describePermissionMatrix("issueFormChoices", {
  permission: "stock.issue",
  async run({ user, branchId }) {
    const { departmentId } = await stocked(branchId);
    const choices = await issueFormChoices(user.id, { branchId });
    expect(choices.map((each) => each.id)).toContain(departmentId);
  },
});

describePermissionMatrix("issueFormChoicesAction", {
  permission: "stock.issue",
  async run({ user, branchId }) {
    await stocked(branchId);
    signedIn(user);
    asMatrixAnswer(await issueFormChoicesAction({ branchId }));
  },
});

describePermissionMatrix("searchIssueItems", {
  permission: "stock.issue",
  async run({ user, branchId }) {
    const { variantId } = await stocked(branchId);
    const items = await searchIssueItems(user.id, { branchId });
    expect(items.flatMap((each) => each.subtypes.map((subtype) => subtype.id))).toContain(
      variantId,
    );
  },
});

describePermissionMatrix("searchIssueItemsAction", {
  permission: "stock.issue",
  async run({ user, branchId }) {
    await stocked(branchId);
    signedIn(user);
    asMatrixAnswer(await searchIssueItemsAction({ branchId, q: "" }));
  },
});

// A list without a branch: refused for a role without the right before any branch is read, so its
// cases are written by hand (the wall itself is the branch filter in the SQL).
describe("issueBranchChoices: the branches where the user may issue (03 matrix; plan of 5.4)", () => {
  it("the Head every active branch; a Manager their own; Principal, Finance and a Manager with ISSUE_STOCK off refused", async () => {
    const own = await insertBranch();
    const other = await insertBranch();
    const closed = await insertBranch();
    await db.execute(sql`update branches set is_active = false where id = ${closed.id}`);
    const head = await insertUser("HEAD");
    const listed = (await issueBranchChoices(head.id)).map((each) => each.id);
    expect(listed).toEqual(expect.arrayContaining([own.id, other.id]));
    expect(listed).not.toContain(closed.id);

    const manager = await insertUser("MANAGER", { branches: [own.id, closed.id] });
    expect((await issueBranchChoices(manager.id)).map((each) => each.id)).toEqual([own.id]);

    const principal = await insertUser("PRINCIPAL", { branches: [own.id] });
    const finance = await insertUser("FINANCE", { branches: [own.id] });
    const switchedOff = await insertUser("MANAGER", { branches: [own.id] });
    await setManagerRight(switchedOff.id, "ISSUE_STOCK", false);
    for (const user of [principal, finance, switchedOff]) {
      await expect(issueBranchChoices(user.id)).rejects.toMatchObject({ kind: "forbidden" });
    }
  });
});

describePermissionMatrix("getIssueNote", {
  permission: "data.export",
  async run({ user, branchId }) {
    const made = await stocked(branchId);
    const maker = await insertUser("HEAD");
    const posted = await runAction(issueStock, maker.id, issueInput(branchId, made));
    expect(posted.ok).toBe(true);
    const note = await getIssueNote(user.id, posted.ok ? posted.data.documentId : "");
    // The branch wall is in the SQL: another branch's note reads as unknown (03 rule 1).
    if (!note) throw new AuthorizationError("not_found");
    expect(note.lines).toHaveLength(1);
  },
});
