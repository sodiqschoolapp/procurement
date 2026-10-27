import { describe, expect, it } from "vitest";

import { getPurchaseRegister } from "@/features/reports/queries/purchase-register";
import { getSpendingReport } from "@/features/reports/queries/spending-report";

import { bought, refreshNow, spendingScene } from "../../../../tests/helpers/analytics";
import { setClock } from "../../../../tests/helpers/clock";
import { insertUser } from "../../../../tests/helpers/users";
import { NO_ANALYTICS_FILTERS, NO_DEPARTMENT, type PeriodInput } from "../period-params";

import { getHeadSpending } from "./head-spending";
import { getSpendingRecords } from "./spending-records";
import { getStatusOrders } from "./status-orders";

// An order without a department or a needed-by date in analytics and reports (05 Fields the Head
// sets 3; build plan 2.5d-a, Build 5). Counted in every total, and since D68 (task 2.5d-c) shown
// under "No department" in the splits by department, so they add up: the two tests that read it
// left out of the split (2.5d-a, as 05 read then) are changed with that reason (a changed
// requirement, plan of 2.5d-c). A value the task reads in a new way is tested at every reader of
// it (D46): the refresh, the Head's and the Principal's spending, the records behind its line, the
// order list behind a count, the purchase register, the spending report.

const THIS_MONTH: PeriodInput = { choice: "this_month", from: null, to: null };
const MAY = { first: "2031-05-01", last: "2031-05-31" };

async function scene() {
  setClock("2031-05-15T05:00:00Z");
  const spending = await spendingScene();
  const head = await insertUser("HEAD");
  // 10 000 for the scene's department; 3 000 for an order without a department or a date.
  const withDepartment = await bought(spending, {
    purchasedOn: "2031-05-02",
    qty: "10.000",
    unitPrice: "1000",
  });
  const bare = await bought(spending, {
    purchasedOn: "2031-05-03",
    qty: "3.000",
    unitPrice: "1000",
    departmentId: null,
    neededBy: null,
  });
  await refreshNow();
  return { spending, head, withDepartment, bare };
}

describe("analytics and reports with an order without a department or a needed-by date (05 Fields the Head sets 3)", () => {
  it("the refresh takes it; the Head's spending shows it under No department, and the departments add up to the total (D68)", async () => {
    const { spending, head } = await scene();
    const block = await getHeadSpending(head.id, THIS_MONTH, {
      ...NO_ANALYTICS_FILTERS,
      branch: spending.branch.id,
    });
    expect(block.total.amount).toBe(13_000n);
    expect(block.departments.map((row) => [row.id, row.name, row.branchName, row.amount])).toEqual([
      [spending.department.id, expect.any(String), expect.any(String), 10_000n],
      [null, null, null, 3_000n],
    ]);
    const sum = block.departments.reduce((total, row) => total + row.amount, 0n);
    expect(sum).toBe(block.total.amount);
  });

  it("the Principal's spending by department reads the same No department line (D68)", async () => {
    const { spending } = await scene();
    const principal = await insertUser("PRINCIPAL", { branches: [spending.branch.id] });
    const block = await getHeadSpending(principal.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    expect(block.departments.find((row) => row.id === null)?.amount).toBe(3_000n);
    expect(block.departments.reduce((total, row) => total + row.amount, 0n)).toBe(13_000n);
  });

  it("its line opens its records: department=none lists the order without a department alone (10 Analytics point 3; D68)", async () => {
    const { spending, head, bare, withDepartment } = await scene();
    const none = await getSpendingRecords(
      head.id,
      THIS_MONTH,
      { ...NO_ANALYTICS_FILTERS, branch: spending.branch.id, department: NO_DEPARTMENT },
      { kind: "period" },
      "all",
    );
    expect(none.rows.map((row) => row.purchaseId)).toEqual([bare.purchaseId]);
    expect(none.total).toBe(3_000n);
    // A department's own line still lists its records alone.
    const own = await getSpendingRecords(
      head.id,
      THIS_MONTH,
      { ...NO_ANALYTICS_FILTERS, department: spending.department.id },
      { kind: "period" },
      "all",
    );
    expect(own.rows.map((row) => row.purchaseId)).toEqual([withDepartment.purchaseId]);
  });

  it("the order list behind the count lists it, with no department and no date", async () => {
    const { spending, head, bare } = await scene();
    const list = await getStatusOrders(
      head.id,
      THIS_MONTH,
      { ...NO_ANALYTICS_FILTERS, branch: spending.branch.id },
      { kind: "status", status: null },
      "all",
    );
    expect(list.count).toBe(2);
    expect(list.rows).toHaveLength(2);
    expect(list.rows.find((row) => row.orderId === bare.orderId)).toMatchObject({
      departmentName: null,
      neededBy: null,
      overdue: false,
    });
  });

  it("the purchase register holds its record; the spending report shows it under No department, last, and adds up (D68)", async () => {
    const { spending, head, bare } = await scene();
    const filters = { ...NO_ANALYTICS_FILTERS, branch: spending.branch.id };
    const register = await getPurchaseRegister(head.id, { range: MAY, filters }, "all");
    expect(register.rows).toHaveLength(2);
    expect(register.rows.find((row) => row.purchaseId === bare.purchaseId)).toMatchObject({
      departmentName: null,
    });
    const report = await getSpendingReport(head.id, { range: MAY, filters });
    expect(report.total).toBe(13_000n);
    expect(report.departments.map((row) => [row.id, row.branchName, row.amount])).toEqual([
      [spending.department.id, expect.any(String), 10_000n],
      [null, null, 3_000n],
    ]);
  });
});

describe("the branch wall holds for an order without a department (03 rule 1; permission review of 2.5d)", () => {
  it("a Principal of another branch, no branch filter: it is in no row and no count", async () => {
    const { bare } = await scene();
    const elsewhere = await spendingScene();
    const principal = await insertUser("PRINCIPAL", { branches: [elsewhere.branch.id] });
    const list = await getStatusOrders(
      principal.id,
      THIS_MONTH,
      NO_ANALYTICS_FILTERS,
      { kind: "status", status: null },
      "all",
    );
    expect(list.count).toBe(0);
    expect(list.rows.map((row) => row.orderId)).not.toContain(bare.orderId);
    const register = await getPurchaseRegister(
      principal.id,
      { range: MAY, filters: NO_ANALYTICS_FILTERS },
      "all",
    );
    expect(register.rows.map((row) => row.purchaseId)).not.toContain(bare.purchaseId);
    expect(register.rows).toEqual([]);
  });
});
