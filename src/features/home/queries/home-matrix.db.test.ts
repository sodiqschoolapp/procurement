import { describe, expect, it } from "vitest";

import { AuthorizationError } from "@/server/authorize";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertOrder } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { ordersOnFilter } from "@/features/orders/queries/order-list";
import { NO_FILTERS } from "@/features/orders/list-filters";

import { getFinanceHome } from "./finance-home";
import { getHeadHome } from "./head-home";
import { getManagerHome } from "./manager-home";
import { getPrincipalHome } from "./principal-home";

// The home queries in the permission matrix (15-quality-and-acceptance.md, Test layers: "each
// action × each role × own branch and other branch"; 03-roles-and-permissions.md, Permission
// matrix "See orders, stock and reports"; rule 1: another branch is "Not found"; plan of 6.1).
// Each is asked with the branch of the top bar (authorize()) and without it (the wall in the SQL):
// a home that leaves the other branch's order out answers "not_found" here.

describePermissionMatrix("getManagerHome", {
  permission: "data.view",
  async run({ user, branchId }) {
    const order = await insertOrder({ branchId, ownerId: user.id, status: "RETURNED" });
    const home = await getManagerHome(user.id, branchId);
    const ids = home.sentBack.groups.flatMap((group) => group.orders.map((each) => each.id));
    expect(ids).toEqual([order.id]);
  },
});

describePermissionMatrix("getManagerHome, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    // The user's own order in the branch: only the wall can keep it out.
    const order = await insertOrder({ branchId, ownerId: user.id, status: "RETURNED" });
    const home = await getManagerHome(user.id, null);
    const ids = home.sentBack.groups.flatMap((group) => group.orders.map((each) => each.id));
    if (!ids.includes(order.id)) throw new AuthorizationError("not_found");
  },
});

async function waitingOrder(branchId: string) {
  const owner = await insertUser("MANAGER", { branches: [branchId] });
  return insertOrder({ branchId, ownerId: owner.id, status: "PENDING_PRINCIPAL" });
}

describePermissionMatrix("getPrincipalHome", {
  permission: "data.view",
  async run({ user, branchId }) {
    const order = await waitingOrder(branchId);
    const home = await getPrincipalHome(user.id, branchId);
    const ids = home.cards.flatMap((card) => card.group.orders.map((each) => each.id));
    expect(ids).toEqual([order.id]);
    expect(home.waiting.count).toBe(1);
  },
});

describePermissionMatrix("getPrincipalHome, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const order = await waitingOrder(branchId);
    const home = await getPrincipalHome(user.id, null);
    const ids = home.cards.flatMap((card) => card.group.orders.map((each) => each.id));
    const counted = home.byStatus.find((each) => each.status === "PENDING_PRINCIPAL")?.count ?? 0;
    // The cards, the total and the counts keep to the same wall.
    expect(home.waiting.count).toBe(ids.length);
    expect(counted).toBe(ids.length);
    if (!ids.includes(order.id)) throw new AuthorizationError("not_found");
  },
});

// The Head's and Finance's homes (plan of 6.2): each read under its own approval step, with the
// order list's walls in the SQL.

async function orderAt(branchId: string, status: "PENDING_HEAD" | "PENDING_FINANCE") {
  const owner = await insertUser("MANAGER", { branches: [branchId] });
  return insertOrder({ branchId, ownerId: owner.id, status });
}

describePermissionMatrix("getHeadHome", {
  permission: "request.approve_step1",
  async run({ user, branchId }) {
    const order = await orderAt(branchId, "PENDING_HEAD");
    const home = await getHeadHome(user.id, branchId);
    const ids = home.waiting.groups.groups.flatMap((group) => group.orders.map((each) => each.id));
    expect(ids).toEqual([order.id]);
  },
});

describePermissionMatrix("getFinanceHome", {
  permission: "request.approve_step3",
  async run({ user, branchId }) {
    const order = await orderAt(branchId, "PENDING_FINANCE");
    const home = await getFinanceHome(user.id, branchId);
    expect(home.approvals.map((entry) => [entry.ownerId, entry.count])).toEqual([
      [order.ownerId, 1],
    ]);
  },
});

describe("getHeadHome and getFinanceHome with no branch chosen: the wall in the SQL (03 rule 1)", () => {
  it("Finance of one branch sees nothing of another branch's waiting or settling orders; the Head sees both", async () => {
    const a = await insertBranch();
    const b = await insertBranch();
    const finance = await insertUser("FINANCE", { branches: [a.id] });
    const head = await insertUser("HEAD");
    const mine = await orderAt(a.id, "PENDING_FINANCE");
    const theirs = await orderAt(b.id, "PENDING_FINANCE");
    const owner = await insertUser("MANAGER", { branches: [b.id] });
    await insertOrder({ branchId: b.id, ownerId: owner.id, status: "SETTLEMENT" });
    const home = await getFinanceHome(finance.id, null);
    expect(home.approvals.map((entry) => entry.ownerId)).toEqual([mine.ownerId]);
    expect(home.settlements).toEqual([]);
    expect(theirs.ownerId).not.toBe(mine.ownerId);

    const headA = await orderAt(a.id, "PENDING_HEAD");
    const headB = await orderAt(b.id, "PENDING_HEAD");
    const headHome = await getHeadHome(head.id, null);
    const lines = headHome.waiting.lines.map((line) => line.branchId);
    expect(lines).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(headA.id).not.toBe(headB.id);
    for (const user of [finance, await insertUser("MANAGER", { branches: [a.id] })]) {
      await expect(getHeadHome(user.id, null)).rejects.toBeInstanceOf(AuthorizationError);
    }
    await expect(getFinanceHome(head.id, null)).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("getHeadHome and getFinanceHome with no branch chosen, every role (03 Permission matrix, steps 1 and 3; permission review of 6.2, Must fix 1)", () => {
  it("only the Head opens the Head's home and only Finance the Finance home on 'All my branches'", async () => {
    const branch = await insertBranch();
    const users = {
      HEAD: await insertUser("HEAD"),
      MANAGER: await insertUser("MANAGER", { branches: [branch.id] }),
      PRINCIPAL: await insertUser("PRINCIPAL", { branches: [branch.id] }),
      FINANCE: await insertUser("FINANCE", { branches: [branch.id] }),
    };
    for (const [role, user] of Object.entries(users)) {
      // Each call starts only when it is awaited: a refusal never waits unhandled.
      if (role === "HEAD") await expect(getHeadHome(user.id, null)).resolves.toBeDefined();
      else await expect(getHeadHome(user.id, null)).rejects.toBeInstanceOf(AuthorizationError);
      if (role === "FINANCE") await expect(getFinanceHome(user.id, null)).resolves.toBeDefined();
      else await expect(getFinanceHome(user.id, null)).rejects.toBeInstanceOf(AuthorizationError);
    }
  });
});

describePermissionMatrix("ordersOnFilter", {
  permission: "data.view",
  async run({ user, branchId }) {
    const order = await orderAt(branchId, "PENDING_HEAD");
    const found = await ordersOnFilter(user.id, { ...NO_FILTERS, branch: branchId });
    expect(found.map((each) => each.id)).toEqual([order.id]);
  },
});

describePermissionMatrix("ordersOnFilter, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const order = await orderAt(branchId, "PENDING_HEAD");
    const found = await ordersOnFilter(user.id, NO_FILTERS);
    if (!found.some((each) => each.id === order.id)) throw new AuthorizationError("not_found");
  },
});
