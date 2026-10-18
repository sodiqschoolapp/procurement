import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AuthorizationError } from "@/server/authorize";

import {
  type SpendingScene,
  bought,
  decided,
  refreshNow,
  spendingScene,
  stockDocument,
  stocked,
} from "../../../../tests/helpers/analytics";
import { setClock } from "../../../../tests/helpers/clock";
import { insertUser } from "../../../../tests/helpers/users";
import { type AnalyticsFilters, NO_ANALYTICS_FILTERS, type PeriodInput } from "../period-params";

import { getHeadSpending } from "./head-spending";
import { getMyApprovals } from "./my-approvals";
import { getOrderStatuses } from "./order-statuses";
import { getSpending } from "./spending";
import { getTopProducts } from "./top-products";
import { getWarehouse } from "./warehouse";

// Build-plan 6.5a, Done when: "A database test: the Principal's page holds only the Principal's
// branch" (10-notifications-analytics-reports.md, Analytics page per role, "Principal, own
// branch"; 03-roles-and-permissions.md rule 1 and Permission matrix, "See orders, stock and
// reports": Principal, own branch; developer-rules.md rule 4). Two branches hold the same scene;
// every number of the Principal's four blocks counts the Principal's branch only, so a number
// that let the other branch in would be twice the one worked by hand below. 15 October 2031 in
// Tashkent: this month is October, the period before September.

const THIS_MONTH: PeriodInput = { choice: "this_month", from: null, to: null };
const TODAY = "2031-10-15T05:00:00Z";

/** One branch's scene; every number of the test is worked from it by hand. */
async function branchScene(scene: SpendingScene, head: string, principal: string) {
  setClock(TODAY);
  // Spending: 2 × 10 000 bought on 3 October, its order Open with buying Done (not overdue).
  const record = await bought(scene, {
    purchasedOn: "2031-10-03",
    qty: "2",
    unitPrice: "10000",
    progress: "DONE",
  });
  // Waiting for Principal since 10 October 06:00 (5 days: the "week" group), needed by 18
  // October: coming up.
  await decided(
    scene,
    "PENDING_PRINCIPAL",
    [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-10-10T05:00:00Z" },
      {
        type: "APPROVE",
        from: "PENDING_HEAD",
        to: "PENDING_PRINCIPAL",
        at: "2031-10-10T06:00:00Z",
        actorId: head,
      },
    ],
    { submittedAt: "2031-10-10T05:00:00Z", neededBy: "2031-10-18" },
  );
  // Decided by the branch's Principal in 2 hours on 1 October, needed by 30 November.
  await decided(
    scene,
    "PENDING_FINANCE",
    [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-10-01T05:00:00Z" },
      {
        type: "APPROVE",
        from: "PENDING_HEAD",
        to: "PENDING_PRINCIPAL",
        at: "2031-10-01T06:00:00Z",
        actorId: head,
      },
      {
        type: "APPROVE",
        from: "PENDING_PRINCIPAL",
        to: "PENDING_FINANCE",
        at: "2031-10-01T08:00:00Z",
        actorId: principal,
      },
    ],
    { submittedAt: "2031-10-01T05:00:00Z", neededBy: "2031-11-30" },
  );
  // Submitted in September, Sent back, needed by 1 October: overdue.
  await decided(scene, "RETURNED", [], {
    submittedAt: "2031-09-20T05:00:00Z",
    neededBy: "2031-10-01",
  });
  // Stock: 5 × 1 000 with a minimum of 5, one issued on 4 October: 4 left, 4 000, Low.
  const item = await stocked(scene, { qty: "5", unitCost: 1_000n, minimum: "5" });
  await stockDocument(scene, {
    type: "ISSUE",
    docDate: "2031-10-04",
    lines: [{ variantId: item, qty: "1" }],
  });
  return { record };
}

let a: SpendingScene;
let b: SpendingScene;
let principal: string;
let productOfA: string;

beforeAll(async () => {
  setClock(TODAY);
  const head = (await insertUser("HEAD")).id;
  a = await spendingScene();
  b = await spendingScene();
  principal = (await insertUser("PRINCIPAL", { branches: [a.branch.id] })).id;
  const otherPrincipal = (await insertUser("PRINCIPAL", { branches: [b.branch.id] })).id;
  productOfA = (await branchScene(a, head, principal)).record.productId;
  await branchScene(b, head, otherPrincipal);
  await refreshNow();
});

// The clock is set again for each test: the test setup puts it back.
beforeEach(() => setClock(TODAY));

describe("the Principal's page holds only the Principal's branch (build-plan 6.5a, Done when; 03 rule 1)", () => {
  const all: AnalyticsFilters = NO_ANALYTICS_FILTERS;

  it("Spending: the total, the months, the categories, the departments and the top products", async () => {
    const spending = await getSpending(principal, THIS_MONTH, all);
    expect(spending.total.amount).toBe(20_000n);
    expect(spending.months.map((month) => month.amount)).toEqual([20_000n]);
    expect(spending.categories.map((row) => [row.id, row.amount])).toEqual([
      [a.category.id, 20_000n],
    ]);
    const head = await getHeadSpending(principal, THIS_MONTH, all);
    expect(head.departments.map((row) => [row.id, row.amount])).toEqual([
      [a.department.id, 20_000n],
    ]);
    const top = await getTopProducts(principal, THIS_MONTH, all);
    expect(top.total.amount).toBe(20_000n);
    expect(top.products.map((row) => [row.id, row.amount])).toEqual([[productOfA, 20_000n]]);
  });

  it("Orders: by status of October, coming up and overdue", async () => {
    const orders = await getOrderStatuses(principal, THIS_MONTH, all);
    expect(orders.statuses.map((row) => [row.status, row.count])).toEqual([
      ["PENDING_PRINCIPAL", 1],
      ["PENDING_FINANCE", 1],
      // Submitted in September: counted in the period before only (decided item 2).
      ["RETURNED", 0],
      ["PURCHASING", 1],
    ]);
    expect(orders.total.count).toBe(3);
    expect(orders.comingUp).toBe(1);
    expect(orders.overdue).toBe(1);
  });

  it("My approvals: one waiting now, my 2 hours", async () => {
    const mine = await getMyApprovals(principal, THIS_MONTH, all);
    expect(mine.waiting).toEqual({ day: 0, twoDays: 0, week: 1, older: 0, all: 1 });
    expect(mine.mine).toMatchObject({ hours: "2.0", count: 1 });
  });

  it("Warehouse: the stock value, the Low lines and the department's use", async () => {
    const warehouse = await getWarehouse(principal, THIS_MONTH, all);
    expect(warehouse.branches.map((row) => [row.id, row.value, row.low])).toEqual([
      [a.branch.id, 4_000n, 1],
    ]);
    expect(warehouse.departments.map((row) => [row.id, row.used])).toEqual([
      [a.department.id, 1_000n],
    ]);
  });

  it("the other branch, named in the branch filter, is Not found in every block", async () => {
    const other: AnalyticsFilters = { ...all, branch: b.branch.id };
    for (const read of [
      getSpending,
      getHeadSpending,
      getTopProducts,
      getOrderStatuses,
      getMyApprovals,
      getWarehouse,
    ]) {
      await expect(read(principal, THIS_MONTH, other)).rejects.toMatchObject({
        constructor: AuthorizationError,
        kind: "not_found",
      });
    }
  });
});
