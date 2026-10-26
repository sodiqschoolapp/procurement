import { describe, expect, it } from "vitest";

import { getPurchaseRegister } from "@/features/reports/queries/purchase-register";
import { getSpendingReport } from "@/features/reports/queries/spending-report";

import { bought, refreshNow, spendingScene } from "../../../../tests/helpers/analytics";
import { setClock } from "../../../../tests/helpers/clock";
import { insertUser } from "../../../../tests/helpers/users";
import { NO_ANALYTICS_FILTERS, type PeriodInput } from "../period-params";

import { getHeadSpending } from "./head-spending";
import { getStatusOrders } from "./status-orders";

// An order without a department or a needed-by date in analytics and reports (05 Fields the Head
// sets 3: "reports by department leave it out"; build plan 2.5d, Build 5; plan of 2.5d, review
// correction 3: counted in every total, left out of the split by department, as 05 reads on
// main). A value the task reads in a new way is tested at every reader of it (D46): the refresh,
// the Head's spending, the order list behind a count, the purchase register, the spending report.

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
  it("the refresh takes it; the Head's spending counts it in the total and leaves it out of the departments", async () => {
    const { spending, head } = await scene();
    const block = await getHeadSpending(head.id, THIS_MONTH, {
      ...NO_ANALYTICS_FILTERS,
      branch: spending.branch.id,
    });
    expect(block.total.amount).toBe(13_000n);
    expect(block.departments.map((row) => [row.id, row.amount])).toEqual([
      [spending.department.id, 10_000n],
    ]);
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

  it("the purchase register holds its record; the spending report counts it in the total, not by department", async () => {
    const { spending, head, bare } = await scene();
    const filters = { ...NO_ANALYTICS_FILTERS, branch: spending.branch.id };
    const register = await getPurchaseRegister(head.id, { range: MAY, filters }, "all");
    expect(register.rows).toHaveLength(2);
    expect(register.rows.find((row) => row.purchaseId === bare.purchaseId)).toMatchObject({
      departmentName: null,
    });
    const report = await getSpendingReport(head.id, { range: MAY, filters });
    expect(report.total).toBe(13_000n);
    expect(report.departments.map((row) => row.amount)).toEqual([10_000n]);
  });
});
