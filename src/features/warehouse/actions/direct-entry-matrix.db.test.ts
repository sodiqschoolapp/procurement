import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionResult } from "@/server/action-result";
import { runAction } from "@/server/action";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertItem } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { setClock } from "../../../../tests/helpers/clock";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";
import { directEntryBranchChoices, searchDirectEntryItems } from "../queries/direct-entry-form";
import { enterStockDirectly } from "./direct-entry";

// Direct entry in the permission matrix (15-quality-and-acceptance.md, Test layers: "each action ×
// each role × own branch and other branch"; 03-roles-and-permissions.md, Permission matrix "Enter
// stock directly, without an order": the Head only, any branch; rule 1; plan of 5.8). The page's
// two exports are proved through themselves with the session mock (.claude/rules/server-
// actions.md). The expected answers come from tests/permission-matrix-expected.ts.

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { enterStockDirectlyAction, searchDirectEntryItemsAction } =
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

function entryInput(branchId: string, variantId: string) {
  return {
    clientKey: randomUUID(),
    branchId,
    docDate: "2031-05-03",
    reason: "EXISTING_STOCK",
    comment: null,
    lines: [{ variantId, qty: "200", unitCost: "1000" }],
  };
}

describePermissionMatrix("enterStockDirectly", {
  permission: "stock.enter_direct",
  async run({ user, branchId }) {
    const { variantId } = await insertItem();
    asMatrixAnswer(await runAction(enterStockDirectly, user.id, entryInput(branchId, variantId)));
  },
});

describePermissionMatrix("enterStockDirectlyAction", {
  permission: "stock.enter_direct",
  async run({ user, branchId }) {
    const { variantId } = await insertItem();
    signedIn(user);
    asMatrixAnswer(await enterStockDirectlyAction(entryInput(branchId, variantId)));
  },
});

describePermissionMatrix("searchDirectEntryItems", {
  permission: "stock.enter_direct",
  async run({ user, branchId }) {
    const { variantId, name } = await insertItem();
    const items = await searchDirectEntryItems(user.id, { branchId, q: name });
    expect(items.flatMap((each) => each.subtypes.map((subtype) => subtype.id))).toContain(
      variantId,
    );
  },
});

describePermissionMatrix("searchDirectEntryItemsAction", {
  permission: "stock.enter_direct",
  async run({ user, branchId }) {
    signedIn(user);
    asMatrixAnswer(await searchDirectEntryItemsAction({ branchId, q: "" }));
  },
});

// A list without a branch: refused for a role without the right before any branch is read, so its
// cases are written by hand (the wall itself is the branch filter in the SQL), as for the return.
describe("directEntryBranchChoices: the branches where the user may enter stock (03 matrix; plan of 5.8)", () => {
  it("the Head every active branch; a Manager with every right, a Principal and Finance refused", async () => {
    const own = await insertBranch();
    const other = await insertBranch();
    const closed = await insertBranch();
    await db.execute(sql`update branches set is_active = false where id = ${closed.id}`);
    const head = await insertUser("HEAD");
    const listed = (await directEntryBranchChoices(head.id)).map((each) => each.id);
    expect(listed).toEqual(expect.arrayContaining([own.id, other.id]));
    expect(listed).not.toContain(closed.id);

    const manager = await insertUser("MANAGER", { branches: [own.id] });
    const principal = await insertUser("PRINCIPAL", { branches: [own.id] });
    const finance = await insertUser("FINANCE", { branches: [own.id] });
    for (const user of [manager, principal, finance]) {
      await expect(directEntryBranchChoices(user.id)).rejects.toMatchObject({ kind: "forbidden" });
    }
  });
});
