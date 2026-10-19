import { sql } from "drizzle-orm";
import { expect } from "vitest";

import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";

import {
  bought,
  buyingEvent,
  decided,
  moneyOn,
  recordOn,
  refreshNow,
  spendingScene,
  stockDocument,
  stocked,
} from "../../../../tests/helpers/analytics";
import { setClock } from "../../../../tests/helpers/clock";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { NO_ANALYTICS_FILTERS, type PeriodInput } from "../period-params";

import { getApprovalOrders } from "./approval-orders";
import { getApprovalSpeed } from "./approval-speed";
import { getCancelledRecords } from "./cancelled-records";
import { getCashNeeded } from "./cash-needed";
import { getCashOrders } from "./cash-orders";
import { getFinanceCash } from "./finance-cash";
import { getFinanceSpending } from "./finance-spending";
import { getAnalyticsFilters } from "./filters";
import { getHeadSpending } from "./head-spending";
import { getManagers } from "./managers";
import { getMoneyRows } from "./money-rows";
import { getMyApprovals } from "./my-approvals";
import { getMyCash } from "./my-cash";
import { getMyEstimates } from "./my-estimates";
import { getMyOrders } from "./my-orders";
import { getNeededOrders } from "./needed-orders";
import { getOrderStatuses } from "./order-statuses";
import { getOutcomeOrders } from "./outcome-orders";
import { getPlanVsActual } from "./plan-vs-actual";
import { getPriceChoices, getPrices } from "./prices";
import { getSettlementSpeed } from "./settlement-speed";
import { getSettlements } from "./settlements";
import { getSpending } from "./spending";
import { getSpendingRecords } from "./spending-records";
import { getStockLines } from "./stock-lines";
import { getStatusOrders } from "./status-orders";
import { getStockMoves } from "./stock-moves";
import { getTopProducts } from "./top-products";
import { getStockPlanning } from "./stock-planning";
import { getWarehouse } from "./warehouse";

// The Analytics queries in the permission matrix (15-quality-and-acceptance.md, Test layers: "each
// action × each role × own branch and other branch"; 03-roles-and-permissions.md, Permission
// matrix "See requests, stock and reports"; rule 1: another branch is "Not found"; build-plan 6.3).
// Each is asked with the branch filter (authorize()) and without it (the wall in the SQL): a
// number that leaves the branch's record out answers "not_found" here. Task 6.4a adds the Head's
// Spending breakdowns, Plan vs actual and its order list (plan of 6.4, decided item 8: each reads
// the user's branches under `data.view`, whichever page calls it).

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

/** An order of the branch that ended red this month (10 × 5 200 against 10 × 5 000). */
async function outcomeIn(branchId: string) {
  setClock("2031-05-15T05:00:00Z");
  const scene = await spendingScene(branchId);
  const order = await bought(scene, {
    purchasedOn: "2031-05-02",
    qty: "10.000",
    unitPrice: "5200",
    progress: "DONE",
  });
  await buyingEvent(order.orderId, order.ownerId, "RECORD_PURCHASE", "2031-05-02T05:00:00Z");
  await refreshNow();
  return order;
}

describePermissionMatrix("getHeadSpending with the branch filter", {
  permission: "data.view",
  async run({ user, branchId }) {
    await recordIn(branchId);
    const block = await getHeadSpending(user.id, THIS_MONTH, {
      ...NO_ANALYTICS_FILTERS,
      branch: branchId,
    });
    expect(block.branches.map((row) => [row.id, row.amount])).toEqual([[branchId, 12_345n]]);
    expect(block.payments.map((row) => row.amount)).toEqual([12_345n]);
  },
});

describePermissionMatrix("getHeadSpending, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    await recordIn(branchId);
    const block = await getHeadSpending(user.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    if (!block.branches.some((row) => row.id === branchId)) {
      throw new AuthorizationError("not_found");
    }
  },
});

describePermissionMatrix("getPlanVsActual with the branch filter", {
  permission: "data.view",
  async run({ user, branchId }) {
    await outcomeIn(branchId);
    const block = await getPlanVsActual(user.id, THIS_MONTH, {
      ...NO_ANALYTICS_FILTERS,
      branch: branchId,
    });
    expect(block.total.colours.red.count).toBe(1);
    expect(block.total.overspent.amount).toBe(2_000n);
  },
});

describePermissionMatrix("getPlanVsActual and getOutcomeOrders, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const order = await outcomeIn(branchId);
    const block = await getPlanVsActual(user.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    const list = await getOutcomeOrders(
      user.id,
      THIS_MONTH,
      NO_ANALYTICS_FILTERS,
      { kind: "period" },
      false,
      "all",
    );
    // The number and its list keep to the same wall.
    expect(block.total.orders.count).toBe(list.count);
    const listed = list.rows.some((row) => row.orderId === order.orderId);
    expect(block.branches.some((row) => row.id === branchId)).toBe(listed);
    if (!listed) throw new AuthorizationError("not_found");
  },
});

describePermissionMatrix("getOutcomeOrders with the branch filter", {
  permission: "data.view",
  async run({ user, branchId }) {
    const order = await outcomeIn(branchId);
    const list = await getOutcomeOrders(
      user.id,
      THIS_MONTH,
      { ...NO_ANALYTICS_FILTERS, branch: branchId },
      { kind: "overspent" },
      false,
      1,
    );
    expect(list.rows.map((row) => row.orderId)).toEqual([order.orderId]);
    expect(list.sum).toBe(2_000n);
  },
});

describePermissionMatrix("getSpendingRecords by payment type, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const record = await recordIn(branchId);
    const list = await getSpendingRecords(
      user.id,
      THIS_MONTH,
      NO_ANALYTICS_FILTERS,
      { kind: "payment", payment: "CASH" },
      "all",
    );
    const block = await getHeadSpending(user.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    // The slice and its list keep to the same wall.
    expect(block.payments.find((row) => row.payment === "CASH")?.amount ?? 0n).toBe(list.total);
    if (!list.rows.some((row) => row.purchaseId === record.purchaseId)) {
      throw new AuthorizationError("not_found");
    }
  },
});

// Task 6.4b: Prices and Approval speed (plan of 6.4b, Server actions and queries).

/** A subtype bought at 5 000 then 6 000 in the branch this month, and the summary refreshed. */
async function pricedIn(branchId: string) {
  setClock("2031-05-15T05:00:00Z");
  const scene = await spendingScene(branchId);
  const order = await bought(scene, { purchasedOn: "2031-05-02", unitPrice: "5000" });
  await recordOn(
    scene,
    { id: order.orderId, ownerId: order.ownerId, variantId: order.variantId },
    {
      purchasedOn: "2031-05-03",
      unitPrice: "6000",
    },
  );
  await refreshNow();
  return order;
}

describePermissionMatrix("getPrices with the branch filter", {
  permission: "data.view",
  async run({ user, branchId }) {
    const order = await pricedIn(branchId);
    const prices = await getPrices(
      user.id,
      THIS_MONTH,
      { ...NO_ANALYTICS_FILTERS, branch: branchId },
      order.variantId,
    );
    expect(prices.trend!.points.at(-1)!.price).toBe(5500n);
  },
});

describePermissionMatrix(
  "getPrices, getPriceChoices and the price records, the branch wall in the SQL",
  {
    permission: "data.view",
    async run({ user, branchId }) {
      const order = await pricedIn(branchId);
      const prices = await getPrices(user.id, THIS_MONTH, NO_ANALYTICS_FILTERS, order.variantId);
      const list = await getSpendingRecords(
        user.id,
        THIS_MONTH,
        NO_ANALYTICS_FILTERS,
        { kind: "price", variant: order.variantId, month: null, noSupplier: false },
        "all",
      );
      const choices = await getPriceChoices(user.id);
      const risen = prices.rises.some((rise) => rise.variantId === order.variantId);
      const chosen = choices.some((choice) => choice.variantId === order.variantId);
      // The trend, the rise, the choices and the list keep to the same wall: a subtype id never
      // opens another branch's records.
      expect(prices.trend!.points.at(-1)!.price === 5500n).toBe(list.rows.length === 2);
      expect(risen).toBe(list.rows.length === 2);
      expect(chosen).toBe(list.rows.length === 2);
      if (list.rows.length === 0) throw new AuthorizationError("not_found");
    },
  },
);

/** An order of the branch the Head approved after an hour this month, waiting at Principal now. */
async function stayIn(branchId: string) {
  setClock("2031-05-15T05:00:00Z");
  const scene = await spendingScene(branchId);
  const order = await decided(scene, "PENDING_PRINCIPAL", [
    { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-05-02T04:00:00Z" },
    { type: "APPROVE", from: "PENDING_HEAD", to: "PENDING_PRINCIPAL", at: "2031-05-02T05:00:00Z" },
  ]);
  await refreshNow();
  return order;
}

describePermissionMatrix("getApprovalSpeed with the branch filter", {
  permission: "data.view",
  async run({ user, branchId }) {
    await stayIn(branchId);
    const speed = await getApprovalSpeed(user.id, THIS_MONTH, {
      ...NO_ANALYTICS_FILTERS,
      branch: branchId,
    });
    expect(speed.all.PENDING_HEAD).toMatchObject({ hours: "1.0", count: 1 });
    expect(speed.waiting.PENDING_PRINCIPAL.all).toBe(1);
    expect(speed.shares.all.decisions).toBe(1);
  },
});

describePermissionMatrix("getApprovalOrders with the branch filter", {
  permission: "data.view",
  async run({ user, branchId }) {
    const order = await stayIn(branchId);
    const filters = { ...NO_ANALYTICS_FILTERS, branch: branchId };
    const stays = await getApprovalOrders(
      user.id,
      THIS_MONTH,
      filters,
      { kind: "step", step: "PENDING_HEAD", decision: null },
      null,
      "all",
    );
    const waiting = await getApprovalOrders(
      user.id,
      THIS_MONTH,
      filters,
      { kind: "waiting", step: "PENDING_PRINCIPAL", group: null },
      null,
      "all",
    );
    expect(stays.rows.map((row) => row.orderId)).toContain(order.id);
    expect(waiting.rows.map((row) => row.orderId)).toContain(order.id);
  },
});

describePermissionMatrix("getApprovalSpeed and getApprovalOrders, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const order = await stayIn(branchId);
    const speed = await getApprovalSpeed(user.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    const stays = await getApprovalOrders(
      user.id,
      THIS_MONTH,
      NO_ANALYTICS_FILTERS,
      { kind: "step", step: "PENDING_HEAD", decision: null },
      null,
      "all",
    );
    const waiting = await getApprovalOrders(
      user.id,
      THIS_MONTH,
      NO_ANALYTICS_FILTERS,
      { kind: "waiting", step: null, group: null },
      null,
      "all",
    );
    // The numbers and their lists keep to the same wall.
    expect(speed.all.PENDING_HEAD.count).toBe(stays.count);
    expect(speed.shares.all.decisions).toBe(stays.count);
    expect(speed.waiting.all.all).toBe(waiting.count);
    const listed = stays.rows.some((row) => row.orderId === order.id);
    expect(waiting.rows.some((row) => row.orderId === order.id)).toBe(listed);
    expect(speed.branches.some((row) => row.branchId === branchId)).toBe(listed);
    if (!listed) throw new AuthorizationError("not_found");
  },
});

/**
 * The Managers block's rows of a branch (build-plan 6.4c): a Manager's record cancelled this month
 * and an order holding 30 000 given this month, the summary refreshed.
 */
async function managerIn(branchId: string) {
  setClock("2031-05-15T05:00:00Z");
  const scene = await spendingScene(branchId);
  const cancelled = await bought(scene, {
    purchasedOn: "2031-05-02",
    cancelled: true,
    cancelledAt: "2031-05-03T05:00:00Z",
  });
  const held = await bought(scene, { purchasedOn: "2031-05-02", unitPrice: "0" });
  await moneyOn(held, scene.manager.id, { amount: 30_000n, occurredOn: "2031-05-04" });
  await refreshNow();
  return { manager: scene.manager, cancelled, held };
}

describePermissionMatrix(
  "getManagers, getCancelledRecords and getCashOrders with the branch filter",
  {
    permission: "data.view",
    async run({ user, branchId }) {
      const { manager, cancelled, held } = await managerIn(branchId);
      const filters = { ...NO_ANALYTICS_FILTERS, branch: branchId };
      const block = await getManagers(user.id, THIS_MONTH, filters);
      const records = await getCancelledRecords(user.id, THIS_MONTH, filters, false, "all");
      const cash = await getCashOrders(user.id, filters, false, "all");
      expect(block.rows.find((row) => row.id === manager.id)).toMatchObject({
        cancelled: { count: 1 },
        held: 30_000n,
      });
      expect(records.rows.map((row) => row.purchaseId)).toContain(cancelled.purchaseId);
      expect(cash.rows.map((row) => row.orderId)).toContain(held.orderId);
    },
  },
);

describePermissionMatrix(
  "getManagers, getCancelledRecords and getCashOrders, the branch wall in the SQL",
  {
    permission: "data.view",
    async run({ user, branchId }) {
      const { manager, cancelled, held } = await managerIn(branchId);
      const block = await getManagers(user.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
      const records = await getCancelledRecords(
        user.id,
        THIS_MONTH,
        NO_ANALYTICS_FILTERS,
        false,
        "all",
      );
      const cash = await getCashOrders(user.id, NO_ANALYTICS_FILTERS, false, "all");
      // The number and its lists keep to the same wall.
      const listed = cash.rows.some((row) => row.orderId === held.orderId);
      expect(records.rows.some((row) => row.purchaseId === cancelled.purchaseId)).toBe(listed);
      expect(block.rows.some((row) => row.id === manager.id)).toBe(listed);
      if (!listed) throw new AuthorizationError("not_found");
    },
  },
);

// The ids of the filters (.claude/rules/server-actions.md: every id from the browser is checked to
// belong to a branch the user may use; permission review of 6.4c, Should fix 2): a department or a
// Manager of the branch, sent to each Managers query without a branch filter.
describePermissionMatrix(
  "getManagers, getCancelledRecords and getCashOrders with a department or a Manager of the branch",
  {
    permission: "data.view",
    async run({ user, branchId }) {
      const { manager, held } = await managerIn(branchId);
      const department = (
        await db.execute<{ department_id: string }>(
          sql`select department_id from orders where id = ${held.orderId}`,
        )
      ).rows[0]!.department_id;
      for (const filters of [
        { ...NO_ANALYTICS_FILTERS, department },
        { ...NO_ANALYTICS_FILTERS, manager: manager.id },
      ]) {
        const block = await getManagers(user.id, THIS_MONTH, filters);
        await getCancelledRecords(user.id, THIS_MONTH, filters, false, "all");
        const cash = await getCashOrders(user.id, filters, false, "all");
        expect(block.rows.find((row) => row.id === manager.id)?.held).toBe(30_000n);
        expect(cash.rows.map((row) => row.orderId)).toEqual([held.orderId]);
      }
    },
  },
);

/**
 * The Warehouse block's rows of a branch (build-plan 6.4d): an item of 10 × 1 000 with a minimum
 * of 9, 2 of it issued to the department this month (so 8 left, Low), the summary refreshed.
 */
async function stockIn(branchId: string) {
  setClock("2031-05-15T05:00:00Z");
  const scene = await spendingScene(branchId);
  const variant = await stocked(scene, { qty: "10", unitCost: 1_000n, minimum: "9" });
  const issue = await stockDocument(scene, {
    type: "ISSUE",
    docDate: "2031-05-03",
    lines: [{ variantId: variant, qty: "2" }],
  });
  await refreshNow();
  return { scene, variant, issue };
}

describePermissionMatrix("getWarehouse, getStockLines and getStockMoves with the branch filter", {
  permission: "data.view",
  async run({ user, branchId }) {
    const { scene, variant, issue } = await stockIn(branchId);
    const filters = { ...NO_ANALYTICS_FILTERS, branch: branchId };
    const block = await getWarehouse(user.id, THIS_MONTH, filters);
    const lines = await getStockLines(user.id, "low", filters, "all");
    const moves = await getStockMoves(user.id, "use", THIS_MONTH, filters, "all");
    expect(block.departments.find((row) => row.id === scene.department.id)?.used).toBe(2_000n);
    expect(lines.rows.map((row) => row.variantId)).toContain(variant);
    expect(moves.rows.map((row) => row.documentId)).toContain(issue);
  },
});

describePermissionMatrix(
  "getWarehouse, getStockLines and getStockMoves, the branch wall in the SQL",
  {
    permission: "data.view",
    async run({ user, branchId }) {
      const { scene, variant, issue } = await stockIn(branchId);
      const block = await getWarehouse(user.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
      const lines = await getStockLines(user.id, "value", NO_ANALYTICS_FILTERS, "all");
      const moves = await getStockMoves(user.id, "use", THIS_MONTH, NO_ANALYTICS_FILTERS, "all");
      // The number and its lists keep to the same wall.
      const listed = lines.rows.some((row) => row.variantId === variant);
      expect(moves.rows.some((row) => row.documentId === issue)).toBe(listed);
      expect(block.branches.some((row) => row.id === branchId)).toBe(listed);
      // Use by department is a statement of its own: its wall is checked on its own (permission
      // review of 6.4d, Must fix 1).
      expect(block.departments.some((row) => row.id === scene.department.id)).toBe(listed);
      if (!listed) throw new AuthorizationError("not_found");
    },
  },
);

// A department of the branch, sent to each Warehouse query without a branch filter (permission
// review of 6.4c, Should fix 2).
describePermissionMatrix(
  "getWarehouse, getStockLines and getStockMoves with a department of the branch",
  {
    permission: "data.view",
    async run({ user, branchId }) {
      const { scene, issue } = await stockIn(branchId);
      const filters = { ...NO_ANALYTICS_FILTERS, department: scene.department.id };
      const block = await getWarehouse(user.id, THIS_MONTH, filters);
      await getStockLines(user.id, "value", filters, "all");
      const moves = await getStockMoves(user.id, "use", THIS_MONTH, filters, "all");
      expect(block.departments.map((row) => row.id)).toEqual([scene.department.id]);
      expect(moves.rows.map((row) => row.documentId)).toEqual([issue]);
    },
  },
);

// The Manager's Stock planning (build-plan 6.5c): its line, its variant's moves and the Low tile
// keep to the same walls as the Warehouse block, asked with and without the branch filter.
describePermissionMatrix("getStockPlanning and the variant's moves with the branch filter", {
  permission: "data.view",
  async run({ user, branchId }) {
    const { variant, issue } = await stockIn(branchId);
    const filters = { ...NO_ANALYTICS_FILTERS, branch: branchId };
    const block = await getStockPlanning(user.id, THIS_MONTH, filters);
    const moves = await getStockMoves(user.id, "use", THIS_MONTH, filters, "all", variant);
    expect(block.lines.find((line) => line.variantId === variant)?.used).toBe("2.000");
    expect(block.low).toBe(1);
    expect(moves.rows.map((row) => row.documentId)).toEqual([issue]);
    expect(moves.quantity).toBe("2.000");
  },
});

describePermissionMatrix("getStockPlanning, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const { variant, issue } = await stockIn(branchId);
    const block = await getStockPlanning(user.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    const moves = await getStockMoves(
      user.id,
      "use",
      THIS_MONTH,
      NO_ANALYTICS_FILTERS,
      "all",
      variant,
    );
    const listed = block.lines.some((line) => line.variantId === variant);
    expect(moves.rows.some((row) => row.documentId === issue)).toBe(listed);
    // The Low tile keeps to the same wall as the Low list it opens, and counts this branch's line
    // only where the line is listed (permission review of 6.5c, Should fix 1).
    const low = await getStockLines(user.id, "low", NO_ANALYTICS_FILTERS, "all");
    expect(block.low).toBe(low.count);
    expect(low.rows.some((row) => row.variantId === variant)).toBe(listed);
    if (!listed) throw new AuthorizationError("not_found");
  },
});

// A department of the branch, sent to Stock planning and the variant's moves without a branch
// filter: a value read in a new way is tested at every reader (permission review of 6.5c, Must
// fix 1).
describePermissionMatrix(
  "getStockPlanning and the variant's moves with a department of the branch",
  {
    permission: "data.view",
    async run({ user, branchId }) {
      const { scene, variant } = await stockIn(branchId);
      const filters = { ...NO_ANALYTICS_FILTERS, department: scene.department.id };
      const block = await getStockPlanning(user.id, THIS_MONTH, filters);
      const moves = await getStockMoves(user.id, "use", THIS_MONTH, filters, "all", variant);
      expect(block.lines.find((line) => line.variantId === variant)?.used).toBe("2.000");
      expect(moves.quantity).toBe("2.000");
    },
  },
);

/**
 * The Principal's rows of a branch (build-plan 6.5a): an order submitted this month and waiting
 * at Waiting for Principal, needed by tomorrow (coming up); one decided by `deciderId` at the
 * Principal step in 2 hours; a record of 12 345 so'm. The summary refreshed.
 */
async function principalIn(branchId: string, deciderId: string) {
  setClock("2031-05-15T05:00:00Z");
  const scene = await spendingScene(branchId);
  const record = await bought(scene, {
    purchasedOn: "2031-05-02",
    unitPrice: "12345",
    progress: "DONE",
  });
  const waiting = await decided(
    scene,
    "PENDING_PRINCIPAL",
    [{ type: "SUBMIT", from: "DRAFT", to: "PENDING_PRINCIPAL", at: "2031-05-02T05:00:00Z" }],
    { submittedAt: "2031-05-02T05:00:00Z", neededBy: "2031-05-16" },
  );
  await decided(
    scene,
    "PENDING_FINANCE",
    [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_PRINCIPAL", at: "2031-05-03T05:00:00Z" },
      {
        type: "APPROVE",
        from: "PENDING_PRINCIPAL",
        to: "PENDING_FINANCE",
        at: "2031-05-03T07:00:00Z",
        actorId: deciderId,
      },
    ],
    { submittedAt: "2031-05-03T05:00:00Z", neededBy: "2031-06-30" },
  );
  await refreshNow();
  return { record, waiting };
}

describePermissionMatrix(
  "getTopProducts, getOrderStatuses and getMyApprovals with the branch filter",
  {
    permission: "data.view",
    async run({ user, branchId }) {
      const { record } = await principalIn(branchId, user.id);
      const filters = { ...NO_ANALYTICS_FILTERS, branch: branchId };
      const top = await getTopProducts(user.id, THIS_MONTH, filters);
      expect(top.products.map((row) => [row.id, row.amount])).toEqual([
        [record.productId, 12_345n],
      ]);
      const orders = await getOrderStatuses(user.id, THIS_MONTH, filters);
      expect(orders.total.count).toBe(3);
      expect(orders.comingUp).toBe(1);
      const mine = await getMyApprovals(user.id, THIS_MONTH, filters);
      expect(mine.waiting.all).toBe(1);
      expect(mine.mine).toMatchObject({ hours: "2.0", count: 1 });
    },
  },
);

describePermissionMatrix("getStatusOrders with the branch filter", {
  permission: "data.view",
  async run({ user, branchId }) {
    const { waiting } = await principalIn(branchId, user.id);
    const list = await getStatusOrders(
      user.id,
      THIS_MONTH,
      { ...NO_ANALYTICS_FILTERS, branch: branchId },
      { kind: "due", due: "soon" },
      "all",
    );
    expect(list.rows.map((row) => row.orderId)).toEqual([waiting.id]);
  },
});

describePermissionMatrix("the Principal's blocks and lists, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const { record, waiting } = await principalIn(branchId, user.id);
    // The Head sees every branch of the file's database, whose top 10 ties at 12 345: the
    // product's own list is read beside it.
    const top = await getTopProducts(user.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    const product = await getSpendingRecords(
      user.id,
      THIS_MONTH,
      NO_ANALYTICS_FILTERS,
      { kind: "product", product: record.productId },
      "all",
    );
    const orders = await getOrderStatuses(user.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    const soon = await getStatusOrders(
      user.id,
      THIS_MONTH,
      NO_ANALYTICS_FILTERS,
      { kind: "due", due: "soon" },
      "all",
    );
    const mine = await getMyApprovals(user.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    const myList = await getApprovalOrders(
      user.id,
      THIS_MONTH,
      NO_ANALYTICS_FILTERS,
      { kind: "mine" },
      null,
      "all",
    );
    // The numbers and their lists keep to the same wall.
    expect(orders.comingUp).toBe(soon.count);
    expect(mine.mine.count).toBe(myList.count);
    const listed = soon.rows.some((row) => row.orderId === waiting.id);
    expect(product.rows.some((row) => row.purchaseId === record.purchaseId)).toBe(listed);
    if (top.products.some((row) => row.id === record.productId)) expect(listed).toBe(true);
    expect(mine.mine.count).toBe(listed ? 1 : 0);
    // The other numbers keep to it too (permission review, Should fix 2): a user of another branch
    // sees only that fresh branch, which holds nothing.
    if (!listed) {
      expect(mine.waiting.all).toBe(0);
      expect(orders.total.count).toBe(0);
      expect(orders.overdue).toBe(0);
      throw new AuthorizationError("not_found");
    }
    expect(mine.waiting.all).toBeGreaterThanOrEqual(1);
    expect(orders.total.count).toBeGreaterThanOrEqual(3);
  },
});

/**
 * The Manager's rows of a branch, owned by `ownerId` (build-plan 6.5b): an order submitted on 1
 * May, sent back once, Open on 3 May (48 hours); a record of 12 345 so'm paid in cash on an order
 * planned at 5 000, so its count is 12 345 owed. The summary refreshed.
 */
async function ownOrdersIn(branchId: string, ownerId: string) {
  setClock("2031-05-15T05:00:00Z");
  const scene = await spendingScene(branchId);
  const opened = await decided(
    scene,
    "PURCHASING",
    [
      { type: "SUBMIT", from: "DRAFT", to: "PENDING_HEAD", at: "2031-05-01T05:00:00Z" },
      {
        type: "SEND_BACK",
        from: "PENDING_HEAD",
        to: "RETURNED",
        at: "2031-05-01T06:00:00Z",
        reason: "Miqdorni tekshiring",
      },
      { type: "SUBMIT_AGAIN", from: "RETURNED", to: "PENDING_FINANCE", at: "2031-05-02T05:00:00Z" },
      { type: "APPROVE", from: "PENDING_FINANCE", to: "PURCHASING", at: "2031-05-03T05:00:00Z" },
    ],
    { ownerId, submittedAt: "2031-05-01T05:00:00Z" },
  );
  const record = await bought(scene, { ownerId, purchasedOn: "2031-05-02", unitPrice: "12345" });
  await refreshNow();
  return { record, opened: opened.id };
}

describePermissionMatrix(
  "getMyOrders, getMyEstimates, getMyCash and their lists with the branch filter",
  {
    permission: "data.view",
    async run({ user, branchId }) {
      const { record, opened } = await ownOrdersIn(branchId, user.id);
      const filters = { ...NO_ANALYTICS_FILTERS, branch: branchId };
      const orders = await getMyOrders(user.id, THIS_MONTH, filters);
      expect(orders.approval).toMatchObject({ hours: "48.0", count: 1 });
      expect(orders.sentBack).toMatchObject({ count: 1, share: "50.0" });
      const estimates = await getMyEstimates(user.id, THIS_MONTH, filters);
      expect(estimates.products.map((row) => [row.productId, row.difference])).toEqual([
        [record.productId, -7_345n],
      ]);
      const cash = await getMyCash(user.id, filters);
      expect([cash.held, cash.owed]).toEqual([0n, 12_345n]);
      // The two new lists, for every role, without a Manager filter (permission review, Must
      // fix 1): the branch filter holds this case's rows only.
      const approved = await getStatusOrders(
        user.id,
        THIS_MONTH,
        filters,
        { kind: "approved" },
        "all",
      );
      expect(approved.rows.map((row) => row.orderId)).toEqual([opened]);
      const priced = await getSpendingRecords(
        user.id,
        THIS_MONTH,
        filters,
        { kind: "priced", product: null },
        "all",
      );
      expect(priced.rows.map((row) => row.purchaseId)).toEqual([record.purchaseId]);
    },
  },
);

describePermissionMatrix("the Manager's blocks and lists, the branch wall in the SQL", {
  permission: "data.view",
  async run({ user, branchId }) {
    const { record, opened } = await ownOrdersIn(branchId, user.id);
    const orders = await getMyOrders(user.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    const estimates = await getMyEstimates(user.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    const cash = await getMyCash(user.id, NO_ANALYTICS_FILTERS);
    // The orders are the user's own: in a branch the user does not see, every number is empty.
    const seen = orders.approval.count === 1;
    expect(orders.decisions).toBe(seen ? 2 : 0);
    // The bought order is submitted on the clock's day, in May too.
    expect(orders.total.count).toBe(seen ? 2 : 0);
    expect(estimates.all.records).toBe(seen ? 1 : 0);
    expect(cash.owed).toBe(seen ? 12_345n : 0n);
    // The two new lists, for every role, without a Manager filter (permission review, Must fix
    // 1): this case's rows are listed only where the user sees the branch.
    const approved = await getStatusOrders(
      user.id,
      THIS_MONTH,
      NO_ANALYTICS_FILTERS,
      { kind: "approved" },
      "all",
    );
    const priced = await getSpendingRecords(
      user.id,
      THIS_MONTH,
      NO_ANALYTICS_FILTERS,
      { kind: "priced", product: record.productId },
      "all",
    );
    expect(approved.rows.some((row) => row.orderId === opened)).toBe(seen);
    expect(priced.rows.map((row) => row.purchaseId)).toEqual(seen ? [record.purchaseId] : []);
    if (!seen) throw new AuthorizationError("not_found");
  },
});

/**
 * Finance's rows of a branch (build-plan 6.6a): an Open order given 30 000 on 4 May (held 11 days:
 * 8 to 30; 20 000 of its 50 000 still needed) and an order waiting at Finance (50 000 in
 * approval), the summary refreshed.
 */
async function financeIn(branchId: string) {
  setClock("2031-05-15T05:00:00Z");
  const scene = await spendingScene(branchId);
  const held = await bought(scene, { purchasedOn: "2031-05-02", unitPrice: "0" });
  await moneyOn(held, scene.manager.id, { amount: 30_000n, occurredOn: "2031-05-04" });
  const waiting = await decided(scene, "PENDING_FINANCE", []);
  await refreshNow();
  return { held, waiting, category: scene.category.id, department: scene.department.id };
}

/** Every Finance list of 6.6a under the filters: whether each shows the branch's rows. */
async function financeLists(
  userId: string,
  filters: typeof NO_ANALYTICS_FILTERS,
  { held, waiting }: Awaited<ReturnType<typeof financeIn>>,
) {
  const given = await getMoneyRows(userId, "given", null, THIS_MONTH, filters, "all");
  const month = await getMoneyRows(userId, "given", "2031-05", THIS_MONTH, filters, "all");
  const aged = await getCashOrders(userId, filters, false, "all", { band: "month", side: "held" });
  const open = await getNeededOrders(userId, filters, "open", null, "all");
  const step = await getNeededOrders(userId, filters, "approval", "PENDING_FINANCE", "all");
  const all = await getNeededOrders(userId, filters, "all", null, "all");
  return [
    given.rows.some((row) => row.orderId === held.orderId),
    month.rows.some((row) => row.orderId === held.orderId),
    aged.rows.some((row) => row.orderId === held.orderId),
    open.rows.some((row) => row.orderId === held.orderId),
    step.rows.some((row) => row.orderId === waiting.id),
    all.rows.some((row) => row.orderId === waiting.id) &&
      all.rows.some((row) => row.orderId === held.orderId),
  ];
}

describePermissionMatrix(
  "getFinanceCash, getCashNeeded, getMoneyRows, getNeededOrders and getCashOrders by age with the branch filter",
  {
    permission: "data.view",
    async run({ user, branchId }) {
      const rows = await financeIn(branchId);
      const filters = { ...NO_ANALYTICS_FILTERS, branch: branchId };
      const cash = await getFinanceCash(user.id, THIS_MONTH, filters);
      const needed = await getCashNeeded(user.id, filters);
      expect(cash.totals.given.amount).toBe(30_000n);
      expect(cash.ages.find((row) => row.band === "month")!.held).toBe(30_000n);
      expect(needed.open.amount).toBe(20_000n);
      expect(needed.approval.amount).toBe(50_000n);
      const seen = await financeLists(user.id, filters, rows);
      expect(seen).toEqual(seen.map(() => true));
    },
  },
);

describePermissionMatrix(
  "getFinanceCash, getCashNeeded, getMoneyRows, getNeededOrders and getCashOrders by age, the branch wall in the SQL",
  {
    permission: "data.view",
    async run({ user, branchId }) {
      const rows = await financeIn(branchId);
      // The branch's category alone: the totals are then this branch's rows or nothing.
      const own = { ...NO_ANALYTICS_FILTERS, category: rows.category };
      const cash = await getFinanceCash(user.id, THIS_MONTH, own);
      const needed = await getCashNeeded(user.id, own);
      const seen = [
        ...(await financeLists(user.id, own, rows)),
        cash.totals.given.amount === 30_000n,
        cash.ages.find((row) => row.band === "month")!.held === 30_000n,
        needed.open.amount === 20_000n,
        needed.approval.amount === 50_000n,
      ];
      // The lists and the totals keep to the same wall (permission review of 6.6a, Should fix 1).
      expect(seen).toEqual(seen.map(() => seen[0]));
      if (!seen[0]) throw new AuthorizationError("not_found");
    },
  },
);

// The ids of the filters (.claude/rules/server-actions.md: every id from the browser is checked to
// belong to a branch the user may use; permission review of 6.6a, Must fix 1): a department or a
// Manager of the branch, sent to each Finance query without a branch filter.
describePermissionMatrix(
  "getFinanceCash, getCashNeeded, getMoneyRows, getNeededOrders and getCashOrders by age with a department or a Manager of the branch",
  {
    permission: "data.view",
    async run({ user, branchId }) {
      const rows = await financeIn(branchId);
      const owner = (
        await db.execute<{ owner_id: string }>(
          sql`select owner_id from orders where id = ${rows.held.orderId}`,
        )
      ).rows[0]!.owner_id;
      for (const filters of [
        { ...NO_ANALYTICS_FILTERS, department: rows.department },
        { ...NO_ANALYTICS_FILTERS, manager: owner },
      ]) {
        const cash = await getFinanceCash(user.id, THIS_MONTH, filters);
        const needed = await getCashNeeded(user.id, filters);
        expect(cash.totals.given.amount).toBe(30_000n);
        expect(cash.ages.find((row) => row.band === "month")!.held).toBe(30_000n);
        expect(needed.open.amount).toBe(20_000n);
        expect(needed.approval.amount).toBe(50_000n);
        const seen = await financeLists(user.id, filters, rows);
        expect(seen).toEqual(seen.map(() => true));
      }
    },
  },
);

/**
 * Finance's 6.6b rows of a branch (build-plan 6.6b): a bank-transfer record of 70 000 with no
 * supplier and no receipt, bought on 2 May, and an order sent to settlement on 3 May and closed on
 * 5 May (2.0 days), the summary refreshed.
 */
async function finance66bIn(branchId: string) {
  setClock("2031-05-15T05:00:00Z");
  const scene = await spendingScene(branchId);
  const record = await bought(scene, {
    purchasedOn: "2031-05-02",
    unitPrice: "70000",
    paymentType: "TRANSFER",
    supplierId: null,
  });
  const closed = await decided(
    scene,
    "CLOSED",
    [
      { type: "APPROVE", from: "PENDING_FINANCE", to: "PURCHASING", at: "2031-05-01T05:00:00Z" },
      {
        type: "SEND_TO_SETTLEMENT",
        from: "PURCHASING",
        to: "SETTLEMENT",
        at: "2031-05-03T05:00:00Z",
      },
      { type: "CLOSE", from: "SETTLEMENT", to: "CLOSED", at: "2031-05-05T05:00:00Z" },
    ],
    { submittedAt: "2031-04-30T05:00:00Z" },
  );
  await refreshNow();
  return {
    record,
    closed,
    category: scene.category.id,
    department: scene.department.id,
    owner: scene.manager.id,
  };
}

/** Finance's 6.6b numbers and lists under the filters: whether each holds the branch's rows. */
async function finance66bSeen(
  userId: string,
  filters: typeof NO_ANALYTICS_FILTERS,
  { record, closed }: Awaited<ReturnType<typeof finance66bIn>>,
) {
  const spending = await getFinanceSpending(userId, THIS_MONTH, filters);
  const speed = await getSettlementSpeed(userId, THIS_MONTH, filters);
  const transfers = await getSpendingRecords(
    userId,
    THIS_MONTH,
    filters,
    { kind: "payment", payment: "TRANSFER", noSupplier: true },
    "all",
  );
  const receiptless = await getSpendingRecords(
    userId,
    THIS_MONTH,
    filters,
    { kind: "noreceipt" },
    "all",
  );
  const settlements = await getSettlements(userId, THIS_MONTH, filters, "all");
  return [
    spending.payments.find((row) => row.payment === "TRANSFER")?.amount === 70_000n,
    spending.transfers.noSupplier?.amount === 70_000n,
    spending.noReceipt.amount === 70_000n && spending.noReceipt.count === 1,
    speed.total.days === "2.0" && speed.total.count === 1,
    transfers.total === 70_000n &&
      transfers.rows.some((row) => row.purchaseId === record.purchaseId),
    receiptless.total === 70_000n &&
      receiptless.rows.some((row) => row.purchaseId === record.purchaseId),
    settlements.days === "2.0" && settlements.rows.some((row) => row.orderId === closed.id),
  ];
}

describePermissionMatrix(
  "getFinanceSpending, getSettlementSpeed, getSettlements and the records without a receipt or supplier with the branch filter",
  {
    permission: "data.view",
    async run({ user, branchId }) {
      const rows = await finance66bIn(branchId);
      const seen = await finance66bSeen(
        user.id,
        { ...NO_ANALYTICS_FILTERS, branch: branchId },
        rows,
      );
      expect(seen).toEqual(seen.map(() => true));
    },
  },
);

describePermissionMatrix(
  "getFinanceSpending, getSettlementSpeed, getSettlements and the records without a receipt or supplier, the branch wall in the SQL",
  {
    permission: "data.view",
    async run({ user, branchId }) {
      const rows = await finance66bIn(branchId);
      // The branch's category alone: the totals are then this branch's rows or nothing.
      const seen = await finance66bSeen(
        user.id,
        { ...NO_ANALYTICS_FILTERS, category: rows.category },
        rows,
      );
      // The lists and the totals keep to the same wall.
      expect(seen).toEqual(seen.map(() => seen[0]));
      if (!seen[0]) throw new AuthorizationError("not_found");
    },
  },
);

describePermissionMatrix(
  "getFinanceSpending, getSettlementSpeed, getSettlements and the records without a receipt or supplier with a department or a Manager of the branch",
  {
    permission: "data.view",
    async run({ user, branchId }) {
      const rows = await finance66bIn(branchId);
      for (const filters of [
        { ...NO_ANALYTICS_FILTERS, department: rows.department },
        { ...NO_ANALYTICS_FILTERS, manager: rows.owner },
      ]) {
        const seen = await finance66bSeen(user.id, filters, rows);
        expect(seen).toEqual(seen.map(() => true));
      }
    },
  },
);
