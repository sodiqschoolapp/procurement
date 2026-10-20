import { describe, expect, it } from "vitest";

import { orderDownload, orderTotalsOnFilter } from "@/features/orders/queries/order-list";
import { AuthorizationError } from "@/server/authorize";

import {
  bought,
  buyingEvent,
  decided,
  moneyOn,
  refreshNow,
  spendingScene,
  stockDocument,
  stocked,
} from "../../../../tests/helpers/analytics";
import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertOrder } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { NO_ANALYTICS_FILTERS } from "../../analytics/period-params";
import { orderListFilters } from "../report-params";

import { getApprovalSpeedReport } from "./approval-speed-report";
import { getDepartmentUseReport } from "./department-use-report";
import { getMoneyWithManagersReport } from "./money-with-managers-report";
import { getPlanVsActualReport } from "./plan-vs-actual-report";
import { getPriceHistoryReport } from "./price-history-report";
import { getPurchaseRegister } from "./purchase-register";
import { getSpendingReport } from "./spending-report";
import { getStockMovementsReport } from "./stock-movements-report";
import { getStockReport } from "./stock-report";

// The branch wall on each report of 6.8, 6.9a and 6.9b (build-plan 6.8, Done when: "A database test
// for the branch wall on each report"; build-plan 6.9a and 6.9b, Done when: "the branch wall on
// each of the three reports"; Money with managers under `money.managers`, the Head and Finance
// only, since the spec change of 20.10.2026 (D55 item 22; plan of 2.3b, decided items 4 and 5,
// which replace decided item 1 of 6.9b); 15-quality-and-acceptance.md, Test layers: "each action × each role
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

/**
 * Stock of the branch: 4 received in May at 1 000, 1 of it issued to its department on 3 May
 * (6.9a), the summary refreshed.
 */
async function stockIn(branchId: string) {
  setClock("2031-05-15T05:00:00Z");
  const scene = await spendingScene(branchId);
  const variantId = await stocked(scene, { qty: "4", unitCost: 1_000n });
  const documentId = await stockDocument(scene, {
    type: "ISSUE",
    docDate: "2031-05-03",
    lines: [{ variantId, qty: "1" }],
  });
  await refreshNow();
  return { scene, variantId, documentId };
}

describePermissionMatrix("Stock on hand with the branch filter", {
  permission: "data.view",
  async run({ user, branchId }) {
    const { variantId } = await stockIn(branchId);
    const report = await getStockReport(user.id, params(branchId), "all");
    expect(report.lines.map((row) => row.variantId)).toEqual([variantId]);
    expect(report.branches.map((row) => [row.id, row.value, row.purchases])).toEqual([
      [branchId, 3_000n, 4_000n],
    ]);
  },
});

describePermissionMatrix("Stock on hand, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const { variantId } = await stockIn(branchId);
    const report = await getStockReport(user.id, params(null), "all");
    // The totals keep to the same wall as the lines.
    expect(report.all.value).toBe(report.lines.reduce((sum, row) => sum + row.value, 0n));
    expect(report.all.purchases).toBe(
      report.branches.reduce((sum, row) => sum + row.purchases, 0n),
    );
    expect(new Set(report.lines.map((row) => row.branchId))).toEqual(
      new Set(report.branches.filter((row) => row.value > 0n).map((row) => row.id)),
    );
    if (!report.lines.some((row) => row.branchId === branchId && row.variantId === variantId)) {
      throw new AuthorizationError("not_found");
    }
  },
});

describePermissionMatrix("Stock movements with the branch filter", {
  permission: "data.view",
  async run({ user, branchId }) {
    const { documentId } = await stockIn(branchId);
    const report = await getStockMovementsReport(user.id, params(branchId), "all");
    expect(report.rows.map((row) => [row.type, row.documentId])).toEqual([
      // Newest first: received on 15 May, issued on 3 May.
      ["RECEIPT", null],
      ["ISSUE", documentId],
    ]);
  },
});

describePermissionMatrix("Stock movements, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const { documentId } = await stockIn(branchId);
    const report = await getStockMovementsReport(user.id, params(null), "all");
    expect(report.count).toBe(report.rows.length);
    if (!report.rows.some((row) => row.documentId === documentId)) {
      throw new AuthorizationError("not_found");
    }
  },
});

describePermissionMatrix("Use by department with the branch filter", {
  permission: "data.view",
  async run({ user, branchId }) {
    const { scene } = await stockIn(branchId);
    const report = await getDepartmentUseReport(user.id, params(branchId), "all");
    expect(report.departments.map((row) => [row.id, row.value])).toEqual([
      [scene.department.id, 1_000n],
    ]);
  },
});

describePermissionMatrix("Use by department, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const { scene } = await stockIn(branchId);
    const report = await getDepartmentUseReport(user.id, params(null), "all");
    // The total and the lines keep to the same wall as the departments.
    expect(report.total).toBe(report.departments.reduce((sum, row) => sum + row.value, 0n));
    expect(report.total).toBe(report.lines.reduce((sum, row) => sum + row.value, 0n));
    if (!report.departments.some((row) => row.id === scene.department.id)) {
      throw new AuthorizationError("not_found");
    }
  },
});

/** A record of 12 345 so'm bought on 2 May in the branch (6.9b, Price history). */
async function pricedIn(branchId: string) {
  setClock("2031-05-15T05:00:00Z");
  const scene = await spendingScene(branchId);
  const record = await bought(scene, { purchasedOn: "2031-05-02", unitPrice: "12345" });
  await refreshNow();
  return record;
}

describePermissionMatrix("Price history with the branch filter", {
  permission: "data.view",
  async run({ user, branchId }) {
    const record = await pricedIn(branchId);
    const report = await getPriceHistoryReport(
      user.id,
      { ...params(branchId), variant: record.variantId },
      "all",
    );
    expect(report.points.map((row) => [row.purchaseId, row.unitPrice])).toEqual([
      [record.purchaseId, 12_345n],
    ]);
  },
});

describePermissionMatrix("Price history, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const record = await pricedIn(branchId);
    const report = await getPriceHistoryReport(
      user.id,
      { ...params(null), variant: record.variantId },
      "all",
    );
    expect(report.recordCount).toBe(report.points.length);
    if (!report.points.some((row) => row.purchaseId === record.purchaseId)) {
      throw new AuthorizationError("not_found");
    }
  },
});

/** An order of the branch holding 40 000 so'm given on 2 May (6.9b, Money with managers). */
async function cashIn(branchId: string) {
  setClock("2031-05-15T05:00:00Z");
  const scene = await spendingScene(branchId);
  const order = await bought(scene, { purchasedOn: "2031-05-02", unitPrice: "0" });
  await moneyOn(order, scene.manager.id, { amount: 40_000n, occurredOn: "2031-05-02" });
  await refreshNow();
  return order;
}

describePermissionMatrix("Money with managers with the branch filter", {
  permission: "money.managers",
  async run({ user, branchId }) {
    const order = await cashIn(branchId);
    const report = await getMoneyWithManagersReport(user.id, params(branchId), "all");
    expect(report.orders.map((row) => [row.id, row.cashCount])).toEqual([[order.orderId, 40_000n]]);
    expect([report.held, report.owed]).toEqual([40_000n, 0n]);
  },
});

// Without the branch filter the role answers first (authorizeList()), so the wall in the SQL is
// proved by hand: Finance sees its branch's cash and not the other branch's beside it (D40), the
// Head both, the Manager and the Principal are refused (plan of 2.3b, decided items 4 and 5).
describe("Money with managers, the branch wall in the SQL (03 matrix; D55 item 22)", () => {
  it("Finance of A: A's cash only; the Head: A's and B's; the Manager and the Principal of A: forbidden", async () => {
    const a = await insertBranch();
    const inA = await cashIn(a.id);
    const inB = await cashIn((await insertBranch()).id);
    const finance = await insertUser("FINANCE", { branches: [a.id] });
    const head = await insertUser("HEAD");
    const ids = async (userId: string) => {
      const report = await getMoneyWithManagersReport(userId, params(null), "all");
      // The owners and the totals keep to the same wall as the orders.
      const held = report.orders.reduce(
        (sum, row) => sum + (row.cashCount > 0n ? row.cashCount : 0n),
        0n,
      );
      expect(report.held).toBe(held);
      expect(report.owners.reduce((sum, row) => sum + row.held, 0n)).toBe(held);
      expect(report.ages.reduce((sum, row) => sum + row.held, 0n)).toBe(held);
      return report.orders.map((row) => row.id);
    };
    const financeSees = await ids(finance.id);
    expect(financeSees).toContain(inA.orderId);
    expect(financeSees).not.toContain(inB.orderId);
    expect(await ids(head.id)).toEqual(expect.arrayContaining([inA.orderId, inB.orderId]));
    for (const role of ["MANAGER", "PRINCIPAL"] as const) {
      const user = await insertUser(role, { branches: [a.id] });
      await expect(
        getMoneyWithManagersReport(user.id, params(null), "all"),
        role,
      ).rejects.toBeInstanceOf(AuthorizationError);
    }
  });
});

/** An order of the branch that waited 3 hours at the Principal step on 2 May (6.9b, Approval speed). */
async function decidedIn(branchId: string) {
  setClock("2031-05-15T05:00:00Z");
  const scene = await spendingScene(branchId);
  const order = await decided(scene, "PENDING_FINANCE", [
    { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-05-02T03:00:00Z" },
    { type: "APPROVE", from: "PENDING_HEAD", to: "PENDING_PRINCIPAL", at: "2031-05-02T04:00:00Z" },
    {
      type: "APPROVE",
      from: "PENDING_PRINCIPAL",
      to: "PENDING_FINANCE",
      at: "2031-05-02T07:00:00Z",
    },
  ]);
  await refreshNow();
  return order;
}

describePermissionMatrix("Approval speed with the branch filter", {
  permission: "data.view",
  async run({ user, branchId }) {
    const order = await decidedIn(branchId);
    const report = await getApprovalSpeedReport(user.id, params(branchId), "all");
    expect(report.branches.map((row) => row.branchId)).toEqual([branchId]);
    expect(report.all.PENDING_PRINCIPAL).toEqual({ hours: "3.0", count: 1 });
    expect(new Set(report.stays.map((row) => row.orderId))).toEqual(new Set([order.id]));
  },
});

describePermissionMatrix("Approval speed, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const order = await decidedIn(branchId);
    const report = await getApprovalSpeedReport(user.id, params(null), "all");
    // The All row keeps to the same wall as the branch rows and the stays.
    const counted = report.branches.reduce(
      (sum, row) => sum + row.steps.PENDING_PRINCIPAL.count,
      0,
    );
    expect(report.all.PENDING_PRINCIPAL.count).toBe(counted);
    expect(report.stays.filter((row) => row.step === "PENDING_PRINCIPAL")).toHaveLength(counted);
    if (!report.stays.some((row) => row.orderId === order.id)) {
      throw new AuthorizationError("not_found");
    }
  },
});
