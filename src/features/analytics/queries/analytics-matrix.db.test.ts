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
import { getCashOrders } from "./cash-orders";
import { getAnalyticsFilters } from "./filters";
import { getHeadSpending } from "./head-spending";
import { getManagers } from "./managers";
import { getOutcomeOrders } from "./outcome-orders";
import { getPlanVsActual } from "./plan-vs-actual";
import { getPriceChoices, getPrices } from "./prices";
import { getSpending } from "./spending";
import { getSpendingRecords } from "./spending-records";
import { getStockLines } from "./stock-lines";
import { getStockMoves } from "./stock-moves";
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
      const { variant, issue } = await stockIn(branchId);
      const block = await getWarehouse(user.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
      const lines = await getStockLines(user.id, "value", NO_ANALYTICS_FILTERS, "all");
      const moves = await getStockMoves(user.id, "use", THIS_MONTH, NO_ANALYTICS_FILTERS, "all");
      // The number and its lists keep to the same wall.
      const listed = lines.rows.some((row) => row.variantId === variant);
      expect(moves.rows.some((row) => row.documentId === issue)).toBe(listed);
      expect(block.branches.some((row) => row.id === branchId)).toBe(listed);
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
