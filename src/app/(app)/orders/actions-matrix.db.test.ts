import { beforeEach, describe, expect, it, vi } from "vitest";

import { newClientKey } from "@/components/client-key";
import type { Role } from "@/domain/permissions";
import type { ActionResult } from "@/server/action-result";
import type { CurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import {
  insertDepartment,
  insertItem,
  insertOrder,
  orderRow,
} from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { describeOwnerMoveMatrix } from "../../../../tests/helpers/owner-move-matrix";
import { describeSubmitMatrix } from "../../../../tests/helpers/submit-matrix";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";

// The page actions of the drafts grid in the permission matrix, called through their own
// "use server" exports, so each export is proved to run the right definition (permission review
// of 2.5b, Must fix 1 to 4; 15-quality-and-acceptance.md, Test layers: "each action × each role
// × own branch and other branch"; 03-roles-and-permissions.md, Permission matrix "Add, edit,
// submit, cancel orders" and "See orders, stock and reports"; Manager rights: CREATE_REQUESTS;
// 06 Statuses: Draft). The expected answers come from tests/permission-matrix-expected.ts; the
// delete and the draft wall are written by hand, as in drafts-matrix.db.test.ts (2.5a decided
// items 7 and 9, Look first).

const store = vi.hoisted(() => ({ user: null as CurrentUser | null }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => store.user }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const {
  approveOrdersAction,
  cancelOrdersAction,
  createDraftAction,
  deleteDraftAction,
  getDraftAction,
  listDraftChoicesAction,
  rejectOrdersAction,
  searchDraftProductsAction,
  selectAllOnFilterAction,
  sendBackOrdersAction,
  setDraftsNeededByAction,
  submitAgainOrdersAction,
  submitDraftsAction,
  takeBackOrdersAction,
  tickedSummaryAction,
  updateDraftAction,
} = await import("./actions");

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
});

/** The answer as the matrix reads it: a refusal of the wall or the matrix is thrown. */
function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const code = result.error.orders?.[0]?.code ?? result.error.code;
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

describePermissionMatrix("createDraftAction", {
  permission: "request.create",
  async run({ user, branchId }) {
    const variantId = (await insertItem()).variantId;
    const departmentId = (await insertDepartment(branchId)).id;
    signedIn(user);
    asMatrixAnswer(
      await createDraftAction({
        clientKey: newClientKey(),
        branchId,
        variantId,
        departmentId,
        quantity: "1",
      }),
    );
  },
});

describePermissionMatrix("searchDraftProductsAction", {
  permission: "request.create",
  async run({ user, branchId }) {
    signedIn(user);
    asMatrixAnswer(await searchDraftProductsAction({ branchId, q: "" }));
  },
});

describePermissionMatrix("listDraftChoicesAction", {
  permission: "request.create",
  async run({ user, branchId }) {
    signedIn(user);
    asMatrixAnswer(await listDraftChoicesAction({ branchId }));
  },
});

// A RETURNED order, which the whole branch may see, so the matrix answers and not the wall.
describePermissionMatrix("updateDraftAction", {
  permission: "request.edit",
  async run({ user, branchId, ownerId }) {
    const order = await insertOrder({ branchId, ownerId, status: "RETURNED" });
    signedIn(user);
    asMatrixAnswer(await updateDraftAction({ id: order.id, version: 1, comment: "Matritsa" }));
  },
});

describePermissionMatrix("setDraftsNeededByAction", {
  permission: "request.edit",
  async run({ user, branchId, ownerId }) {
    const order = await insertOrder({ branchId, ownerId, status: "RETURNED" });
    signedIn(user);
    asMatrixAnswer(
      await setDraftsNeededByAction({
        orders: [{ id: order.id, version: 1 }],
        neededBy: "2031-06-01",
      }),
    );
  },
});

describePermissionMatrix("getDraftAction", {
  permission: "data.view",
  async run({ user, branchId, ownerId }) {
    const order = await insertOrder({ branchId, ownerId, status: "RETURNED" });
    signedIn(user);
    const answer = await getDraftAction({ id: order.id });
    asMatrixAnswer(answer);
    // null is getDraft's "not found" (permission review of 2.5a, P2).
    if (answer.ok && answer.data === null) throw new AuthorizationError("not_found");
    expect(answer).toMatchObject({ ok: true, data: { id: order.id } });
  },
});

/** A user of the role in a new branch, and a second branch the user is not in. */
async function placed(role: Role) {
  const own = await insertBranch();
  const other = await insertBranch();
  const user = await insertUser(role, { branches: role === "HEAD" ? [] : [own.id] });
  return { own, other, user };
}

/** The user's own never-submitted draft in the branch, added through the page action. */
async function ownDraft(user: InsertedUser, branchId: string): Promise<string> {
  const variantId = (await insertItem()).variantId;
  const departmentId = (await insertDepartment(branchId)).id;
  signedIn(user);
  const result = await createDraftAction({
    clientKey: newClientKey(),
    branchId,
    variantId,
    departmentId,
    quantity: "1",
  });
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: { id: string } }).data.id;
}

const remove = async (user: InsertedUser, id: string) => {
  signedIn(user);
  asMatrixAnswer(await deleteDraftAction({ id, version: 1 }));
};

describe('deleteDraftAction: by hand, "Add, edit … orders", the owner only (05 Drafts 3; 2.5a decided item 7)', () => {
  it("HEAD in own and other branch: allow, on his own drafts", async () => {
    const { own, other, user } = await placed("HEAD");
    for (const branch of [own, other]) {
      const id = await ownDraft(user, branch.id);
      expect(await answerOf(() => remove(user, id))).toBe("allow");
      expect(await orderRow(id)).toBeUndefined();
    }
  });

  it("MANAGER in own branch: allow; in other branch (a Manager's draft there): not_found", async () => {
    const { own, other, user } = await placed("MANAGER");
    const mine = await ownDraft(user, own.id);
    expect(await answerOf(() => remove(user, mine))).toBe("allow");
    const there = await insertUser("MANAGER", { branches: [other.id] });
    const id = await ownDraft(there, other.id);
    expect(await answerOf(() => remove(user, id))).toBe("not_found");
    expect(await orderRow(id)).toBeDefined();
  });

  for (const role of ["PRINCIPAL", "FINANCE"] as const) {
    it(`${role} in own branch: forbidden; in other branch: not_found`, async () => {
      const { own, other, user } = await placed(role);
      const manager = await insertUser("MANAGER", { branches: [own.id, other.id] });
      const mine = await insertOrder({ branchId: own.id, ownerId: manager.id, status: "RETURNED" });
      const theirs = await insertOrder({
        branchId: other.id,
        ownerId: manager.id,
        status: "RETURNED",
      });
      expect(await answerOf(() => remove(user, mine.id))).toBe("forbidden");
      expect(await answerOf(() => remove(user, theirs.id))).toBe("not_found");
    });
  }

  it("MANAGER with CREATE_REQUESTS off: forbidden on his own draft in each own branch", async () => {
    const first = await insertBranch();
    const second = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [first.id, second.id] });
    const ids = [await ownDraft(manager, first.id), await ownDraft(manager, second.id)];
    await setManagerRight(manager.id, "CREATE_REQUESTS", false);
    for (const id of ids) {
      expect(await answerOf(() => remove(manager, id))).toBe("forbidden");
      expect(await orderRow(id)).toBeDefined();
    }
  });

  it("a colleague's draft of the own branch: not_found (the draft wall); the Head on a Manager's draft: forbidden", async () => {
    const { own, user } = await placed("MANAGER");
    const colleague = await insertUser("MANAGER", { branches: [own.id] });
    const id = await ownDraft(colleague, own.id);
    expect(await answerOf(() => remove(user, id))).toBe("not_found");
    const head = await insertUser("HEAD");
    expect(await answerOf(() => remove(head, id))).toBe("forbidden");
    expect(await orderRow(id)).toBeDefined();
  });
});

describe("getDraftAction and the draft wall (06 Statuses: Draft, visible to the owner and the Head only)", () => {
  it("a colleague Manager, the Principal and Finance of the branch get null; the Head and the owner the row", async () => {
    const { own, user: owner } = await placed("MANAGER");
    const id = await ownDraft(owner, own.id);
    const colleague = await insertUser("MANAGER", { branches: [own.id] });
    const principal = await insertUser("PRINCIPAL", { branches: [own.id] });
    const finance = await insertUser("FINANCE", { branches: [own.id] });
    for (const someone of [colleague, principal, finance]) {
      signedIn(someone);
      expect(await getDraftAction({ id })).toEqual({ ok: true, data: null });
    }
    for (const allowed of [await insertUser("HEAD"), owner]) {
      signedIn(allowed);
      expect(await getDraftAction({ id })).toMatchObject({ ok: true, data: { id } });
    }
  });
});

describe("setDraftsNeededByAction: all or nothing across branches (06 rule 8)", () => {
  it("an own-branch draft and another branch's draft ticked together: refused as a whole, neither changes", async () => {
    const { own, other, user } = await placed("MANAGER");
    const mine = await ownDraft(user, own.id);
    const there = await insertUser("MANAGER", { branches: [other.id] });
    const theirs = await ownDraft(there, other.id);
    signedIn(user);
    const answer = await setDraftsNeededByAction({
      orders: [
        { id: mine, version: 1 },
        { id: theirs, version: 1 },
      ],
      neededBy: "2031-06-01",
    });
    expect(answer).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: theirs, code: "not_found" }] },
    });
    expect((await orderRow(mine))!.neededBy).toBeNull();
    expect((await orderRow(theirs))!.neededBy).toBeNull();
  });
});

// Submit (build plan 2.7) through the page's own export.
describeSubmitMatrix("submitDraftsAction", (user, orders) => {
  signedIn(user);
  return submitDraftsAction({ clientKey: newClientKey(), orders });
});

// The order list (plan of 2.8): the two page actions through their own exports. An order left out
// of the answer is the branch wall's "not found" (03 rule 1).
describePermissionMatrix("selectAllOnFilterAction", {
  permission: "data.view",
  async run({ user, branchId }) {
    const owner = await insertUser("MANAGER", { branches: [branchId] });
    const order = await insertOrder({ branchId, ownerId: owner.id, status: "PENDING_HEAD" });
    signedIn(user);
    const answer = await selectAllOnFilterAction({ query: `branch=${branchId}` });
    asMatrixAnswer(answer);
    expect(answer).toMatchObject({ ok: true, data: { orders: [{ id: order.id }], matching: 1 } });
  },
});

describePermissionMatrix("selectAllOnFilterAction, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const owner = await insertUser("MANAGER", { branches: [branchId] });
    const order = await insertOrder({ branchId, ownerId: owner.id, status: "PENDING_HEAD" });
    signedIn(user);
    // No branch= in the address: the other branch's order is left out by the SQL (permission
    // review of 2.8, Should fix 1).
    const answer = await selectAllOnFilterAction({ query: "" });
    asMatrixAnswer(answer);
    if (answer.ok && !answer.data.orders.some((each) => each.id === order.id)) {
      throw new AuthorizationError("not_found");
    }
  },
});

describePermissionMatrix("tickedSummaryAction", {
  permission: "data.view",
  async run({ user, branchId }) {
    const owner = await insertUser("MANAGER", { branches: [branchId] });
    const order = await insertOrder({ branchId, ownerId: owner.id, status: "PENDING_HEAD" });
    signedIn(user);
    const answer = await tickedSummaryAction({ ids: [order.id] });
    asMatrixAnswer(answer);
    if (answer.ok && answer.data.missing.includes(order.id)) {
      throw new AuthorizationError("not_found");
    }
    expect(answer).toMatchObject({ ok: true, data: { count: 1, totals: { grand: "50000" } } });
  },
});

// Approve (build plan 2.10) through its own export, one matrix per step: the state machine's row
// of the order's status names the permission (plan of 2.10, decided item 1, Look first).
for (const [status, permission] of [
  ["PENDING_HEAD", "request.approve_step1"],
  ["PENDING_PRINCIPAL", "request.approve_step2"],
  ["PENDING_FINANCE", "request.approve_step3"],
] as const) {
  describePermissionMatrix(`approveOrdersAction at ${status}`, {
    permission,
    async run({ user, branchId }) {
      const owner = await insertUser("MANAGER", { branches: [branchId] });
      const order = await insertOrder({ branchId, ownerId: owner.id, status });
      signedIn(user);
      const answer = await approveOrdersAction({
        clientKey: newClientKey(),
        orders: [{ id: order.id, version: order.version }],
      });
      asMatrixAnswer(answer.ok ? answer : { ok: false, error: answer.error });
    },
  });
}

// Send back, Reject, Cancel, Take back and Submit again (build plan 2.11) through the page's own
// exports (.claude/rules/server-actions.md; permission review of 2.5b).
const REASON = "Invented reason for the test";

for (const [name, run] of [
  ["sendBackOrdersAction", sendBackOrdersAction],
  ["rejectOrdersAction", rejectOrdersAction],
] as const) {
  for (const [status, permission] of [
    ["PENDING_HEAD", "request.approve_step1"],
    ["PENDING_PRINCIPAL", "request.approve_step2"],
    ["PENDING_FINANCE", "request.approve_step3"],
  ] as const) {
    describePermissionMatrix(`${name} at ${status}`, {
      permission,
      async run({ user, branchId }) {
        const owner = await insertUser("MANAGER", { branches: [branchId] });
        const order = await insertOrder({ branchId, ownerId: owner.id, status });
        signedIn(user);
        const answer = await run({
          clientKey: newClientKey(),
          orders: [{ id: order.id, version: order.version }],
          reason: REASON,
        });
        asMatrixAnswer(answer.ok ? answer : { ok: false, error: answer.error });
      },
    });
  }
}

describePermissionMatrix("cancelOrdersAction", {
  permission: "request.edit",
  async run({ user, branchId, ownerId }) {
    const order = await insertOrder({ branchId, ownerId, status: "PENDING_PRINCIPAL" });
    signedIn(user);
    const answer = await cancelOrdersAction({
      clientKey: newClientKey(),
      orders: [{ id: order.id, version: order.version }],
      reason: REASON,
    });
    asMatrixAnswer(answer.ok ? answer : { ok: false, error: answer.error });
  },
});

describeOwnerMoveMatrix("takeBackOrdersAction", "PENDING_HEAD", async (user, orders) => {
  signedIn(user);
  const answer = await takeBackOrdersAction({ clientKey: newClientKey(), orders });
  return answer.ok ? answer : { ok: false, error: answer.error };
});

describeOwnerMoveMatrix("submitAgainOrdersAction", "RETURNED", async (user, orders) => {
  signedIn(user);
  const answer = await submitAgainOrdersAction({ clientKey: newClientKey(), orders });
  return answer.ok ? answer : { ok: false, error: answer.error };
});
