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
import { returnBranchChoices, returnFormChoices, searchReturnItems } from "../queries/return-form";
import { returnStock } from "./return";

// Return from a department in the permission matrix (15-quality-and-acceptance.md, Test layers:
// "each action × each role × own branch and other branch"; 03-roles-and-permissions.md, Permission
// matrix "Issue, return, transfer stock": Head any branch, Manager own branches, Principal and
// Finance no; Manager right RETURN_REVERSE, "Take returns and reverse documents"; rule 1: another
// branch is "Not found"; plan of 5.6, decided item 4, Look first). The page's three exports are
// proved through themselves with the session mock (.claude/rules/server-actions.md). The expected
// answers come from tests/permission-matrix-expected.ts.

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { returnStockAction, returnFormChoicesAction, searchReturnItemsAction } =
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

/** A subtype with 5 in the branch's stock and a department of the branch. */
async function issued(branchId: string) {
  const item = await insertItem();
  const variantId = item.variantId;
  const creator = (await insertUser("HEAD")).id;
  const departmentId = (await insertDepartment(branchId)).id;
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
  return { variantId, departmentId, name: item.name };
}

function returnInput(branchId: string, made: Awaited<ReturnType<typeof issued>>) {
  return {
    clientKey: randomUUID(),
    branchId,
    docDate: "2031-05-03",
    departmentId: made.departmentId,
    // The department received nothing: the comment the over-return needs (decided item 5).
    comment: "Sinov izoh",
    lines: [{ variantId: made.variantId, qty: "2" }],
  };
}

describePermissionMatrix("returnStock", {
  permission: "stock.return_reverse",
  async run({ user, branchId }) {
    const made = await issued(branchId);
    asMatrixAnswer(await runAction(returnStock, user.id, returnInput(branchId, made)));
  },
});

describePermissionMatrix("returnStockAction", {
  permission: "stock.return_reverse",
  async run({ user, branchId }) {
    const made = await issued(branchId);
    signedIn(user);
    asMatrixAnswer(await returnStockAction(returnInput(branchId, made)));
  },
});

describePermissionMatrix("returnFormChoices", {
  permission: "stock.return_reverse",
  async run({ user, branchId }) {
    const { departmentId } = await issued(branchId);
    const choices = await returnFormChoices(user.id, { branchId });
    expect(choices.map((each) => each.id)).toContain(departmentId);
  },
});

describePermissionMatrix("returnFormChoicesAction", {
  permission: "stock.return_reverse",
  async run({ user, branchId }) {
    await issued(branchId);
    signedIn(user);
    asMatrixAnswer(await returnFormChoicesAction({ branchId }));
  },
});

describePermissionMatrix("searchReturnItems", {
  permission: "stock.return_reverse",
  async run({ user, branchId }) {
    const { variantId, departmentId, name } = await issued(branchId);
    const items = await searchReturnItems(user.id, { branchId, departmentId, q: name });
    expect(items.flatMap((each) => each.subtypes.map((subtype) => subtype.id))).toContain(
      variantId,
    );
  },
});

describePermissionMatrix("searchReturnItemsAction", {
  permission: "stock.return_reverse",
  async run({ user, branchId }) {
    const { departmentId } = await issued(branchId);
    signedIn(user);
    asMatrixAnswer(await searchReturnItemsAction({ branchId, departmentId, q: "" }));
  },
});

describe("returns and the two Manager rights (03 Manager rights; plan of 5.6, decided item 4, Look first)", () => {
  it("a Manager with ISSUE_STOCK off and RETURN_REVERSE on takes a return", async () => {
    const own = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [own.id] });
    await setManagerRight(manager.id, "ISSUE_STOCK", false);
    const made = await issued(own.id);
    expect((await runAction(returnStock, manager.id, returnInput(own.id, made))).ok).toBe(true);
  });

  it("a Manager with RETURN_REVERSE off and ISSUE_STOCK on is refused, nothing saved", async () => {
    const own = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [own.id] });
    await setManagerRight(manager.id, "RETURN_REVERSE", false);
    const made = await issued(own.id);
    const result = await runAction(returnStock, manager.id, returnInput(own.id, made));
    expect(result.ok ? null : result.error.code).toBe("forbidden");
    const count = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from stock_documents where branch_id = ${own.id}`,
    );
    expect(count.rows[0]!.n).toBe(0);
  });
});

describe("searchReturnItems: the department's wall (03 rule 1)", () => {
  it("another branch's department is Not found, though the branch is the user's own", async () => {
    const own = await insertBranch();
    const other = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [own.id, other.id] });
    const { departmentId } = await issued(other.id);
    await expect(
      searchReturnItems(manager.id, { branchId: own.id, departmentId }),
    ).rejects.toMatchObject({ kind: "not_found" });
  });
});

// A list without a branch: refused for a role without the right before any branch is read, so its
// cases are written by hand (the wall itself is the branch filter in the SQL), as for the issue.
describe("returnBranchChoices: the branches where the user may take returns (03 matrix; plan of 5.6)", () => {
  it("the Head every active branch; a Manager their own; Principal, Finance and a Manager with RETURN_REVERSE off refused", async () => {
    const own = await insertBranch();
    const other = await insertBranch();
    const closed = await insertBranch();
    await db.execute(sql`update branches set is_active = false where id = ${closed.id}`);
    const head = await insertUser("HEAD");
    const listed = (await returnBranchChoices(head.id)).map((each) => each.id);
    expect(listed).toEqual(expect.arrayContaining([own.id, other.id]));
    expect(listed).not.toContain(closed.id);

    const manager = await insertUser("MANAGER", { branches: [own.id, closed.id] });
    expect((await returnBranchChoices(manager.id)).map((each) => each.id)).toEqual([own.id]);

    const principal = await insertUser("PRINCIPAL", { branches: [own.id] });
    const finance = await insertUser("FINANCE", { branches: [own.id] });
    const switchedOff = await insertUser("MANAGER", { branches: [own.id] });
    await setManagerRight(switchedOff.id, "RETURN_REVERSE", false);
    for (const user of [principal, finance, switchedOff]) {
      await expect(returnBranchChoices(user.id)).rejects.toMatchObject({ kind: "forbidden" });
    }
  });
});
