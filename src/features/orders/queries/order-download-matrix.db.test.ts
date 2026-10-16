import { describe, expect, it } from "vitest";

import { AuthorizationError } from "@/server/authorize";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertOrder } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { NO_FILTERS } from "../list-filters";
import { orderDownload } from "./order-list";

// orderDownload in the permission matrix (15-quality-and-acceptance.md, Test layers: "each action
// × each role × own branch and other branch"; 03-roles-and-permissions.md, Permission matrix
// "Export to Excel, download PDF, print": every role, for what the role can see; rule 1: another
// branch is "Not found"; plan of 0.7, item 5; plan of 2.14, decided item 4, Look first). The walls
// are the list's own listWhere(): the branch wall and the draft wall inside the SQL
// (.claude/rules/server-actions.md; .claude/rules/tests.md, a test per wall).

async function waitingOrder(branchId: string) {
  const owner = await insertUser("MANAGER", { branches: [branchId] });
  return insertOrder({ branchId, ownerId: owner.id, status: "PENDING_HEAD" });
}

describePermissionMatrix("orderDownload", {
  permission: "data.export",
  async run({ user, branchId }) {
    const order = await waitingOrder(branchId);
    // With the branch filter: another branch is refused by authorize().
    const file = await orderDownload(user.id, { ...NO_FILTERS, branch: branchId });
    expect(file.orders.map((each) => each.id)).toEqual([order.id]);
  },
});

describePermissionMatrix("orderDownload, the branch wall in the SQL", {
  permission: "data.export",
  async run({ user, branchId }) {
    const order = await waitingOrder(branchId);
    const file = await orderDownload(user.id);
    if (!file.orders.some((each) => each.id === order.id))
      throw new AuthorizationError("not_found");
  },
});

describe("orderDownload, the draft wall and the names of the filter (decided item 4)", () => {
  it("never holds a Draft, numbered or not, even the downloader's own in its own branch", async () => {
    const branch = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const head = await insertUser("HEAD");
    const listed = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PENDING_HEAD",
    });
    // Own branch, own order, every filter value of the listed one: only the status differs.
    const draft = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      variantId: listed.variantId,
      departmentId: listed.departmentId,
    });
    const takenBack = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "DRAFT",
      number: "TBK-26-0001",
      variantId: listed.variantId,
      departmentId: listed.departmentId,
    });
    for (const reader of [manager, head]) {
      const ids = (await orderDownload(reader.id, { ...NO_FILTERS, branch: branch.id })).orders.map(
        (each) => each.id,
      );
      expect(ids).toContain(listed.id);
      expect(ids).not.toContain(draft.id);
      expect(ids).not.toContain(takenBack.id);
    }
  });

  // Each role with a branch wall (permission review of 2.14, Should fix 1).
  it.each(["MANAGER", "PRINCIPAL", "FINANCE"] as const)(
    "names an owner and a department of another branch '—' (null), and lists none of their orders: %s",
    async (role) => {
      const branch = await insertBranch();
      const otherBranch = await insertBranch();
      const manager = await insertUser(role, { branches: [branch.id] });
      const other = await waitingOrder(otherBranch.id);
      const own = await waitingOrder(branch.id);

      const byOwner = await orderDownload(manager.id, { ...NO_FILTERS, owner: other.ownerId });
      expect(byOwner.names.owner).toBeNull();
      expect(byOwner.orders).toEqual([]);
      const byDepartment = await orderDownload(manager.id, {
        ...NO_FILTERS,
        department: other.departmentId,
      });
      expect(byDepartment.names.department).toBeNull();
      expect(byDepartment.orders).toEqual([]);

      // The same filters on the reader's own branch are named.
      const ownOwner = await orderDownload(manager.id, { ...NO_FILTERS, owner: own.ownerId });
      expect(ownOwner.names.owner).not.toBeNull();
      expect(ownOwner.orders.map((each) => each.id)).toEqual([own.id]);
      const ownDepartment = await orderDownload(manager.id, {
        ...NO_FILTERS,
        department: own.departmentId,
      });
      expect(ownDepartment.names.department).toContain(branch.code);
    },
  );
});
