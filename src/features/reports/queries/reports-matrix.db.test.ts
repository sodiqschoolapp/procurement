import { expect } from "vitest";

import { orderDownload, orderTotalsOnFilter } from "@/features/orders/queries/order-list";
import { AuthorizationError } from "@/server/authorize";

import {
  bought,
  buyingEvent,
  refreshNow,
  spendingScene,
} from "../../../../tests/helpers/analytics";
import { setClock } from "../../../../tests/helpers/clock";
import { insertOrder } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { NO_ANALYTICS_FILTERS } from "../../analytics/period-params";
import { orderListFilters } from "../report-params";

import { getPlanVsActualReport } from "./plan-vs-actual-report";
import { getPurchaseRegister } from "./purchase-register";
import { getSpendingReport } from "./spending-report";

// The branch wall on each report of 6.8 (build-plan 6.8, Done when: "A database test for the
// branch wall on each report"; 15-quality-and-acceptance.md, Test layers: "each action × each role
// × own branch and other branch", and S7: "The same holds for stock and reports";
// 03-roles-and-permissions.md, Permission matrix "Export to Excel, download PDF, print": every
// role, for what the role can see; rule 1: another branch is "Not found"). Each report is asked
// with the branch filter (authorize()) and without it (the wall inside the SQL, its totals
// asserted with its rows): a report that leaves the branch's row out answers "not_found" here.
// The reports have no department or Manager filter (plan of 6.8, decided item 6), so the third way
// of .claude/rules/tests.md does not apply. The Order register is the order list's own
// orderTotalsOnFilter() and orderDownload() under the report's filters (decided items 7 and 11).

const MAY = { first: "2031-05-01", last: "2031-05-15" };
const params = (branch: string | null) => ({
  range: MAY,
  filters: { ...NO_ANALYTICS_FILTERS, branch },
});

/** A record of 12 345 so'm bought in May in the branch, its order Done, the summary refreshed. */
async function boughtIn(branchId: string) {
  setClock("2031-05-15T05:00:00Z");
  const scene = await spendingScene(branchId);
  const record = await bought(scene, {
    purchasedOn: "2031-05-02",
    unitPrice: "12345",
    plannedQty: "1",
    plannedPrice: 12_000n,
    progress: "DONE",
  });
  await buyingEvent(record.orderId, record.ownerId, "RECORD_PURCHASE", "2031-05-02T05:00:00Z");
  await refreshNow();
  return record;
}

describePermissionMatrix("Purchase register with the branch filter", {
  permission: "data.view",
  async run({ user, branchId }) {
    const record = await boughtIn(branchId);
    const register = await getPurchaseRegister(user.id, params(branchId), "all");
    expect(register.rows.map((row) => row.purchaseId)).toEqual([record.purchaseId]);
    expect(register.total).toBe(12_345n);
  },
});

describePermissionMatrix("Purchase register, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const record = await boughtIn(branchId);
    const register = await getPurchaseRegister(user.id, params(null), "all");
    const row = register.rows.find((each) => each.purchaseId === record.purchaseId);
    // The total keeps to the same wall as the rows.
    const counted = register.rows.filter((each) => each.cancelReason === null);
    expect(register.total).toBe(counted.reduce((sum, each) => sum + each.total, 0n));
    if (!row) throw new AuthorizationError("not_found");
  },
});

describePermissionMatrix("Planned vs actual with the branch filter", {
  permission: "data.view",
  async run({ user, branchId }) {
    const record = await boughtIn(branchId);
    const report = await getPlanVsActualReport(user.id, params(branchId), "all");
    expect(report.orders.map((row) => row.orderId)).toEqual([record.orderId]);
    expect(report.total.difference).toBe(-345n);
  },
});

describePermissionMatrix("Planned vs actual, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const record = await boughtIn(branchId);
    const report = await getPlanVsActualReport(user.id, params(null), "all");
    expect(report.total.orders).toBe(report.orders.length);
    expect(report.total.actual).toBe(report.orders.reduce((sum, row) => sum + row.actual, 0n));
    // Every table keeps to the same wall (permission review of 6.8, Should fix 2).
    for (const table of [report.products, report.managers]) {
      expect(table.reduce((sum, row) => sum + row.actual, 0n)).toBe(report.total.actual);
    }
    if (!report.orders.some((row) => row.orderId === record.orderId)) {
      throw new AuthorizationError("not_found");
    }
  },
});

describePermissionMatrix("Spending with the branch filter", {
  permission: "data.view",
  async run({ user, branchId }) {
    await boughtIn(branchId);
    const report = await getSpendingReport(user.id, params(branchId));
    expect(report.total).toBe(12_345n);
    expect(report.branches.map((row) => row.id)).toEqual([branchId]);
  },
});

describePermissionMatrix("Spending, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    await boughtIn(branchId);
    const report = await getSpendingReport(user.id, params(null));
    // The total keeps to the same wall as its branches.
    for (const table of [
      report.branches,
      report.categories,
      report.departments,
      report.suppliers,
      report.months,
    ]) {
      expect(table.reduce((sum, row) => sum + row.amount, 0n)).toBe(report.total);
    }
    if (!report.branches.some((row) => row.id === branchId)) {
      throw new AuthorizationError("not_found");
    }
  },
});

/** An order of the branch submitted in May, as the Order register lists it. */
async function submittedIn(branchId: string) {
  setClock("2031-05-15T05:00:00Z");
  const owner = await insertUser("MANAGER", { branches: [branchId] });
  return insertOrder({
    branchId,
    ownerId: owner.id,
    status: "PENDING_HEAD",
    submittedAt: new Date("2031-05-03T05:00:00Z"),
  });
}

describePermissionMatrix("Order register with the branch filter", {
  permission: "data.view",
  async run({ user, branchId }) {
    await submittedIn(branchId);
    const register = await orderTotalsOnFilter(user.id, orderListFilters(params(branchId)));
    expect(register.count).toBe(1);
  },
});

describePermissionMatrix("Order register, the branch wall in the SQL", {
  permission: "data.export",
  async run({ user, branchId }) {
    const order = await submittedIn(branchId);
    const file = await orderDownload(user.id, orderListFilters(params(null)));
    const totals = await orderTotalsOnFilter(user.id, orderListFilters(params(null)));
    // The count beside the file keeps to the same wall.
    expect(totals.count).toBe(file.orders.length);
    if (!file.orders.some((each) => each.id === order.id)) {
      throw new AuthorizationError("not_found");
    }
  },
});
