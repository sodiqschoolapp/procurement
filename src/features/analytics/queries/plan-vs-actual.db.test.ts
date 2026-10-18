import { describe, expect, it } from "vitest";

import { AuthorizationError } from "@/server/authorize";

import {
  type Bought,
  type SpendingScene,
  bought,
  buyingEvent,
  recordOn,
  refreshNow,
  spendingScene,
} from "../../../../tests/helpers/analytics";
import { insertCompany } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertUser } from "../../../../tests/helpers/users";
import { type DrillKey, NO_ANALYTICS_FILTERS, type PeriodInput } from "../period-params";
import { PeriodRefusedError } from "../resolve-period";

import { getOutcomeOrders } from "./outcome-orders";
import { getPlanVsActual } from "./plan-vs-actual";

// The Head's Plan vs actual block and its drill-down (build-plan 6.4a;
// 10-notifications-analytics-reports.md, Analytics page per role, Head, Plan vs actual: "Share of
// orders ending green, orange and red; total overspent and total saved; by branch and by Manager",
// points 1 to 3; 08 Difference and The three colours; 03 rule 1; plan of 6.4, decided items 3 to
// 7; review of the plan, correction 1). 15 October 2031 in Tashkent: this month is October, the
// period before September. Each planned 10 × 5 000 = 50 000.

const THIS_MONTH: PeriodInput = { choice: "this_month", from: null, to: null };

async function ended(scene: SpendingScene, row: Bought, at: string) {
  const order = await bought(scene, { qty: "10.000", progress: "DONE", ...row });
  await buyingEvent(order.orderId, order.ownerId, "RECORD_PURCHASE", at);
  return order;
}

/** The scene of the block: four orders ended in October, one in September, one in November. */
async function planScene() {
  setClock("2031-10-15T05:00:00Z");
  const scene = await spendingScene();
  const head = await insertUser("HEAD");
  const other = await insertCompany();
  const unused = await insertCompany();
  const red = await ended(
    scene,
    { purchasedOn: "2031-10-03", unitPrice: "5200" },
    "2031-10-03T05:00:00Z",
  );
  const amber = await ended(
    scene,
    { purchasedOn: "2031-10-04", qty: "9.000", unitPrice: "5000", progress: "DONE_SHORT" },
    "2031-10-04T05:00:00Z",
  );
  // 19:30 UTC on 30 September is 1 October in Tashkent (CLAUDE.md rule 10).
  const green = await ended(
    scene,
    { purchasedOn: "2031-09-30", unitPrice: "5000" },
    "2031-09-30T19:30:00Z",
  );
  // A cancelled record of another supplier: no live record of it (decided item 6).
  await recordOn(
    scene,
    { id: green.orderId, ownerId: green.ownerId, variantId: green.variantId },
    { purchasedOn: "2031-09-30", supplierId: unused.id, cancelled: true },
  );
  // An order the Head owns (03 rule 6), bought from another supplier: red −1 000.
  const headRed = await ended(
    scene,
    { purchasedOn: "2031-10-05", unitPrice: "5100", ownerId: head.id, supplierId: other.id },
    "2031-10-05T05:00:00Z",
  );
  // Not bought: no outcome (decided item 4).
  const notBought = await bought(scene, {
    purchasedOn: "2031-10-05",
    cancelled: true,
    progress: "NOT_BOUGHT",
  });
  await buyingEvent(
    notBought.orderId,
    notBought.ownerId,
    "MARK_NOT_BOUGHT",
    "2031-10-05T05:00:00Z",
  );
  // 18:30 UTC on 30 September is 23:30 in Tashkent: the period before, red −3 000.
  await ended(scene, { purchasedOn: "2031-09-30", unitPrice: "5300" }, "2031-09-30T18:30:00Z");
  // 19:30 UTC on 31 October is 1 November: in neither period (D40).
  await ended(scene, { purchasedOn: "2031-10-31", unitPrice: "5200" }, "2031-10-31T19:30:00Z");
  await refreshNow();
  return { scene, head, other, unused, red, amber, green, headRed };
}

describe("the counts, shares, overspent and saved (10 Head, Plan vs actual; decided items 3 to 7)", () => {
  it("counts the orders ended in the period by colour, with their changes", async () => {
    const { scene, head } = await planScene();
    const block = await getPlanVsActual(head.id, THIS_MONTH, {
      ...NO_ANALYTICS_FILTERS,
      branch: scene.branch.id,
    });
    const { total } = block;
    expect(total.orders).toEqual({ count: 4, change: { difference: 3n, percent: "300.0" } });
    expect(total.colours.green).toEqual({
      count: 1,
      change: { difference: 1n, percent: null },
      share: "25.0",
      shareChange: "25.0",
    });
    expect(total.colours.amber).toMatchObject({ count: 1, share: "25.0" });
    expect(total.colours.red).toEqual({
      count: 2,
      change: { difference: 1n, percent: "100.0" },
      share: "50.0",
      shareChange: "-50.0",
    });
    // Overspent 2 000 + 1 000 against 3 000; saved 5 000 against none.
    expect(total.overspent).toEqual({ amount: 3_000n, change: { difference: 0n, percent: "0.0" } });
    expect(total.saved).toEqual({ amount: 5_000n, change: { difference: 5_000n, percent: null } });
  });

  it("adds up by branch and by Manager, with the owners who are not Managers in one row", async () => {
    const { scene, head } = await planScene();
    const block = await getPlanVsActual(head.id, THIS_MONTH, {
      ...NO_ANALYTICS_FILTERS,
      branch: scene.branch.id,
    });
    expect(block.branches.map((row) => [row.id, row.orders.count])).toEqual([[scene.branch.id, 4]]);
    expect(block.managers.map((row) => [row.id, row.orders.count, row.overspent.amount])).toEqual([
      [scene.manager.id, 3, 2_000n],
      [null, 1, 1_000n],
    ]);
    const sum = (pick: (row: (typeof block.managers)[number]) => bigint) =>
      block.managers.reduce((all, row) => all + pick(row), 0n);
    expect(sum((row) => BigInt(row.orders.count))).toBe(BigInt(block.total.orders.count));
    expect(sum((row) => row.overspent.amount)).toBe(block.total.overspent.amount);
    expect(sum((row) => row.saved.amount)).toBe(block.total.saved.amount);
  });
});

describe("each number equals its drill-down list (10 point 3; decided item 9)", () => {
  it("every ended order, a colour, the overspent, the saved, a Manager, the other owners", async () => {
    const { scene, head, red, amber, green, headRed } = await planScene();
    const filters = { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id };
    const block = await getPlanVsActual(head.id, THIS_MONTH, filters);
    const list = (key: DrillKey, otherOwners = false, scope = filters) =>
      getOutcomeOrders(head.id, THIS_MONTH, scope, key, otherOwners, "all");

    const all = await list({ kind: "period" });
    expect(all.count).toBe(block.total.orders.count);
    expect(all.rows.map((row) => row.orderId).sort()).toEqual(
      [red.orderId, amber.orderId, green.orderId, headRed.orderId].sort(),
    );
    expect(all.sum).toBe(-2_000n + 5_000n + 0n - 1_000n);
    expect(all.rows.reduce((sum, row) => sum + row.difference, 0n)).toBe(all.sum);

    for (const colour of ["green", "amber", "red"] as const) {
      const rows = await list({ kind: "colour", colour });
      expect(rows.count, colour).toBe(block.total.colours[colour].count);
      expect(rows.rows.every((row) => row.colour === colour)).toBe(true);
    }
    const overspent = await list({ kind: "overspent" });
    expect(overspent.sum).toBe(block.total.overspent.amount);
    expect(overspent.rows.reduce((sum, row) => sum - row.difference, 0n)).toBe(overspent.sum);
    expect((await list({ kind: "saved" })).sum).toBe(block.total.saved.amount);

    const [managerRow, othersRow] = block.managers;
    const mine = await list({ kind: "period" }, false, { ...filters, manager: scene.manager.id });
    expect(mine.count).toBe(managerRow!.orders.count);
    const others = await list({ kind: "overspent" }, true);
    expect(others.rows.map((row) => row.orderId)).toEqual([headRed.orderId]);
    expect(others.sum).toBe(othersRow!.overspent.amount);
  });

  it("the supplier filter keeps an order with a live record from that supplier (decided item 6)", async () => {
    const { scene, head, other, unused, headRed } = await planScene();
    const filters = { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id };
    const bySupplier = await getPlanVsActual(head.id, THIS_MONTH, {
      ...filters,
      supplier: other.id,
    });
    expect(bySupplier.total.orders.count).toBe(1);
    const list = await getOutcomeOrders(
      head.id,
      THIS_MONTH,
      { ...filters, supplier: other.id },
      { kind: "period" },
      false,
      "all",
    );
    expect(list.rows.map((row) => row.orderId)).toEqual([headRed.orderId]);
    // Only a cancelled record of `unused`: no order.
    const none = await getPlanVsActual(head.id, THIS_MONTH, { ...filters, supplier: unused.id });
    expect(none.total.orders.count).toBe(0);
  });

  it("refuses a Spending key", async () => {
    const { scene, head } = await planScene();
    await expect(
      getOutcomeOrders(
        head.id,
        THIS_MONTH,
        { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id },
        { kind: "payment", payment: "CASH" },
        false,
        1,
      ),
    ).rejects.toBeInstanceOf(PeriodRefusedError);
  });
});

describe("the branch wall (03 rule 1; developer-rules rule 4)", () => {
  it("never counts another branch's orders, and refuses its filter", async () => {
    const { scene } = await planScene();
    const elsewhere = await spendingScene();
    await ended(
      elsewhere,
      { purchasedOn: "2031-10-03", unitPrice: "5200" },
      "2031-10-03T05:00:00Z",
    );
    await refreshNow();
    const block = await getPlanVsActual(elsewhere.manager.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    expect(block.branches.map((row) => row.id)).toEqual([elsewhere.branch.id]);
    expect(block.total.orders.count).toBe(1);
    const list = await getOutcomeOrders(
      elsewhere.manager.id,
      THIS_MONTH,
      NO_ANALYTICS_FILTERS,
      { kind: "period" },
      true,
      "all",
    );
    expect(list.count).toBe(0);
    await expect(
      getPlanVsActual(elsewhere.manager.id, THIS_MONTH, {
        ...NO_ANALYTICS_FILTERS,
        branch: scene.branch.id,
      }),
    ).rejects.toMatchObject(new AuthorizationError("not_found"));
  });
});
