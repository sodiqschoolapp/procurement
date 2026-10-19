import { describe, expect, it } from "vitest";

import { orderOutcome } from "@/domain/colours";

import {
  bought,
  buyingEvent,
  recordOn,
  refreshNow,
  spendingScene,
} from "../../../../tests/helpers/analytics";
import { setClock } from "../../../../tests/helpers/clock";
import { insertOrder } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { NO_ANALYTICS_FILTERS } from "../../analytics/period-params";

import { getPlanVsActualReport } from "./plan-vs-actual-report";

// The Planned vs actual report (10-notifications-analytics-reports.md, Reports: "Differences per
// order, product and Manager"; 08-money-and-settlement.md, Difference: planned − actual; plan of
// 6.8, decided item 3, Look first, and review correction 3: per product is the planned product).
// Read from `analytics_outcomes`, so the summary is refreshed first.

const AT = "2031-05-15T05:00:00Z";
const MAY = { first: "2031-05-01", last: "2031-05-15" };

describe("per order, product and Manager (10 Reports; 08 Difference)", () => {
  it("adds the order lines into the product and Manager lines, an order of the Head on Other owners", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    // Planned 10 × 5 000 = 50 000; bought 10 × 5 200 = 52 000: 2 000 over.
    const over = await bought(scene, {
      purchasedOn: "2031-05-02",
      qty: "10.000",
      unitPrice: "5200",
      plannedQty: "10",
      plannedPrice: 5_000n,
      progress: "DONE",
    });
    await buyingEvent(over.orderId, over.ownerId, "RECORD_PURCHASE", "2031-05-02T05:00:00Z");
    // The same product, bought at 4 500: 5 000 left.
    const left = await insertOrder({
      branchId: scene.branch.id,
      ownerId: scene.manager.id,
      departmentId: scene.department.id,
      variantId: over.variantId,
      status: "PURCHASING",
      progress: "DONE",
      plannedQty: "10",
      plannedPrice: 5_000n,
    });
    await recordOn(
      scene,
      { id: left.id, ownerId: scene.manager.id, variantId: over.variantId },
      { purchasedOn: "2031-05-03", qty: "10.000", unitPrice: "4500" },
    );
    await buyingEvent(left.id, scene.manager.id, "FINISH_ORDER", "2031-05-03T05:00:00Z");
    // The Head's own order, bought as planned.
    const even = await bought(scene, {
      purchasedOn: "2031-05-04",
      qty: "10.000",
      unitPrice: "5000",
      plannedQty: "10",
      plannedPrice: 5_000n,
      progress: "DONE",
      ownerId: head.id,
    });
    await buyingEvent(even.orderId, head.id, "RECORD_PURCHASE", "2031-05-04T05:00:00Z");
    // Not bought, and ended in April: neither is in the report (plan of 6.4, decided item 3).
    const notBought = await bought(scene, {
      purchasedOn: "2031-05-05",
      progress: "NOT_BOUGHT",
    });
    await buyingEvent(notBought.orderId, notBought.ownerId, "MARK_NOT_BOUGHT", AT);
    const april = await bought(scene, { purchasedOn: "2031-04-20", progress: "DONE" });
    await buyingEvent(april.orderId, april.ownerId, "RECORD_PURCHASE", "2031-04-20T05:00:00Z");
    await refreshNow();

    const report = await getPlanVsActualReport(
      head.id,
      { range: MAY, filters: { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id } },
      "all",
    );
    const byOrder = new Map(report.orders.map((row) => [row.orderId, row]));
    expect([...byOrder.keys()].sort()).toEqual([over.orderId, left.id, even.orderId].sort());
    expect(byOrder.get(over.orderId)).toMatchObject({
      colour: "red",
      planned: 50_000n,
      actual: 52_000n,
      difference: -2_000n,
      endedOn: "2031-05-02",
    });
    // The amounts are orderOutcome()'s (08 Difference).
    expect(
      orderOutcome({
        status: "PURCHASING",
        progress: "DONE",
        plan: { quantity: "10", price: 5_000n, extras: [], paymentType: "CASH" },
        records: [{ qty: "10.000", unitPrice: 4_500n, extras: [], isCancelled: false }],
      }),
    ).toMatchObject({
      planned: byOrder.get(left.id)!.planned,
      actual: byOrder.get(left.id)!.actual,
    });
    expect(byOrder.get(left.id)).toMatchObject({ colour: "amber", difference: 5_000n });
    expect(byOrder.get(even.orderId)).toMatchObject({ colour: "green", difference: 0n });

    expect(report.total).toEqual({
      orders: 3,
      planned: 150_000n,
      actual: 147_000n,
      difference: 3_000n,
    });
    expect(report.products.find((row) => row.id === over.productId)).toMatchObject({
      orders: 2,
      planned: 100_000n,
      actual: 97_000n,
      difference: 3_000n,
    });
    expect(report.products.reduce((sum, row) => sum + row.difference, 0n)).toBe(3_000n);
    expect(report.managers).toEqual([
      {
        id: scene.manager.id,
        name: expect.any(String),
        orders: 2,
        planned: 100_000n,
        actual: 97_000n,
        difference: 3_000n,
      },
      { id: null, name: null, orders: 1, planned: 50_000n, actual: 50_000n, difference: 0n },
    ]);
  });

  it("keeps a substituted order on the product ordered (correction 3)", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    const ordered = await bought(scene, {
      purchasedOn: "2031-05-02",
      qty: "1.000",
      unitPrice: "5000",
      plannedQty: "1",
      plannedPrice: 5_000n,
      progress: "DONE",
    });
    const other = await bought(scene, { purchasedOn: "2031-05-02" });
    // A second record of the ordered order, of another product.
    await recordOn(
      scene,
      { id: ordered.orderId, ownerId: ordered.ownerId, variantId: other.variantId },
      { purchasedOn: "2031-05-02", qty: "1.000", unitPrice: "1000" },
    );
    await buyingEvent(ordered.orderId, ordered.ownerId, "FINISH_ORDER", "2031-05-02T05:00:00Z");
    await refreshNow();
    const report = await getPlanVsActualReport(
      head.id,
      { range: MAY, filters: { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id } },
      "all",
    );
    expect(report.products).toEqual([
      expect.objectContaining({ id: ordered.productId, orders: 1, actual: 6_000n }),
    ]);
  });

  it("shows the orders 25 a page and the sums of all of them (11-screens-and-ux.md rule 8)", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    for (let at = 0; at <= 25; at += 1) {
      const order = await bought(scene, { purchasedOn: "2031-05-06", progress: "DONE" });
      await buyingEvent(order.orderId, order.ownerId, "RECORD_PURCHASE", "2031-05-06T05:00:00Z");
    }
    await refreshNow();
    const params = { range: MAY, filters: { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id } };
    const first = await getPlanVsActualReport(head.id, params, 1);
    const second = await getPlanVsActualReport(head.id, params, 2);
    expect([first.orders.length, second.orders.length, first.pages]).toEqual([25, 1, 2]);
    expect(second.total.orders).toBe(26);
  });
});
