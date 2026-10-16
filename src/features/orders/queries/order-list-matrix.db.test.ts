import { expect } from "vitest";

import { AuthorizationError } from "@/server/authorize";

import { insertOrder } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { NO_FILTERS } from "../list-filters";
import {
  listOrderFilterChoices,
  listOrderGroups,
  selectAllOnFilter,
  tickedSummary,
} from "./order-list";

// The queries of the order list in the permission matrix (15-quality-and-acceptance.md, Test
// layers: "each action × each role × own branch and other branch"; 03-roles-and-permissions.md,
// Permission matrix "See orders, stock and reports": Head all branches, Manager own branches,
// Principal own branch, Finance own branches; rule 1: another branch is "Not found"; plan of 2.8).
// A list that leaves the other branch's order out answers "not_found" here.

async function waitingOrder(branchId: string) {
  const owner = await insertUser("MANAGER", { branches: [branchId] });
  return insertOrder({ branchId, ownerId: owner.id, status: "PENDING_HEAD" });
}

describePermissionMatrix("listOrderGroups", {
  permission: "data.view",
  async run({ user, branchId }) {
    const order = await waitingOrder(branchId);
    // With the branch filter: another branch is refused by authorize().
    const page = await listOrderGroups(user.id, { ...NO_FILTERS, branch: branchId });
    const ids = page.groups.flatMap((group) => group.orders.map((each) => each.id));
    expect(ids).toEqual([order.id]);
    // Without it: the branch wall inside the SQL.
    const unfiltered = await listOrderGroups(user.id);
    const all = unfiltered.groups.flatMap((group) => group.orders.map((each) => each.id));
    expect(all).toContain(order.id);
  },
});

describePermissionMatrix("listOrderGroups, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const order = await waitingOrder(branchId);
    const page = await listOrderGroups(user.id);
    const ids = page.groups.flatMap((group) => group.orders.map((each) => each.id));
    if (!ids.includes(order.id)) throw new AuthorizationError("not_found");
  },
});

describePermissionMatrix("selectAllOnFilter", {
  permission: "data.view",
  async run({ user, branchId }) {
    const order = await waitingOrder(branchId);
    const all = await selectAllOnFilter(user.id);
    if (!all.orders.some((each) => each.id === order.id)) throw new AuthorizationError("not_found");
  },
});

describePermissionMatrix("tickedSummary", {
  permission: "data.view",
  async run({ user, branchId }) {
    const order = await waitingOrder(branchId);
    const summary = await tickedSummary(user.id, [order.id]);
    if (summary.missing.includes(order.id)) throw new AuthorizationError("not_found");
    expect(summary.count).toBe(1);
  },
});

describePermissionMatrix("listOrderFilterChoices", {
  permission: "data.view",
  async run({ user, branchId }) {
    const order = await waitingOrder(branchId);
    const choices = await listOrderFilterChoices(user.id);
    if (!choices.departments.some((each) => each.id === order.departmentId)) {
      throw new AuthorizationError("not_found");
    }
  },
});
