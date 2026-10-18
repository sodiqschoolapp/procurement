import { expect } from "vitest";

import { AuthorizationError } from "@/server/authorize";

import { bought, refreshNow, spendingScene } from "../../../../tests/helpers/analytics";
import { setClock } from "../../../../tests/helpers/clock";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { NO_ANALYTICS_FILTERS, type PeriodInput } from "../period-params";

import { getAnalyticsFilters } from "./filters";
import { getSpending } from "./spending";
import { getSpendingRecords } from "./spending-records";

// The Analytics queries in the permission matrix (15-quality-and-acceptance.md, Test layers: "each
// action × each role × own branch and other branch"; 03-roles-and-permissions.md, Permission
// matrix "See requests, stock and reports"; rule 1: another branch is "Not found"; build-plan 6.3).
// Each is asked with the branch filter (authorize()) and without it (the wall in the SQL): a
// number that leaves the branch's record out answers "not_found" here.

const THIS_MONTH: PeriodInput = { choice: "this_month", from: null, to: null };

/** A record of 12 345 so'm bought this month in the branch, and the summary refreshed. */
async function recordIn(branchId: string) {
  setClock("2031-05-15T05:00:00Z");
  const scene = await spendingScene(branchId);
  const record = await bought(scene, { purchasedOn: "2031-05-02", unitPrice: "12345" });
  await refreshNow();
  return record;
}

describePermissionMatrix("getSpending with the branch filter", {
  permission: "data.view",
  async run({ user, branchId }) {
    await recordIn(branchId);
    const block = await getSpending(user.id, THIS_MONTH, {
      ...NO_ANALYTICS_FILTERS,
      branch: branchId,
    });
    expect(block.total.amount).toBe(12_345n);
  },
});

describePermissionMatrix("getSpending, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const record = await recordIn(branchId);
    const list = await getSpendingRecords(
      user.id,
      THIS_MONTH,
      NO_ANALYTICS_FILTERS,
      { kind: "period" },
      "all",
    );
    const block = await getSpending(user.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    // The number and its list keep to the same wall.
    expect(block.total.amount).toBe(list.total);
    if (!list.rows.some((row) => row.purchaseId === record.purchaseId)) {
      throw new AuthorizationError("not_found");
    }
  },
});

describePermissionMatrix("getSpendingRecords with the branch filter", {
  permission: "data.view",
  async run({ user, branchId }) {
    const record = await recordIn(branchId);
    const list = await getSpendingRecords(
      user.id,
      THIS_MONTH,
      { ...NO_ANALYTICS_FILTERS, branch: branchId },
      { kind: "period" },
      1,
    );
    expect(list.rows.map((row) => row.purchaseId)).toEqual([record.purchaseId]);
  },
});

describePermissionMatrix("getAnalyticsFilters, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const scene = await spendingScene(branchId);
    const options = await getAnalyticsFilters(user.id);
    const listed =
      options.branches.some((branch) => branch.id === branchId) &&
      options.departments.some((department) => department.id === scene.department.id) &&
      options.managers.some((manager) => manager.id === scene.manager.id);
    if (!listed) {
      // None of the three is listed when one is not: the same wall for all.
      expect(options.branches.some((branch) => branch.id === branchId)).toBe(false);
      expect(options.departments.some((each) => each.id === scene.department.id)).toBe(false);
      expect(options.managers.some((manager) => manager.id === scene.manager.id)).toBe(false);
      throw new AuthorizationError("not_found");
    }
  },
});
