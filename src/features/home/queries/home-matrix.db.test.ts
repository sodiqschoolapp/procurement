import { expect } from "vitest";

import { AuthorizationError } from "@/server/authorize";

import { insertOrder } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
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
