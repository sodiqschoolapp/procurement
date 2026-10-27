import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getPlanVsActualReport } from "@/features/reports/queries/plan-vs-actual-report";
import { db } from "@/server/db/client";

import {
  type Bought,
  type SpendingScene,
  bought,
  buyingEvent,
  decided,
  recordOn,
  refreshNow,
  spendingScene,
} from "../../../../tests/helpers/analytics";
import { setClock } from "../../../../tests/helpers/clock";
import { setOrderStatus } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { NO_ANALYTICS_FILTERS, type PeriodInput } from "../period-params";

import { getCashNeeded } from "./cash-needed";
import { getManagers } from "./managers";
import { getMyEstimates } from "./my-estimates";
import { getNeededOrders } from "./needed-orders";
import { getOutcomeOrders } from "./outcome-orders";
import { getPlanVsActual } from "./plan-vs-actual";
import { getSpendingRecords } from "./spending-records";

// Every planned sum of analytics and reports that leaves orders without a planned price out says
// how many (08-money-and-settlement.md, Numbers the system calculates: "a sum that leaves orders
// out says how many"; build plan 2.5d-c, Build 2; plan of 2.5d-c, decided items 3 to 7, Look
// first). Each count is of a period (with its change) or of now (Cash needed soon), opens the list
// behind it (10 Analytics point 3), and stands beside each breakdown line that is itself a planned
// sum. 15 October 2031 in Tashkent: this month is October, the period before September.

const THIS_MONTH: PeriodInput = { choice: "this_month", from: null, to: null };
const OCTOBER = { first: "2031-10-01", last: "2031-10-31" };

async function ended(scene: SpendingScene, row: Bought, at: string) {
  const order = await bought(scene, { qty: "10.000", progress: "DONE", ...row });
  await buyingEvent(order.orderId, order.ownerId, "RECORD_PURCHASE", at);
  return order;
}

/**
 * A branch with one priced ended order (+100 000 left of 600 000) and one unpriced ended order of
 * its Manager in October, one unpriced ended in September (the period before), and beside them
 * an unpriced order of another branch and one ended in November, each given every other value that
 * would let it in (D46).
 */
async function endedScene() {
  setClock("2031-10-15T05:00:00Z");
  const scene = await spendingScene();
  const head = await insertUser("HEAD");
  const priced = await ended(
    scene,
    { purchasedOn: "2031-10-03", unitPrice: "50000", plannedPrice: 60_000n },
    "2031-10-03T05:00:00Z",
  );
  const unpriced = await ended(
    scene,
    { purchasedOn: "2031-10-04", unitPrice: "4500", plannedPrice: null },
    "2031-10-04T05:00:00Z",
  );
  await ended(
    scene,
    { purchasedOn: "2031-09-10", unitPrice: "4500", plannedPrice: null },
    "2031-09-10T05:00:00Z",
  );
  await ended(
    scene,
    { purchasedOn: "2031-11-02", unitPrice: "4500", plannedPrice: null },
    "2031-11-02T05:00:00Z",
  );
  const other = await spendingScene();
  await ended(
    other,
    { purchasedOn: "2031-10-04", unitPrice: "4500", plannedPrice: null },
    "2031-10-04T05:00:00Z",
  );
  await refreshNow();
  return { scene, head, priced, unpriced, other };
}

describe("Plan vs actual counts the ended orders without a planned price (08 Numbers; 10 Head and Finance, Plan vs actual)", () => {
  it("on the whole, its branch and its Manager, with the change against the period before; never in the colours or sums", async () => {
    const { scene, head } = await endedScene();
    const block = await getPlanVsActual(head.id, THIS_MONTH, {
      ...NO_ANALYTICS_FILTERS,
      branch: scene.branch.id,
    });
    expect(block.total.orders.count).toBe(1);
    expect(block.total.unpriced).toEqual({
      count: 1,
      change: { difference: 0n, percent: "0.0" },
    });
    expect(block.total.saved.amount).toBe(100_000n);
    expect(block.branches.map((row) => [row.id, row.unpriced.count])).toEqual([
      [scene.branch.id, 1],
    ]);
    expect(block.managers.map((row) => [row.id, row.unpriced.count])).toEqual([
      [scene.manager.id, 1],
    ]);
  });

  it("a branch with only unpriced ended orders has its line, with no outcome", async () => {
    const { other, head } = await endedScene();
    const block = await getPlanVsActual(head.id, THIS_MONTH, {
      ...NO_ANALYTICS_FILTERS,
      branch: other.branch.id,
    });
    expect(block.branches).toHaveLength(1);
    expect(block.branches[0]).toMatchObject({ id: other.branch.id, orders: { count: 0 } });
    expect(block.branches[0]!.unpriced.count).toBe(1);
  });

  it("the count opens its list: key=unpriced lists the unpriced ended order alone, with its actual total (10 point 3)", async () => {
    const { scene, head, unpriced } = await endedScene();
    const list = await getOutcomeOrders(
      head.id,
      THIS_MONTH,
      { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id },
      { kind: "unpriced" },
      false,
      "all",
    );
    expect(list.count).toBe(1);
    expect(list.rows).toEqual([
      expect.objectContaining({
        orderId: unpriced.orderId,
        colour: null,
        planned: null,
        difference: null,
        actual: 45_000n,
      }),
    ]);
    expect(list.sum).toBe(45_000n);
  });

  it("the refresh writes an ended unpriced order to analytics_unpriced and not to analytics_outcomes (plan of 2.5d-c, review correction 1)", async () => {
    const { scene, head, priced, unpriced } = await endedScene();
    // An unpriced order still buying has not ended: neither an outcome nor unpriced. (An unpriced
    // Done order of a status outside buying, the other case orderEnd() leaves out, is refused by
    // orders_progress_status_check; colours.test.ts holds it.)
    const outside = await bought(scene, {
      purchasedOn: "2031-10-04",
      unitPrice: "4500",
      plannedPrice: null,
    });
    await buyingEvent(outside.orderId, outside.ownerId, "RECORD_PURCHASE", "2031-10-04T05:00:00Z");
    await refreshNow();
    const ids = async (table: "analytics_outcomes" | "analytics_unpriced") =>
      (
        await getOutcomeOrders(
          head.id,
          THIS_MONTH,
          { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id },
          table === "analytics_unpriced" ? { kind: "unpriced" } : { kind: "period" },
          false,
          "all",
        )
      ).rows.map((row) => row.orderId);
    expect(await ids("analytics_outcomes")).toEqual([priced.orderId]);
    expect(await ids("analytics_unpriced")).toEqual([unpriced.orderId]);
    expect(await ids("analytics_unpriced")).not.toContain(outside.orderId);
  });
});

describe("the Head's Managers block (10 Head, Managers; plan of 2.5d-c, decided item 5, Look first)", () => {
  it("a Manager with one priced and one unpriced ended order: 2 orders, the average of the priced one, 1 without a price", async () => {
    const { scene, head } = await endedScene();
    const block = await getManagers(head.id, THIS_MONTH, {
      ...NO_ANALYTICS_FILTERS,
      branch: scene.branch.id,
    });
    const row = block.rows.find((each) => each.id === scene.manager.id)!;
    expect(row.orders.count).toBe(2);
    // September had 1 unpriced ended order: 2 against 1.
    expect(row.orders.change.difference).toBe(1n);
    expect(row.average).toBe(100_000n);
    expect(row.unpriced.count).toBe(1);
  });

  // 10 Analytics point 3: the number opens the list that makes it up (review of 2.5d-c, finding 1).
  it("its orders number opens every ended order of the Manager: 2 counted, 2 listed, the difference of the priced one and 1 without a price", async () => {
    const { scene, head, priced, unpriced } = await endedScene();
    const filters = { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id, manager: scene.manager.id };
    const block = await getManagers(head.id, THIS_MONTH, filters);
    const row = block.rows.find((each) => each.id === scene.manager.id)!;
    const list = await getOutcomeOrders(
      head.id,
      THIS_MONTH,
      filters,
      { kind: "ended" },
      false,
      "all",
    );
    expect(list.count).toBe(row.orders.count);
    expect(list.rows).toHaveLength(2);
    expect(list.rows.map((each) => each.orderId).sort()).toEqual(
      [priced.orderId, unpriced.orderId].sort(),
    );
    expect(list.sum).toBe(100_000n);
    expect(list.unpriced).toBe(1);
    expect(list.rows.find((each) => each.orderId === unpriced.orderId)).toMatchObject({
      colour: null,
      planned: null,
      difference: null,
    });
    // The other branch's unpriced ended order of October is not in the branch's list.
    const all = await getOutcomeOrders(
      head.id,
      THIS_MONTH,
      { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id },
      { kind: "ended" },
      false,
      "all",
    );
    expect(all.count).toBe(2);
    // The average keeps its link to the priced ones.
    const period = await getOutcomeOrders(
      head.id,
      THIS_MONTH,
      filters,
      { kind: "period" },
      false,
      "all",
    );
    expect(period.rows.map((each) => each.orderId)).toEqual([priced.orderId]);
    expect(period.unpriced).toBe(0);
  });
});

describe("the Planned vs actual report (10 Reports; plan of 2.5d-c, decided item 3, Look first)", () => {
  it("says 1 without a price on its total, the order's product line and its Manager line", async () => {
    const { scene, head, unpriced } = await endedScene();
    const report = await getPlanVsActualReport(
      head.id,
      { range: OCTOBER, filters: { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id } },
      "all",
    );
    expect(report.total).toMatchObject({ orders: 1, difference: 100_000n, unpriced: 1 });
    expect(report.products.find((row) => row.id === unpriced.productId)).toMatchObject({
      orders: 0,
      unpriced: 1,
    });
    expect(report.managers.find((row) => row.id === scene.manager.id)).toMatchObject({
      orders: 1,
      unpriced: 1,
    });
    expect(report.orders.map((row) => row.orderId)).not.toContain(unpriced.orderId);
  });
});

describe("Cash needed soon (10 Finance; plan of 2.5d-c, decided item 7)", () => {
  it("counts an unpriced order waiting for the Principal in its step, approval and all; a Done one and a taken-back Draft not", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const finance = await insertUser("FINANCE", { branches: [scene.branch.id] });
    const priced = await decided(scene, "PENDING_PRINCIPAL", []);
    const waiting = await decided(scene, "PENDING_PRINCIPAL", [], { plannedPrice: null });
    // Every other value that would let them in: in approval at the refresh, without a price.
    await decided(scene, "PURCHASING", [], { progress: "DONE", plannedPrice: null });
    const takenBack = await decided(scene, "PENDING_HEAD", [], { plannedPrice: null });
    await refreshNow();
    await setOrderStatus(takenBack.id, "DRAFT");

    const block = await getCashNeeded(finance.id, NO_ANALYTICS_FILTERS);
    expect(block.approval).toEqual({ amount: 50_000n, count: 1, unpriced: 1 });
    expect(block.all).toEqual({ amount: 50_000n, count: 1, unpriced: 1 });
    expect(block.open.unpriced).toBe(0);
    expect(block.steps.find((step) => step.step === "PENDING_PRINCIPAL")).toMatchObject({
      count: 1,
      unpriced: 1,
    });
    expect(block.steps.find((step) => step.step === "PENDING_HEAD")!.unpriced).toBe(0);

    const list = await getNeededOrders(
      finance.id,
      NO_ANALYTICS_FILTERS,
      "approval",
      null,
      "all",
      true,
    );
    expect(list.rows.map((row) => row.orderId)).toEqual([waiting.id]);
    expect(list.rows[0]!.plannedCash).toBeNull();
    expect(list.rows.map((row) => row.orderId)).not.toContain(priced.id);
  });
});

describe('Cash needed soon counts only the Cash orders without a price (08 When Finance approves, "else 0"; review of 2.5d-c, finding 2, Look first)', () => {
  it("an unpriced Bank transfer or Card order waiting for the Principal is counted at no step and is in no unpriced list; the Cash one is", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const finance = await insertUser("FINANCE", { branches: [scene.branch.id] });
    const cash = await decided(scene, "PENDING_PRINCIPAL", [], { plannedPrice: null });
    const transfer = await decided(scene, "PENDING_PRINCIPAL", [], {
      plannedPrice: null,
      paymentType: "TRANSFER",
    });
    const card = await decided(scene, "PENDING_PRINCIPAL", [], {
      plannedPrice: null,
      paymentType: "CARD",
    });
    await refreshNow();

    const block = await getCashNeeded(finance.id, NO_ANALYTICS_FILTERS);
    expect(block.approval.unpriced).toBe(1);
    expect(block.all.unpriced).toBe(1);
    expect(block.open.unpriced).toBe(0);
    for (const step of block.steps) {
      expect(step.unpriced).toBe(step.step === "PENDING_PRINCIPAL" ? 1 : 0);
    }

    for (const stage of ["approval", "open", "all"] as const) {
      const list = await getNeededOrders(
        finance.id,
        NO_ANALYTICS_FILTERS,
        stage,
        null,
        "all",
        true,
      );
      const ids = list.rows.map((row) => row.orderId);
      expect(ids).toEqual(stage === "open" ? [] : [cash.id]);
      expect(ids).not.toContain(transfer.id);
      expect(ids).not.toContain(card.id);
    }
    const step = await getNeededOrders(
      finance.id,
      NO_ANALYTICS_FILTERS,
      "approval",
      "PENDING_PRINCIPAL",
      "all",
      true,
    );
    expect(step.rows.map((row) => row.orderId)).toEqual([cash.id]);
  });
});

// 06 Finance step switched off 2: an order that skipped Finance has no cash count and needs
// nothing, so Cash needed soon does not leave it out for lack of a price; cashNeeded() alone
// decides which orders are left out (08 Numbers; review of 2.5d-c at bad1f3f, finding 1, Look
// first).
describe("Cash needed soon does not count an unpriced Cash order that skipped Finance (06 Finance step switched off 2; review of 2.5d-c at bad1f3f, finding 1, Look first)", () => {
  it("an unpriced Cash Open order that skipped Finance is counted at no stage and in no unpriced list; one that went through Finance is", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const finance = await insertUser("FINANCE", { branches: [scene.branch.id] });
    const through = await decided(scene, "PURCHASING", [], { plannedPrice: null });
    const skipped = await decided(scene, "PURCHASING", [], { plannedPrice: null });
    await db.execute(sql`update orders set skipped_finance = true where id = ${skipped.id}`);
    await refreshNow();

    const block = await getCashNeeded(finance.id, NO_ANALYTICS_FILTERS);
    expect(block.open).toEqual({ amount: 0n, count: 0, unpriced: 1 });
    expect(block.all.unpriced).toBe(1);
    expect(block.approval.unpriced).toBe(0);

    for (const stage of ["approval", "open", "all"] as const) {
      const list = await getNeededOrders(
        finance.id,
        NO_ANALYTICS_FILTERS,
        stage,
        null,
        "all",
        true,
      );
      const ids = list.rows.map((row) => row.orderId);
      expect(ids).toEqual(stage === "approval" ? [] : [through.id]);
      expect(ids).not.toContain(skipped.id);
    }
  });
});

describe("My estimates (10 Manager, My estimates; plan of 2.5d-c, review correction 2)", () => {
  it("counts the records of an unpriced order, on all and on its product, and its list holds those records", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const priced = await bought(scene, {
      purchasedOn: "2031-10-03",
      qty: "10.000",
      unitPrice: "5500",
    });
    // One unpriced order with two priced records in the period: the count is of the records.
    const unpriced = await bought(scene, {
      purchasedOn: "2031-10-04",
      unitPrice: "4500",
      plannedPrice: null,
    });
    const second = await recordOn(
      scene,
      { id: unpriced.orderId, ownerId: unpriced.ownerId, variantId: unpriced.variantId },
      { purchasedOn: "2031-10-05", unitPrice: "4600" },
    );
    await refreshNow();
    const mine = { ...NO_ANALYTICS_FILTERS, manager: scene.manager.id };
    const block = await getMyEstimates(scene.manager.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    expect(block.all.records).toBe(1);
    expect(block.all.unpriced.count).toBe(2);
    expect(block.products.find((row) => row.productId === unpriced.productId)).toMatchObject({
      records: 0,
      unpriced: { count: 2 },
    });
    expect(block.products.find((row) => row.productId === priced.productId)).toMatchObject({
      records: 1,
      unpriced: { count: 0 },
    });

    const list = await getSpendingRecords(
      scene.manager.id,
      THIS_MONTH,
      mine,
      { kind: "priced", product: null, unpriced: true },
      "all",
    );
    expect(list.rows.map((row) => row.purchaseId).sort()).toEqual(
      [unpriced.purchaseId, second.purchaseId].sort(),
    );
    // The estimate's own list holds the priced order's record alone (2.5d-b left the others out).
    const own = await getSpendingRecords(
      scene.manager.id,
      THIS_MONTH,
      mine,
      { kind: "priced", product: null },
      "all",
    );
    expect(own.rows.map((row) => row.purchaseId)).toEqual([priced.purchaseId]);
  });
});
