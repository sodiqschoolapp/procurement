import { describe, expect, it } from "vitest";

import { type Role } from "@/domain/permissions";
import { runAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";
import { AuthorizationError } from "@/server/authorize";
import { runDraftsAction } from "@/server/drafts-action";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import {
  addDraft,
  editDraft,
  insertDepartment,
  insertItem,
  insertOrder,
} from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { getDraft, listDrafts } from "../queries/drafts";
import { listDraftChoices, searchDraftProducts } from "../queries/draft-picker";
import { deleteDraft, setDraftsNeededBy } from "./drafts";

// Every new action and query of build plan 2.5a in the permission matrix (15-quality-and-
// acceptance.md, Test layers: "each action × each role × own branch and other branch";
// 03-roles-and-permissions.md, Permission matrix "Create, edit, submit, cancel a request" and "See
// requests, stock and reports"; Manager rights: CREATE_REQUESTS; 06 Statuses: Draft). Each
// feature action and query is called directly (permission review of 1.10). The expected answers
// come from tests/permission-matrix-expected.ts; listDrafts and deleteDraft are written by hand
// (plan of 2.5a, Server actions: the helper would expect the Principal and Finance allowed on the
// list, and the Head allowed on a Manager's draft for delete; decided items 7 and 9, Look first).

/** The wrapper's answer as the matrix reads it: a refusal of the wall or the matrix is thrown. */
function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const { code } = result.error;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

async function answerOf(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
    return "allow";
  } catch (error) {
    if (error instanceof AuthorizationError) return error.kind;
    throw error;
  }
}

describePermissionMatrix("createDraft", {
  permission: "request.create",
  async run({ user, branchId }) {
    asMatrixAnswer(
      await addDraft(user.id, {
        branchId,
        variantId: (await insertItem()).variantId,
        departmentId: (await insertDepartment(branchId)).id,
      }),
    );
  },
});

describePermissionMatrix("searchDraftProducts", {
  permission: "request.create",
  async run({ user, branchId }) {
    await searchDraftProducts(user.id, { branchId, q: "" });
  },
});

describePermissionMatrix("listDraftChoices", {
  permission: "request.create",
  async run({ user, branchId }) {
    await listDraftChoices(user.id, { branchId });
  },
});

// Run on a RETURNED order, which the whole branch may see, so a colleague reaches `forbidden`;
// a colleague's DRAFT is `not_found` (drafts.db.test.ts, Done when 3).
describePermissionMatrix("updateDraft", {
  permission: "request.edit",
  async run({ user, branchId, ownerId }) {
    const order = await insertOrder({ branchId, ownerId, status: "RETURNED" });
    asMatrixAnswer(await editDraft(user.id, { id: order.id, version: 1, comment: "Matritsa" }));
  },
});

describePermissionMatrix("setDraftsNeededBy", {
  permission: "request.edit",
  async run({ user, branchId, ownerId }) {
    const order = await insertOrder({ branchId, ownerId, status: "RETURNED" });
    asMatrixAnswer(
      await runDraftsAction(setDraftsNeededBy, user.id, {
        orders: [{ id: order.id, version: 1 }],
        neededBy: "2031-06-01",
      }),
    );
  },
});

describePermissionMatrix("getDraft", {
  permission: "data.view",
  async run({ user, branchId, ownerId }) {
    const order = await insertOrder({ branchId, ownerId, status: "RETURNED" });
    // null is getDraft's "not found" (permission review of 2.5a, P2).
    const row = await getDraft(user.id, order.id);
    if (row === null) throw new AuthorizationError("not_found");
    expect(row).toMatchObject({ id: order.id });
  },
});

/** A user of the role in a new branch, and a second branch the user is not in. */
async function placed(role: Role) {
  const own = await insertBranch();
  const other = await insertBranch();
  const user = await insertUser(role, { branches: role === "HEAD" ? [] : [own.id] });
  return { own, other, user };
}

describe('listDrafts: permission matrix by hand, "See requests" with the drafts grid for Manager and Head (11 Screens; decided item 9)', () => {
  const cases: [Role, "own" | "other", string][] = [
    ["HEAD", "own", "allow"],
    ["HEAD", "other", "allow"],
    ["MANAGER", "own", "allow"],
    ["MANAGER", "other", "not_found"],
    ["PRINCIPAL", "own", "forbidden"],
    ["PRINCIPAL", "other", "forbidden"],
    ["FINANCE", "own", "forbidden"],
    ["FINANCE", "other", "forbidden"],
  ];
  for (const [role, place, expected] of cases) {
    it(`${role} in ${place} branch: ${expected}`, async () => {
      const { own, other, user } = await placed(role);
      const branchId = place === "own" ? own.id : other.id;
      expect(await answerOf(() => listDrafts(user.id, { branchId }))).toBe(expected);
    });
  }

  it('MANAGER with CREATE_REQUESTS off: still allowed in each own branch ("can only view orders")', async () => {
    const first = await insertBranch();
    const second = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [first.id, second.id] });
    await setManagerRight(manager.id, "CREATE_REQUESTS", false);
    for (const branch of [first, second]) {
      expect(await answerOf(() => listDrafts(manager.id, { branchId: branch.id }))).toBe("allow");
    }
    expect(await answerOf(() => listDrafts(manager.id))).toBe("allow");
  });
});

describe('deleteDraft: permission matrix by hand, "Create, edit … a request", the owner only (05 Drafts 3; decided item 7)', () => {
  /** The user's own never-submitted draft in the branch. */
  async function ownDraft(userId: string, branchId: string) {
    const result = await addDraft(userId, {
      branchId,
      variantId: (await insertItem()).variantId,
      departmentId: (await insertDepartment(branchId)).id,
    });
    expect(result).toMatchObject({ ok: true });
    return (result as { ok: true; data: { id: string } }).data.id;
  }

  const remove = async (userId: string, id: string) =>
    asMatrixAnswer(await runAction(deleteDraft, userId, { id, version: 1 }));

  it("HEAD in own and other branch: allow, on his own drafts", async () => {
    const { own, other, user } = await placed("HEAD");
    for (const branch of [own, other]) {
      const id = await ownDraft(user.id, branch.id);
      expect(await answerOf(() => remove(user.id, id))).toBe("allow");
    }
  });

  it("MANAGER in own branch: allow; in other branch (a Manager's draft there): not_found", async () => {
    const { own, other, user } = await placed("MANAGER");
    expect(await answerOf(async () => remove(user.id, await ownDraft(user.id, own.id)))).toBe(
      "allow",
    );
    const there = await insertUser("MANAGER", { branches: [other.id] });
    const id = await ownDraft(there.id, other.id);
    expect(await answerOf(() => remove(user.id, id))).toBe("not_found");
  });

  for (const role of ["PRINCIPAL", "FINANCE"] as const) {
    it(`${role} in own branch: forbidden; in other branch: not_found`, async () => {
      const { own, other, user } = await placed(role);
      const manager = await insertUser("MANAGER", { branches: [own.id, other.id] });
      // A RETURNED order, which the branch may see, so the matrix answers and not the wall.
      const mine = await insertOrder({ branchId: own.id, ownerId: manager.id, status: "RETURNED" });
      const theirs = await insertOrder({
        branchId: other.id,
        ownerId: manager.id,
        status: "RETURNED",
      });
      expect(await answerOf(() => remove(user.id, mine.id))).toBe("forbidden");
      expect(await answerOf(() => remove(user.id, theirs.id))).toBe("not_found");
    });
  }

  it("MANAGER with CREATE_REQUESTS off: forbidden on his own draft in each own branch", async () => {
    const first = await insertBranch();
    const second = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [first.id, second.id] });
    const ids = [await ownDraft(manager.id, first.id), await ownDraft(manager.id, second.id)];
    await setManagerRight(manager.id, "CREATE_REQUESTS", false);
    for (const id of ids) expect(await answerOf(() => remove(manager.id, id))).toBe("forbidden");
  });

  it("a colleague's draft of the own branch: not_found (the draft wall); the Head on a Manager's draft: forbidden", async () => {
    const { own, user } = await placed("MANAGER");
    const colleague = await insertUser("MANAGER", { branches: [own.id] });
    const id = await ownDraft(colleague.id, own.id);
    expect(await answerOf(() => remove(user.id, id))).toBe("not_found");
    const head = await insertUser("HEAD");
    expect(await answerOf(() => remove(head.id, id))).toBe("forbidden");
  });
});
