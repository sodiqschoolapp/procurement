import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  type SpendingScene,
  bought,
  decided,
  refreshNow,
  spendingScene,
} from "../../../../tests/helpers/analytics";
import { setClock } from "../../../../tests/helpers/clock";
import { setOrderStatus } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { type AnalyticsFilters, NO_ANALYTICS_FILTERS, type PeriodInput } from "../period-params";

import { getOrderStatuses } from "./order-statuses";
import { getStatusOrders } from "./status-orders";

// The Principal's Orders block and its list (build-plan 6.5a; 10-notifications-analytics-
// reports.md, Analytics page per role, Principal, Orders: "By status; needed-by dates coming up;
// overdue orders", points 1 and 3; edge-cases/requests-and-approval.md, "The needed-by date passes
// while the order waits"; plan of 6.5a, decided items 2, 4 and 6). 16 October 2031 in Tashkent:
// this month is October, the period before September; coming up is 16 to 23 October.

const THIS_MONTH: PeriodInput = { choice: "this_month", from: null, to: null };
const TODAY = "2031-10-16T05:00:00Z";
const OCTOBER = "2031-10-02T05:00:00Z";

let scene: SpendingScene;
let principal: string;
let filters: AnalyticsFilters;
const ids: Record<string, string> = {};

beforeAll(async () => {
  setClock(TODAY);
  scene = await spendingScene();
  principal = (await insertUser("PRINCIPAL", { branches: [scene.branch.id] })).id;
  filters = { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id };
  const order = async (
    name: string,
    status: Parameters<typeof decided>[1],
    row: Parameters<typeof decided>[3] = {},
  ) => {
    ids[name] = (await decided(scene, status, [], { submittedAt: OCTOBER, ...row })).id;
  };
  // Coming up: today and today + 7, at each status that still waits.
  await order("today", "PENDING_HEAD", { neededBy: "2031-10-16" });
  await order("lastDay", "RETURNED", { neededBy: "2031-10-23" });
  await order("openBuying", "PURCHASING", { neededBy: "2031-10-20" });
  // Not coming up: today + 8.
  await order("dayAfter", "PENDING_FINANCE", { neededBy: "2031-10-24" });
  // Overdue: yesterday, Waiting for Principal; and an Open order still buying.
  await order("yesterday", "PENDING_PRINCIPAL", { neededBy: "2031-10-15" });
  await order("lateBuying", "PURCHASING", { neededBy: "2031-10-01" });
  // Neither, though their dates are in the windows: buying finished, or no longer waiting.
  await order("doneBuying", "PURCHASING", { neededBy: "2031-10-01", progress: "DONE" });
  await order("settlement", "SETTLEMENT", { neededBy: "2031-10-17" });
  await order("closed", "CLOSED", { neededBy: "2031-10-01" });
  await order("rejected", "REJECTED", { neededBy: "2031-10-17" });
  await order("cancelled", "CANCELLED", { neededBy: "2031-10-01" });
  // Submitted in September: in the period before only.
  await order("september", "CLOSED", {
    submittedAt: "2031-09-10T05:00:00Z",
    neededBy: "2031-12-01",
  });
  // A Draft never submitted is never a row.
  await decided(scene, "DRAFT", []);
  // An order of another branch, coming up, overdue-free: never counted here.
  const other = await spendingScene();
  await decided(other, "PENDING_HEAD", [], { submittedAt: OCTOBER, neededBy: "2031-10-16" });
  await refreshNow();
});

beforeEach(() => setClock(TODAY));

describe("getOrderStatuses (10 Principal, Orders; plan of 6.5a, decided items 2 and 4)", () => {
  it("counts the orders first submitted in the period by their status now, each against the period before", async () => {
    const block = await getOrderStatuses(principal, THIS_MONTH, filters);
    expect(block.statuses.map((row) => [row.status, row.count, row.change.difference])).toEqual([
      ["PENDING_HEAD", 1, 1n],
      ["PENDING_PRINCIPAL", 1, 1n],
      ["PENDING_FINANCE", 1, 1n],
      ["RETURNED", 1, 1n],
      ["PURCHASING", 3, 3n],
      ["SETTLEMENT", 1, 1n],
      ["CLOSED", 1, 0n],
      ["REJECTED", 1, 1n],
      ["CANCELLED", 1, 1n],
    ]);
    expect(block.total).toMatchObject({
      count: 11,
      change: { difference: 10n, percent: "1000.0" },
    });
  });

  it("coming up is today to today + 7 of the orders that still wait; overdue, before today, is apart", async () => {
    const block = await getOrderStatuses(principal, THIS_MONTH, filters);
    expect(block.today).toBe("2031-10-16");
    expect(block.comingUp).toBe(3);
    expect(block.overdue).toBe(2);
    const soon = await getStatusOrders(
      principal,
      THIS_MONTH,
      filters,
      { kind: "due", due: "soon" },
      "all",
    );
    expect(new Set(soon.rows.map((row) => row.orderId))).toEqual(
      new Set([ids.today, ids.lastDay, ids.openBuying]),
    );
    const late = await getStatusOrders(
      principal,
      THIS_MONTH,
      filters,
      { kind: "due", due: "overdue" },
      "all",
    );
    expect(late.count).toBe(2);
    expect(late.rows.map((row) => [row.orderId, row.overdue])).toEqual([
      [ids.lateBuying, true],
      [ids.yesterday, true],
    ]);
  });

  it("coming up and overdue ignore the period: the same in September", async () => {
    const block = await getOrderStatuses(
      principal,
      { choice: "last_month", from: null, to: null },
      filters,
    );
    expect([block.comingUp, block.overdue]).toEqual([3, 2]);
    expect(block.statuses.map((row) => [row.status, row.count])).toEqual([["CLOSED", 1]]);
  });

  it("a status's list is the number clicked (10 point 3)", async () => {
    const list = await getStatusOrders(
      principal,
      THIS_MONTH,
      filters,
      { kind: "status", status: "PURCHASING" },
      1,
    );
    expect(list.count).toBe(3);
    expect(new Set(list.rows.map((row) => row.orderId))).toEqual(
      new Set([ids.openBuying, ids.lateBuying, ids.doneBuying]),
    );
    expect(list.rows.find((row) => row.orderId === ids.doneBuying)?.overdue).toBe(false);
  });

  it("the total's list is the total clicked: every status, September and the other branch out (build-plan 6.5a-2; 10 point 3)", async () => {
    const block = await getOrderStatuses(principal, THIS_MONTH, filters);
    const list = await getStatusOrders(
      principal,
      THIS_MONTH,
      filters,
      { kind: "status", status: null },
      "all",
    );
    expect(list.count).toBe(block.total.count);
    const october = Object.entries(ids)
      .filter(([name]) => name !== "september")
      .map(([, id]) => id);
    expect(new Set(list.rows.map((row) => row.orderId))).toEqual(new Set(october));
    expect(list.rows).toHaveLength(11);
  });

  it("a key of another list is refused", async () => {
    await expect(
      getStatusOrders(principal, THIS_MONTH, filters, { kind: "period" }, 1),
    ).rejects.toThrow("Refused");
  });
});

describe("the draft wall on the live status (06 Statuses; .claude/rules/server-actions.md; plan of 6.5a, decided item 6)", () => {
  it("an order taken back since the refresh is gone from the Principal's numbers and lists at once, and stays for its owner", async () => {
    // Every other value lets it in: this branch, October, coming up, a status that still waits.
    const order = await decided(scene, "PENDING_HEAD", [], {
      submittedAt: OCTOBER,
      neededBy: "2031-10-17",
    });
    await refreshNow();
    const before = await getOrderStatuses(principal, THIS_MONTH, filters);
    await setOrderStatus(order.id, "DRAFT");
    const after = await getOrderStatuses(principal, THIS_MONTH, filters);
    expect(after.comingUp).toBe(before.comingUp - 1);
    expect(after.total.count).toBe(before.total.count - 1);
    const list = await getStatusOrders(
      principal,
      THIS_MONTH,
      filters,
      { kind: "status", status: "PENDING_HEAD" },
      "all",
    );
    expect(list.rows.map((row) => row.orderId)).not.toContain(order.id);
    // The total's list as well (build-plan 6.5a-2).
    const total = await getStatusOrders(
      principal,
      THIS_MONTH,
      filters,
      { kind: "status", status: null },
      "all",
    );
    expect(total.count).toBe(after.total.count);
    expect(total.rows.map((row) => row.orderId)).not.toContain(order.id);
    const ownersTotal = await getStatusOrders(
      scene.manager.id,
      THIS_MONTH,
      filters,
      { kind: "status", status: null },
      "all",
    );
    expect(ownersTotal.rows.map((row) => row.orderId)).toContain(order.id);
    const owners = await getStatusOrders(
      scene.manager.id,
      THIS_MONTH,
      filters,
      { kind: "status", status: "PENDING_HEAD" },
      "all",
    );
    expect(owners.rows.map((row) => row.orderId)).toContain(order.id);
    // Another Manager and Finance of the branch do not see it; the Head does (permission review,
    // Should fix 1).
    const seenBy = async (userId: string) =>
      (
        await getStatusOrders(
          userId,
          THIS_MONTH,
          filters,
          { kind: "status", status: "PENDING_HEAD" },
          "all",
        )
      ).rows.some((row) => row.orderId === order.id);
    const colleague = await insertUser("MANAGER", { branches: [scene.branch.id] });
    const finance = await insertUser("FINANCE", { branches: [scene.branch.id] });
    const head = await insertUser("HEAD");
    expect(await seenBy(colleague.id)).toBe(false);
    expect(await seenBy(finance.id)).toBe(false);
    expect(await seenBy(head.id)).toBe(true);
    // Put back for the other tests.
    await setOrderStatus(order.id, "CANCELLED");
    await refreshNow();
  });
});

describe("the supplier filter (10 point 2)", () => {
  it("keeps an order with a record not cancelled from that supplier", async () => {
    const record = await bought(scene, { purchasedOn: "2031-10-03" });
    await refreshNow();
    const list = await getStatusOrders(
      principal,
      THIS_MONTH,
      { ...filters, supplier: scene.supplier.id },
      { kind: "status", status: "PURCHASING" },
      "all",
    );
    expect(list.rows.map((row) => row.orderId)).toEqual([record.orderId]);
  });
});
