import { expect } from "vitest";

import { AuthorizationError } from "@/server/authorize";

import {
  bought,
  buyingEvent,
  decided,
  recordOn,
  refreshNow,
  spendingScene,
} from "../../../../tests/helpers/analytics";
import { setClock } from "../../../../tests/helpers/clock";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { NO_ANALYTICS_FILTERS, type PeriodInput } from "../period-params";

import { getApprovalOrders } from "./approval-orders";
import { getApprovalSpeed } from "./approval-speed";
import { getAnalyticsFilters } from "./filters";
import { getHeadSpending } from "./head-spending";
import { getOutcomeOrders } from "./outcome-orders";
import { getPlanVsActual } from "./plan-vs-actual";
import { getPriceChoices, getPrices } from "./prices";
import { getSpending } from "./spending";
import { getSpendingRecords } from "./spending-records";

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
    expect(speed.waiting.all.all).toBe(waiting.count);
    const listed = stays.rows.some((row) => row.orderId === order.id);
    expect(waiting.rows.some((row) => row.orderId === order.id)).toBe(listed);
    expect(speed.branches.some((row) => row.branchId === branchId)).toBe(listed);
    if (!listed) throw new AuthorizationError("not_found");
  },
});
