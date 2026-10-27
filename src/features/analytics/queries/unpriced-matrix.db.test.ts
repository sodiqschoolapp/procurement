import { describe, expect, it } from "vitest";

import { getPlanVsActualReport } from "@/features/reports/queries/plan-vs-actual-report";
import { getSpendingReport } from "@/features/reports/queries/spending-report";
import { AuthorizationError } from "@/server/authorize";

import {
  bought,
  buyingEvent,
  decided,
  refreshNow,
  spendingScene,
} from "../../../../tests/helpers/analytics";
import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import {
  type AnalyticsFilters,
  NO_ANALYTICS_FILTERS,
  NO_DEPARTMENT,
  type PeriodInput,
} from "../period-params";

import { getCashNeeded } from "./cash-needed";
import { getHeadSpending } from "./head-spending";
import { getManagers } from "./managers";
import { getMyEstimates } from "./my-estimates";
import { getNeededOrders } from "./needed-orders";
import { getOutcomeOrders } from "./outcome-orders";
import { getPlanVsActual } from "./plan-vs-actual";
import { getSpendingRecords } from "./spending-records";

// The queries task 2.5d-c changed, in the permission matrix (15-quality-and-acceptance.md, Test
// layers: "each action × each role × own branch and other branch"; 03-roles-and-permissions.md
// rule 1; .claude/rules/tests.md: every changed Analytics query three ways, with the branch filter,
// without it, and with a Manager id of the branch and no branch filter), and a fourth way, the
// department filter's `none` with no branch filter (plan of 2.5d-c, Tests): another branch's order
// without a department is never counted. Every order of the scene has no department, so `none`
// keeps each of them; a number that leaves the branch's order out answers "not_found" here, and
// each number is asserted beside the list that makes it up (the same wall).

const THIS_MONTH: PeriodInput = { choice: "this_month", from: null, to: null };
const MAY = { first: "2031-05-01", last: "2031-05-31" };

const WAYS = ["branch", "wall", "manager", "none"] as const;
type Way = (typeof WAYS)[number];
const WAY_NAMES: Record<Way, string> = {
  branch: "with the branch filter",
  wall: "the branch wall in the SQL",
  manager: "a Manager of the branch, no branch filter",
  none: "department=none, no branch filter",
};

/**
 * The branch's orders without a department: a record of 3 333 so'm, an order ended without a
 * planned price, and one without a planned price waiting for the Principal. `ownerId` owns the
 * records (the Manager's own estimates), the scene's Manager unless given.
 */
async function sceneIn(branchId: string, ownerId?: string) {
  setClock("2031-05-15T05:00:00Z");
  const scene = await spendingScene(branchId);
  const owner = ownerId ?? scene.manager.id;
  const bare = await bought(scene, {
    purchasedOn: "2031-05-02",
    unitPrice: "3333",
    departmentId: null,
    ownerId: owner,
  });
  const ended = await bought(scene, {
    purchasedOn: "2031-05-03",
    unitPrice: "4500",
    progress: "DONE",
    plannedPrice: null,
    departmentId: null,
    ownerId: owner,
  });
  await buyingEvent(ended.orderId, owner, "RECORD_PURCHASE", "2031-05-03T05:00:00Z");
  const waiting = await decided(scene, "PENDING_PRINCIPAL", [], {
    plannedPrice: null,
    departmentId: null,
    ownerId: owner,
  });
  await refreshNow();
  return { scene, bare, ended, waiting };
}

function filtersOf(way: Way, branchId: string, managerId: string): AnalyticsFilters {
  switch (way) {
    case "branch":
      return { ...NO_ANALYTICS_FILTERS, branch: branchId };
    case "wall":
      return NO_ANALYTICS_FILTERS;
    case "manager":
      return { ...NO_ANALYTICS_FILTERS, manager: managerId };
    case "none":
      return { ...NO_ANALYTICS_FILTERS, department: NO_DEPARTMENT };
  }
}

function counted(seen: boolean) {
  if (!seen) throw new AuthorizationError("not_found");
}

for (const way of WAYS) {
  describePermissionMatrix(
    `getHeadSpending's No department line and its records, ${WAY_NAMES[way]}`,
    {
      permission: "data.view",
      async run({ user, branchId }) {
        const { scene, bare } = await sceneIn(branchId);
        const filters = filtersOf(way, branchId, scene.manager.id);
        const block = await getHeadSpending(user.id, THIS_MONTH, filters);
        const records = await getSpendingRecords(
          user.id,
          THIS_MONTH,
          { ...filters, department: NO_DEPARTMENT },
          { kind: "period" },
          "all",
        );
        // The line and its records keep to the same wall; the lines add up to the total.
        expect(block.departments.find((row) => row.id === null)?.amount ?? 0n).toBe(records.total);
        expect(block.departments.reduce((sum, row) => sum + row.amount, 0n)).toBe(
          block.total.amount,
        );
        counted(records.rows.some((row) => row.purchaseId === bare.purchaseId));
      },
    },
  );

  describePermissionMatrix(`getPlanVsActual's unpriced count and its list, ${WAY_NAMES[way]}`, {
    permission: "data.view",
    async run({ user, branchId }) {
      const { scene, ended } = await sceneIn(branchId);
      const filters = filtersOf(way, branchId, scene.manager.id);
      const block = await getPlanVsActual(user.id, THIS_MONTH, filters);
      const list = await getOutcomeOrders(
        user.id,
        THIS_MONTH,
        filters,
        { kind: "unpriced" },
        false,
        "all",
      );
      expect(block.total.unpriced.count).toBe(list.count);
      // The branch and Manager lines keep to the same wall (permission review, Should fix 2).
      const branchLine = block.branches.find((row) => row.id === branchId);
      const managerLine = block.managers.find((row) => row.id === scene.manager.id);
      const seen = list.rows.some((row) => row.orderId === ended.orderId);
      expect(branchLine?.unpriced.count ?? 0, "branch line").toBe(seen ? 1 : 0);
      expect(managerLine?.unpriced.count ?? 0, "Manager line").toBe(seen ? 1 : 0);
      if (way === "branch") expect(block.branches.map((row) => row.id)).toEqual([branchId]);
      counted(seen);
    },
  });

  describePermissionMatrix(`getCashNeeded's unpriced count and its list, ${WAY_NAMES[way]}`, {
    permission: "data.view",
    async run({ user, branchId }) {
      const { scene, waiting } = await sceneIn(branchId);
      const filters = filtersOf(way, branchId, scene.manager.id);
      const block = await getCashNeeded(user.id, filters);
      const list = await getNeededOrders(user.id, filters, "approval", null, "all", true);
      expect(block.approval.unpriced).toBe(list.count);
      counted(list.rows.some((row) => row.orderId === waiting.id));
    },
  });
}

// My estimates' Manager filter is always the user's own (mineOf(); plan of 6.5b): its third way
// is the department filter, here `none`. The Managers block is `money.managers` for the whole list
// (decideList(), a refusal before any branch is read): it is asked with a branch or a Manager of
// one, as its matrix of 6.4c, and its wall in the SQL by the test at the end of this file.
for (const way of ["branch", "wall", "none"] as const) {
  describePermissionMatrix(`getMyEstimates' unpriced count and its records, ${WAY_NAMES[way]}`, {
    permission: "data.view",
    async run({ user, branchId }) {
      const { ended } = await sceneIn(branchId, user.id);
      // The Manager filter of My estimates is the user's own (mineOf()).
      const filters = filtersOf(way, branchId, user.id);
      const block = await getMyEstimates(user.id, THIS_MONTH, filters);
      const list = await getSpendingRecords(
        user.id,
        THIS_MONTH,
        filters,
        { kind: "priced", product: null, unpriced: true },
        "all",
      );
      // With the branch filter the list holds this case's records alone, all the user's own.
      if (way === "branch") expect(block.all.unpriced.count).toBe(list.count);
      // The user's own records of orders without a planned price are this case's one record:
      // the count holds it exactly where the list does (permission review, Must fix 2).
      const seen = list.rows.some((row) => row.purchaseId === ended.purchaseId);
      expect(block.all.unpriced.count).toBe(seen ? 1 : 0);
      counted(seen);
    },
  });
}

for (const way of ["branch", "manager"] as const) {
  describePermissionMatrix(`getManagers' unpriced count, ${WAY_NAMES[way]}`, {
    permission: "money.managers",
    async run({ user, branchId }) {
      const { scene } = await sceneIn(branchId);
      const block = await getManagers(
        user.id,
        THIS_MONTH,
        filtersOf(way, branchId, scene.manager.id),
      );
      const row = block.rows.find((each) => each.id === scene.manager.id);
      counted(row !== undefined && row.unpriced.count === 1 && row.orders.count === 1);
    },
  });
}

// The reports have no department or Manager filter (plan of 6.8, decided item 6): two ways.
for (const way of ["branch", "wall"] as const) {
  describePermissionMatrix(`the Spending and Planned vs actual reports, ${WAY_NAMES[way]}`, {
    permission: "data.view",
    async run({ user, branchId }) {
      const { scene, ended } = await sceneIn(branchId);
      const filters = filtersOf(way, branchId, scene.manager.id);
      const spending = await getSpendingReport(user.id, { range: MAY, filters });
      expect(spending.departments.reduce((sum, row) => sum + row.amount, 0n)).toBe(spending.total);
      const plan = await getPlanVsActualReport(user.id, { range: MAY, filters }, "all");
      const line = plan.managers.find((row) => row.id === scene.manager.id);
      const product = plan.products.find((row) => row.id === ended.productId);
      const seen = spending.branches.some((row) => row.id === branchId);
      // Every unpriced line keeps to the same wall (permission review, Should fix 1).
      expect(line?.unpriced ?? 0, "Manager line").toBe(seen ? 1 : 0);
      expect(product?.unpriced ?? 0, "product line").toBe(seen ? 1 : 0);
      if (way === "branch") expect(plan.total.unpriced).toBe(1);
      counted(seen);
    },
  });
}

// The Managers block asked with no filter at all, and with department=none (permission review,
// Must fix 1): the matrix cannot ask it so, as a Principal or a Manager is refused the whole list
// ("forbidden") before any branch is read. Finance of one branch is allowed and reaches the SQL:
// another branch's Manager is in no row; the Head sees both (03 rule 1; matrix row "See every
// Manager's cash"). Each branch gets the same orders (D40).
describe("getManagers' unpriced count, the branch wall in the SQL (03 rule 1)", () => {
  it.each(["wall", "none"] as const)(
    "%s: Finance of branch A sees A's Manager only; the Head both",
    async (way) => {
      const a = await sceneIn((await insertBranch()).id);
      const b = await sceneIn((await insertBranch()).id);
      const finance = await insertUser("FINANCE", { branches: [a.scene.branch.id] });
      const head = await insertUser("HEAD");
      const filters = filtersOf(way, a.scene.branch.id, a.scene.manager.id);
      const ofFinance = await getManagers(finance.id, THIS_MONTH, filters);
      expect(ofFinance.rows.find((row) => row.id === a.scene.manager.id)).toMatchObject({
        orders: { count: 1 },
        unpriced: { count: 1 },
      });
      expect(ofFinance.rows.some((row) => row.id === b.scene.manager.id)).toBe(false);
      const ofHead = await getManagers(head.id, THIS_MONTH, filters);
      for (const manager of [a.scene.manager.id, b.scene.manager.id]) {
        expect(ofHead.rows.find((row) => row.id === manager)?.unpriced.count).toBe(1);
      }
    },
  );
});
