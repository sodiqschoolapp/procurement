import { describe, expect, it } from "vitest";

import { averageSom } from "@/domain/analytics";
import { AuthorizationError } from "@/server/authorize";

import {
  type Bought,
  type SpendingScene,
  bought,
  buyingEvent,
  moneyOn,
  refreshNow,
  spendingScene,
} from "../../../../tests/helpers/analytics";
import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertUser } from "../../../../tests/helpers/users";
import { NO_ANALYTICS_FILTERS, type PeriodInput } from "../period-params";

import { getCancelledRecords } from "./cancelled-records";
import { getCashOrders } from "./cash-orders";
import { getManagers } from "./managers";
import { getOutcomeOrders } from "./outcome-orders";

// The Head's Managers block and its drill-downs (build-plan 6.4c; 10-notifications-analytics-
// reports.md, Analytics page per role, Head, Managers: "Per Manager: number of orders, average
// difference from plan, cancelled purchase records, cash held and for how long", points 1 to 3;
// 08 Difference, Manager's cash balance and Money with managers; 03 rule 1; plan of 6.4c, decided
// items 2 to 7, and the review's decisions 2 to 5). 15 October 2031 in Tashkent: this month is
// October, the period before September. Each order is planned 1 × 50 000.

const THIS_MONTH: PeriodInput = { choice: "this_month", from: null, to: null };
const PLAN = { plannedQty: "1", plannedPrice: 50_000n, qty: "1.000" } as const;

async function ended(scene: SpendingScene, row: Bought, at: string) {
  const order = await bought(scene, { ...PLAN, progress: "DONE", ...row });
  await buyingEvent(order.orderId, order.ownerId, "RECORD_PURCHASE", at);
  return order;
}

/** The block's scene: one Manager of two branches, the Head, Finance of the first branch. */
async function managersScene() {
  setClock("2031-10-15T05:00:00Z");
  const scene = await spendingScene();
  const otherBranch = await insertBranch();
  const manager = scene.manager;
  await insertUser("MANAGER", { branches: [scene.branch.id] }); // a Manager with nothing to show
  const head = await insertUser("HEAD");
  const finance = await insertUser("FINANCE", { branches: [scene.branch.id] });
  const sceneB = { ...(await spendingScene(otherBranch.id)), manager };

  // Ended in October: differences 1 and 2 (the review's worked example: 1.5 → 2). In September
  // −3. Every record is a gift-free cash buy with no money given, so each is owed, never held.
  await ended(scene, { purchasedOn: "2031-10-02", unitPrice: "49999" }, "2031-10-02T05:00:00Z");
  await ended(scene, { purchasedOn: "2031-10-03", unitPrice: "49998" }, "2031-10-03T05:00:00Z");
  await ended(scene, { purchasedOn: "2031-09-10", unitPrice: "50003" }, "2031-09-10T05:00:00Z");
  // The Head's own order, ended in October: "Other owners" (6.4a review correction 1).
  await ended(
    scene,
    { purchasedOn: "2031-10-04", unitPrice: "50000", ownerId: head.id },
    "2031-10-04T05:00:00Z",
  );

  // Cancelled: 20:30 UTC on 9 October is 10 October in Tashkent (now), bought in September;
  // 19:30 UTC on 30 September is 1 October (now); 18:30 UTC is 23:30 on 30 September (before).
  await bought(scene, {
    purchasedOn: "2031-09-20",
    cancelled: true,
    cancelledAt: "2031-10-09T20:30:00Z",
  });
  await bought(scene, {
    purchasedOn: "2031-09-29",
    cancelled: true,
    cancelledAt: "2031-09-30T19:30:00Z",
  });
  await bought(scene, {
    purchasedOn: "2031-09-29",
    cancelled: true,
    cancelledAt: "2031-09-30T18:30:00Z",
  });

  // Cash held: 60 000 since 3 October, 40 000 since 8 October (gifts: nothing spent). Owed:
  // 150 000 spent in cash on 20 September with nothing given, older than either held order.
  const held60 = await bought(scene, { purchasedOn: "2031-10-03", unitPrice: "0" });
  await moneyOn(held60, finance.id, { amount: 60_000n, occurredOn: "2031-10-03" });
  const held40 = await bought(scene, { purchasedOn: "2031-10-09", unitPrice: "0" });
  await moneyOn(held40, finance.id, { amount: 40_000n, occurredOn: "2031-10-08" });
  await bought(scene, { purchasedOn: "2031-09-20", unitPrice: "150000" });

  // The same Manager in the other branch, with every other value that would let it in (D40).
  await ended(sceneB, { purchasedOn: "2031-10-02", unitPrice: "40000" }, "2031-10-02T05:00:00Z");
  await bought(sceneB, {
    purchasedOn: "2031-10-02",
    cancelled: true,
    cancelledAt: "2031-10-05T05:00:00Z",
  });
  const heldB = await bought(sceneB, { purchasedOn: "2031-09-01", unitPrice: "0" });
  await moneyOn(heldB, finance.id, { amount: 500_000n, occurredOn: "2031-09-01" });

  await refreshNow();
  return { scene, sceneB, manager, head, finance, held60, held40 };
}

describe("the Managers block (10 Head, Managers; plan of 6.4c)", () => {
  it("orders and the average difference are of the orders ended in the period, half up, the change in so'm (decided items 2 and 3)", async () => {
    const { scene, manager, head } = await managersScene();
    const filters = { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id };
    const { rows } = await getManagers(head.id, THIS_MONTH, filters);
    const row = rows.find((each) => each.id === manager.id)!;
    expect(row.orders).toEqual({ count: 2, change: { difference: 1n, percent: "100.0" } });
    expect(row.average).toBe(2n);
    // Now 2, before −3: +5 so'm, no percent of a signed number (review decision 3).
    expect(row.averageChange).toBe(5n);

    // The drill-down list is the same orders: its count, and the average of its own sum.
    const list = await getOutcomeOrders(
      head.id,
      THIS_MONTH,
      { ...filters, manager: manager.id },
      { kind: "period" },
      false,
      "all",
    );
    expect(list.count).toBe(row.orders.count);
    expect(averageSom(list.sum, list.count)).toBe(row.average);
  });

  it("puts the Head's own orders in the one row of other owners, last (6.4a review correction 1)", async () => {
    const { scene, head } = await managersScene();
    const { rows } = await getManagers(head.id, THIS_MONTH, {
      ...NO_ANALYTICS_FILTERS,
      branch: scene.branch.id,
    });
    const others = rows.at(-1)!;
    expect(others.id).toBeNull();
    expect(others.orders.count).toBe(1);
    expect(others.average).toBe(0n);
    // A Manager with nothing in either period and no cash has no row (decided item 6).
    expect(rows).toHaveLength(2);
  });

  it("counts the records cancelled in the period on the Tashkent day of the cancel, equal to its list (decided item 5)", async () => {
    const { scene, manager, head } = await managersScene();
    const filters = { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id };
    const row = (await getManagers(head.id, THIS_MONTH, filters)).rows.find(
      (each) => each.id === manager.id,
    )!;
    expect(row.cancelled).toEqual({ count: 2, change: { difference: 1n, percent: "100.0" } });
    const list = await getCancelledRecords(
      head.id,
      THIS_MONTH,
      { ...filters, manager: manager.id },
      false,
      "all",
    );
    expect(list.count).toBe(2);
    expect(list.rows.map((each) => each.cancelledOn)).toEqual(["2031-10-10", "2031-10-01"]);
    // Each record's total as it was entered (1 × 10 000), never the 0 of a cancelled record.
    expect(list.total).toBe(20_000n);
    expect(list.rows[0]).toMatchObject({ reason: "Xato kiritildi", purchasedOn: "2031-09-20" });
  });

  it("cash held is the held half only, never netted, held for from the oldest held order (decided item 4)", async () => {
    const { scene, manager, head, held60, held40 } = await managersScene();
    const filters = { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id };
    const row = (await getManagers(head.id, THIS_MONTH, filters)).rows.find(
      (each) => each.id === manager.id,
    )!;
    expect(row.held).toBe(100_000n);
    // From 3 October, not from the owed order of 20 September: 12 days to 15 October.
    expect(row.heldSince).toBe("2031-10-03");
    expect(row.heldDays).toBe(12);

    const list = await getCashOrders(head.id, { ...filters, manager: manager.id }, false, "all");
    expect(list.held).toBe(row.held);
    expect(list.heldDays).toBe(row.heldDays);
    expect(list.rows.map((each) => [each.orderId, each.cashCount])).toEqual([
      [held60.orderId, 60_000n],
      [held40.orderId, 40_000n],
    ]);
  });

  it("cash held is of now: the same in any period", async () => {
    const { scene, manager, head } = await managersScene();
    const lastMonth = await getManagers(
      head.id,
      { choice: "last_month", from: null, to: null },
      { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id },
    );
    expect(lastMonth.rows.find((each) => each.id === manager.id)!.held).toBe(100_000n);
  });
});

describe("the Managers block behind the branch wall (03 rule 1; CLAUDE.md rule 4; D40)", () => {
  it("Finance of one branch sees that branch's numbers of a Manager of two", async () => {
    const { manager, finance } = await managersScene();
    const row = (await getManagers(finance.id, THIS_MONTH, NO_ANALYTICS_FILTERS)).rows.find(
      (each) => each.id === manager.id,
    )!;
    expect(row.orders.count).toBe(2);
    expect(row.cancelled.count).toBe(2);
    expect(row.held).toBe(100_000n);
    const cash = await getCashOrders(finance.id, NO_ANALYTICS_FILTERS, false, "all");
    // The other branch's 500 000 held by the same Manager is not in it.
    expect(cash.held).toBe(100_000n);
    const cancelled = await getCancelledRecords(
      finance.id,
      THIS_MONTH,
      NO_ANALYTICS_FILTERS,
      false,
      "all",
    );
    expect(cancelled.count).toBe(2);
  });

  it("the Head sees both branches without a branch filter", async () => {
    const { manager, head } = await managersScene();
    const row = (
      await getManagers(head.id, THIS_MONTH, { ...NO_ANALYTICS_FILTERS, manager: manager.id })
    ).rows.find((each) => each.id === manager.id)!;
    expect(row.orders.count).toBe(3);
    expect(row.cancelled.count).toBe(3);
    expect(row.held).toBe(600_000n);
    expect(row.heldSince).toBe("2031-09-01");
  });

  it("another branch's filter is Not found for Finance of one branch", async () => {
    const { sceneB, finance } = await managersScene();
    const filters = { ...NO_ANALYTICS_FILTERS, branch: sceneB.branch.id };
    await expect(getManagers(finance.id, THIS_MONTH, filters)).rejects.toThrow(AuthorizationError);
    await expect(getCashOrders(finance.id, filters, false, 1)).rejects.toThrow(AuthorizationError);
    await expect(getCancelledRecords(finance.id, THIS_MONTH, filters, false, 1)).rejects.toThrow(
      AuthorizationError,
    );
  });
});
