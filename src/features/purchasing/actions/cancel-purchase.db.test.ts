import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import {
  notifications,
  orderEvents,
  orders,
  productVariants,
  purchaseTrips,
  purchases,
  stockBalances,
  stockMovements,
} from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";
import { postMovement } from "@/server/stock-ledger";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertProduct, insertSubtypes } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import {
  insertItem,
  insertOrder,
  orderRow,
  setOrderStatus,
} from "../../../../tests/helpers/orders";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";
import { cancelPurchase, cancelTrip } from "./cancel-purchase";
import { recordPurchase } from "./record-purchase";

// Cancel a purchase record or a trip, build plan 3.7 (Done when: a cancel lowers stock; a cancel
// after stock was lowered by a test movement is blocked and nothing changes; "Cancel trip" with one
// blocked record cancels none; CANCEL_PURCHASES off is refused in
// cancel-purchase-matrix.db.test.ts), and the plan's Tests: 07-purchasing.md (Fixing a mistake 1
// to 3; Order progress), 09-warehouse.md (Stock value, third bullet), 10 Notifications ("Purchase
// record cancelled"), 15 S11, 06 rule 8, developer-rules.md rule 8, Decided ahead question 3,
// edge-cases/00-definitions.md (Last purchase price). Every record is made by the real record
// action, so its receipt, price and stock are the ones 3.3 writes.

const TODAY = "2031-05-10";
const REASON = "Typed the wrong quantity";

async function scene() {
  setClock(`${TODAY}T07:00:00Z`);
  const branch = await insertBranch();
  const owner = await insertUser("MANAGER", { branches: [branch.id] });
  const head = await insertUser("HEAD");
  return { branch, owner, head };
}

type Scene = Awaited<ReturnType<typeof scene>>;

/** An Open order of the scene's owner, approved on 5 May 2031. */
async function openOrder(
  s: Scene,
  variantId: string,
  plannedQty = "100",
  submittedAt = "2031-05-01T07:00:00Z",
) {
  return insertOrder({
    branchId: s.branch.id,
    ownerId: s.owner.id,
    status: "PURCHASING",
    variantId,
    plannedQty,
    plannedPrice: 1_000n,
    paymentType: "CARD",
    submittedAt: new Date(submittedAt),
    approvedAt: new Date("2031-05-05T07:00:00Z"),
  });
}

type Order = Awaited<ReturnType<typeof openOrder>>;

async function versionOf(orderId: string) {
  return (await orderRow(orderId))!.version;
}

type Line = { order: Order; qty: string; unitPrice?: string; variantId?: string };

/** One trip by the real record action; asserts its success (D38). Returns its trip and records. */
async function buy(s: Scene, lines: readonly Line[]) {
  const clientKey = randomUUID();
  const result = await runOrdersAction(recordPurchase, s.owner.id, {
    clientKey,
    orders: await Promise.all(
      lines.map(async ({ order }) => ({ id: order.id, version: await versionOf(order.id) })),
    ),
    purchasedOn: TODAY,
    paymentType: "CARD",
    supplierId: null,
    receiptFileIds: [],
    lines: lines.map(({ order, qty, unitPrice, variantId }) => ({
      orderId: order.id,
      variantId: variantId ?? order.variantId,
      qty,
      unitPrice: unitPrice ?? "1000",
      extras: [],
      comment: "Bought as the shop had it",
    })),
  });
  expect(result.ok).toBe(true);
  // The trip takes the action's client key (3.3 decided item 12).
  const [trip] = await db
    .select({ id: purchaseTrips.id })
    .from(purchaseTrips)
    .where(eq(purchaseTrips.clientKey, clientKey));
  const rows = await db
    .select({ id: purchases.id, orderId: purchases.orderId })
    .from(purchases)
    .where(eq(purchases.tripId, trip!.id));
  return {
    tripId: trip!.id,
    recordOf: (order: Order) => rows.find((row) => row.orderId === order.id)!.id,
  };
}

async function cancelRecord(
  user: InsertedUser,
  order: Order,
  purchaseId: string,
  options: { reason?: unknown; clientKey?: string; version?: number } = {},
) {
  return runOrdersAction(cancelPurchase, user.id, {
    clientKey: options.clientKey ?? randomUUID(),
    orders: [{ id: order.id, version: options.version ?? (await versionOf(order.id)) }],
    purchaseId,
    reason: options.reason ?? REASON,
  });
}

async function cancelWholeTrip(user: InsertedUser, list: readonly Order[], tripId: string) {
  return runOrdersAction(cancelTrip, user.id, {
    clientKey: randomUUID(),
    orders: await Promise.all(
      list.map(async (order) => ({ id: order.id, version: await versionOf(order.id) })),
    ),
    tripId,
    reason: REASON,
  });
}

async function balanceOf(s: Scene, variantId: string) {
  const [row] = await db
    .select({ qty: stockBalances.qty, avgCost: stockBalances.avgCost })
    .from(stockBalances)
    .where(and(eq(stockBalances.branchId, s.branch.id), eq(stockBalances.variantId, variantId)));
  return row ? { qty: Number(row.qty), avgCost: row.avgCost } : null;
}

async function recordRow(id: string) {
  const [row] = await db.select().from(purchases).where(eq(purchases.id, id));
  return row!;
}

/** Lowers stock as an issue to a department would: the "test movement" of the Done when line. */
async function issue(s: Scene, variantId: string, qty: string) {
  await db.transaction((tx) =>
    postMovement(tx, {
      branchId: s.branch.id,
      variantId,
      type: "ISSUE",
      qtyDelta: `-${qty}`,
      unitCost: null,
      createdBy: s.owner.id,
    }),
  );
}

/** Every row a cancel writes, for "nothing changes". */
async function snapshot(s: Scene, orderIds: readonly string[], variantIds: readonly string[]) {
  return {
    records: await db
      .select({ id: purchases.id, isCancelled: purchases.isCancelled })
      .from(purchases)
      .where(inArray(purchases.orderId, [...orderIds]))
      .orderBy(purchases.id),
    movements: await db.$count(stockMovements, inArray(stockMovements.variantId, [...variantIds])),
    balances: await Promise.all(variantIds.map((id) => balanceOf(s, id))),
    orders: await db
      .select({
        id: orders.id,
        version: orders.version,
        progress: orders.progress,
        actualTotal: orders.actualTotal,
      })
      .from(orders)
      .where(inArray(orders.id, [...orderIds]))
      .orderBy(orders.id),
    events: await db.$count(orderEvents, inArray(orderEvents.orderId, [...orderIds])),
    notices: await db.$count(notifications, eq(notifications.type, "PURCHASE_CANCELLED")),
  };
}

describe("Cancel record lowers stock (07 Fixing a mistake 1; 09 Stock value 3)", () => {
  it("removes the quantity at the record's own price, recalculates the average, keeps the record", async () => {
    const s = await scene();
    const item = await insertItem();
    const first = await openOrder(s, item.variantId, "60");
    const second = await openOrder(s, item.variantId, "40");
    await buy(s, [{ order: first, qty: "60", unitPrice: "1000" }]);
    const bought = await buy(s, [{ order: second, qty: "40", unitPrice: "1500" }]);
    // (60 × 1 000 + 40 × 1 500) ÷ 100 = 1 200.
    expect(await balanceOf(s, item.variantId)).toEqual({ qty: 100, avgCost: 1_200n });

    const purchaseId = bought.recordOf(second);
    const result = await cancelRecord(s.owner, second, purchaseId);
    expect(result.ok).toBe(true);

    // (120 000 − 40 × 1 500) ÷ 60 = 1 000, the average before the receipt.
    expect(await balanceOf(s, item.variantId)).toEqual({ qty: 60, avgCost: 1_000n });
    const moves = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.purchaseId, purchaseId))
      .orderBy(stockMovements.seq);
    expect(moves.map((move) => move.type)).toEqual(["RECEIPT", "REVERSAL"]);
    expect(Number(moves[1]!.qtyDelta)).toBe(-40);
    expect(moves[1]!.unitCost).toBe(1_500n);
    expect(moves[1]!.reversesMovementId).toBe(moves[0]!.id);

    const record = await recordRow(purchaseId);
    expect(record.isCancelled).toBe(true);
    expect(record.cancelReason).toBe(REASON);
    expect(record.cancelledBy).toBe(s.owner.id);
    expect(record.cancelledAt).toEqual(new Date(`${TODAY}T07:00:00Z`));
    expect(Number(record.qty)).toBe(40);

    const order = (await orderRow(second.id))!;
    expect(order.actualTotal).toBe(0n);
    expect(order.progress).toBe("OPEN");
    const events = await db
      .select()
      .from(orderEvents)
      .where(and(eq(orderEvents.orderId, second.id), eq(orderEvents.type, "CANCEL_PURCHASE")));
    expect(events).toHaveLength(1);
    expect(events[0]!.comment).toBe(REASON);
    expect(events[0]!.payload).toMatchObject({
      purchase: { id: purchaseId, tripId: bought.tripId },
      progress: { from: "DONE", to: "OPEN" },
    });
  });

  it("a cancel that empties the stock leaves the average at 0 (09 Stock value 3)", async () => {
    const s = await scene();
    const item = await insertItem();
    const order = await openOrder(s, item.variantId, "60");
    const bought = await buy(s, [{ order, qty: "60", unitPrice: "1000" }]);

    expect((await cancelRecord(s.owner, order, bought.recordOf(order))).ok).toBe(true);

    expect(await balanceOf(s, item.variantId)).toEqual({ qty: 0, avgCost: 0n });
    const [reversal] = await db
      .select()
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.purchaseId, bought.recordOf(order)),
          eq(stockMovements.type, "REVERSAL"),
        ),
      );
    expect(reversal!.unitCost).toBe(1_000n);
    expect(Number(reversal!.balanceAfter)).toBe(0);
  });

  it("a service record changes no stock (02 A7)", async () => {
    const s = await scene();
    const delivery = await insertItem({ type: "SERVICE" });
    const order = await openOrder(s, delivery.variantId, "1");
    const bought = await buy(s, [{ order, qty: "1", unitPrice: "30000" }]);

    expect((await cancelRecord(s.owner, order, bought.recordOf(order))).ok).toBe(true);

    expect((await recordRow(bought.recordOf(order))).isCancelled).toBe(true);
    expect(await db.$count(stockMovements, eq(stockMovements.variantId, delivery.variantId))).toBe(
      0,
    );
    expect((await orderRow(order.id))!.actualTotal).toBe(0n);
  });

  it("a substituted record is reversed on the subtype bought (07 Substitution; progress 3.6)", async () => {
    const s = await scene();
    const pens = await insertProduct();
    const [blue, black] = await insertSubtypes(pens.id, [{ name: "Ko'k" }, { name: "Qora" }]);
    const order = await openOrder(s, blue!, "10");
    const bought = await buy(s, [{ order, qty: "10", variantId: black! }]);
    expect(await balanceOf(s, black!)).toMatchObject({ qty: 10 });

    expect((await cancelRecord(s.owner, order, bought.recordOf(order))).ok).toBe(true);

    expect(await balanceOf(s, black!)).toEqual({ qty: 0, avgCost: 0n });
    expect(await balanceOf(s, blue!)).toBeNull();
  });
});

describe("Blocked cancel (07 Fixing a mistake 2; 15 S11)", () => {
  it("after a test movement lowered the stock, the cancel is refused and nothing changes", async () => {
    const s = await scene();
    const item = await insertItem();
    const order = await openOrder(s, item.variantId, "100");
    const bought = await buy(s, [{ order, qty: "100" }]);
    await issue(s, item.variantId, "30");
    const before = await snapshot(s, [order.id], [item.variantId]);

    const result = await cancelRecord(s.owner, order, bought.recordOf(order));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("not_ready");
    expect(result.error.orders).toEqual([
      { orderId: order.id, code: "not_ready", fields: { stock: "errors.field.stockShort" } },
    ]);
    expect(await snapshot(s, [order.id], [item.variantId])).toEqual(before);
    expect(await balanceOf(s, item.variantId)).toMatchObject({ qty: 70 });
  });

  it("Cancel trip with one blocked record cancels none", async () => {
    const s = await scene();
    const pens = await insertItem();
    const glue = await insertItem();
    const delivery = await insertItem({ type: "SERVICE" });
    const a = await openOrder(s, pens.variantId, "10", "2031-05-01T07:00:00Z");
    const b = await openOrder(s, glue.variantId, "10", "2031-05-01T08:00:00Z");
    const c = await openOrder(s, delivery.variantId, "1", "2031-05-01T09:00:00Z");
    const bought = await buy(s, [
      { order: a, qty: "10" },
      { order: b, qty: "10" },
      { order: c, qty: "1" },
    ]);
    await issue(s, glue.variantId, "1");
    const ids = [a.id, b.id, c.id];
    const variants = [pens.variantId, glue.variantId, delivery.variantId];
    const before = await snapshot(s, ids, variants);

    const result = await cancelWholeTrip(s.owner, [a, b, c], bought.tripId);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.orders).toEqual([
      { orderId: b.id, code: "not_ready", fields: { stock: "errors.field.stockShort" } },
    ]);
    expect(await snapshot(s, ids, variants)).toEqual(before);
  });

  it("names the orders of every short subtype at once (06 rule 8)", async () => {
    const s = await scene();
    const pens = await insertItem();
    const glue = await insertItem();
    const paper = await insertItem();
    const a = await openOrder(s, pens.variantId, "10", "2031-05-01T07:00:00Z");
    const b = await openOrder(s, glue.variantId, "10", "2031-05-01T08:00:00Z");
    const c = await openOrder(s, paper.variantId, "10", "2031-05-01T09:00:00Z");
    const bought = await buy(s, [
      { order: a, qty: "10" },
      { order: b, qty: "10" },
      { order: c, qty: "10" },
    ]);
    await issue(s, pens.variantId, "2");
    await issue(s, paper.variantId, "3");

    const result = await cancelWholeTrip(s.owner, [a, b, c], bought.tripId);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const named = result.error.orders!.map((each) => each.orderId).sort();
    expect(named).toEqual([a.id, c.id].sort());
    expect(await balanceOf(s, glue.variantId)).toMatchObject({ qty: 10 });
  });
});

describe("Cancel trip (07 Fixing a mistake 1: every record of one trip, all or nothing)", () => {
  it("cancels every record of the trip in one action: one event per order, stock down for each product", async () => {
    const s = await scene();
    const pens = await insertItem();
    const delivery = await insertItem({ type: "SERVICE" });
    const older = await openOrder(s, pens.variantId, "20", "2031-05-01T07:00:00Z");
    const newer = await openOrder(s, pens.variantId, "10", "2031-05-01T08:00:00Z");
    const service = await openOrder(s, delivery.variantId, "1", "2031-05-01T09:00:00Z");
    const bought = await buy(s, [
      { order: older, qty: "20" },
      { order: newer, qty: "10" },
      { order: service, qty: "1" },
    ]);

    const result = await cancelWholeTrip(s.owner, [older, newer, service], bought.tripId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const records = await db
      .select({ isCancelled: purchases.isCancelled })
      .from(purchases)
      .where(eq(purchases.tripId, bought.tripId));
    expect(records.map((each) => each.isCancelled)).toEqual([true, true, true]);
    expect(await balanceOf(s, pens.variantId)).toEqual({ qty: 0, avgCost: 0n });
    const events = await db
      .select({ orderId: orderEvents.orderId })
      .from(orderEvents)
      .where(eq(orderEvents.actionId, result.data.actionId));
    expect(events.map((each) => each.orderId).sort()).toEqual(
      [older.id, newer.id, service.id].sort(),
    );
  });

  it("an order of the trip that is no longer Open refuses the whole trip (review correction 2)", async () => {
    const s = await scene();
    const pens = await insertItem();
    const a = await openOrder(s, pens.variantId, "10", "2031-05-01T07:00:00Z");
    const b = await openOrder(s, pens.variantId, "10", "2031-05-01T08:00:00Z");
    const bought = await buy(s, [
      { order: a, qty: "10" },
      { order: b, qty: "10" },
    ]);
    await setOrderStatus(b.id, "SETTLEMENT");
    const before = await snapshot(s, [a.id, b.id], [pens.variantId]);

    const result = await cancelWholeTrip(s.owner, [a, b], bought.tripId);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.orders).toEqual([{ orderId: b.id, code: "wrong_status" }]);
    expect(await snapshot(s, [a.id, b.id], [pens.variantId])).toEqual(before);
  });

  it("skips a record cancelled before, and a trip with none left is refused", async () => {
    const s = await scene();
    const pens = await insertItem();
    const a = await openOrder(s, pens.variantId, "10", "2031-05-01T07:00:00Z");
    const b = await openOrder(s, pens.variantId, "10", "2031-05-01T08:00:00Z");
    const bought = await buy(s, [
      { order: a, qty: "10" },
      { order: b, qty: "10" },
    ]);
    expect((await cancelRecord(s.owner, a, bought.recordOf(a))).ok).toBe(true);

    // The trip's orders are now b alone.
    expect((await cancelWholeTrip(s.owner, [a, b], bought.tripId)).ok).toBe(false);
    expect((await cancelWholeTrip(s.owner, [b], bought.tripId)).ok).toBe(true);
    expect(await balanceOf(s, pens.variantId)).toEqual({ qty: 0, avgCost: 0n });

    const none = await cancelWholeTrip(s.owner, [b], bought.tripId);
    expect(none.ok).toBe(false);
    if (none.ok) return;
    expect(none.error.orders).toEqual([{ orderId: b.id, code: "wrong_status" }]);
  });

  it("a trip whose orders are not the ones sent is invalid input", async () => {
    const s = await scene();
    const pens = await insertItem();
    const a = await openOrder(s, pens.variantId, "10", "2031-05-01T07:00:00Z");
    const b = await openOrder(s, pens.variantId, "10", "2031-05-01T08:00:00Z");
    const bought = await buy(s, [
      { order: a, qty: "10" },
      { order: b, qty: "10" },
    ]);

    const result = await cancelWholeTrip(s.owner, [a], bought.tripId);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("invalid_input");
    expect(result.error.fields).toEqual({ orders: "errors.field.notAllowed" });
    expect((await recordRow(bought.recordOf(a))).isCancelled).toBe(false);
  });

  it("another branch's trip tells nothing: not found (03 rule 1; review of the plan, Should fix 1)", async () => {
    const s = await scene();
    const other = await scene();
    const pens = await insertItem();
    const mine = await openOrder(s, pens.variantId, "10");
    const theirs = await openOrder(other, pens.variantId, "10");
    await buy(s, [{ order: mine, qty: "10" }]);
    const elsewhere = await buy(other, [{ order: theirs, qty: "10" }]);

    const result = await cancelWholeTrip(s.owner, [mine], elsewhere.tripId);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.orders).toEqual([{ orderId: mine.id, code: "not_found" }]);
    expect((await recordRow(elsewhere.recordOf(theirs))).isCancelled).toBe(false);
  });
});

describe("The order after a cancel (07 Order progress; review correction 1)", () => {
  async function shortOrder(s: Scene) {
    const item = await insertItem();
    const order = await openOrder(s, item.variantId, "60");
    const first = await buy(s, [{ order, qty: "20" }]);
    const second = await buy(s, [{ order, qty: "20" }]);
    await db
      .update(orders)
      .set({ progress: "DONE_SHORT", finishReason: "The shop has no more" })
      .where(eq(orders.id, order.id));
    return { order, first: first.recordOf(order), second: second.recordOf(order) };
  }

  it("Done short with something left stays Done short with its reason", async () => {
    const s = await scene();
    const { order, second } = await shortOrder(s);
    expect((await cancelRecord(s.owner, order, second)).ok).toBe(true);
    const row = (await orderRow(order.id))!;
    expect(row.progress).toBe("DONE_SHORT");
    expect(row.finishReason).toBe("The shop has no more");
    expect(row.actualTotal).toBe(20_000n);
  });

  it("Done short with nothing left is Open, the reason cleared", async () => {
    const s = await scene();
    const { order, first, second } = await shortOrder(s);
    expect((await cancelRecord(s.owner, order, second)).ok).toBe(true);
    expect((await cancelRecord(s.owner, order, first)).ok).toBe(true);
    const row = (await orderRow(order.id))!;
    expect(row.progress).toBe("OPEN");
    expect(row.finishReason).toBeNull();
    expect(row.actualTotal).toBe(0n);
  });
});

describe("The last purchase price after a cancel (00-definitions: the newest real purchase)", () => {
  async function priceOf(variantId: string) {
    const [row] = await db
      .select({ price: productVariants.lastPurchasePrice, at: productVariants.lastPurchaseAt })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));
    return row!;
  }

  it("goes back to the newest record that is not cancelled, then to empty", async () => {
    const s = await scene();
    const item = await insertItem();
    const order = await openOrder(s, item.variantId, "100");
    setClock(`${TODAY}T06:00:00Z`);
    const first = await buy(s, [{ order, qty: "10", unitPrice: "1000" }]);
    setClock(`${TODAY}T07:00:00Z`);
    const second = await buy(s, [{ order, qty: "10", unitPrice: "9000" }]);
    expect((await priceOf(item.variantId)).price).toBe(9_000n);

    expect((await cancelRecord(s.owner, order, second.recordOf(order))).ok).toBe(true);
    expect(await priceOf(item.variantId)).toEqual({
      price: 1_000n,
      at: new Date(`${TODAY}T06:00:00Z`),
    });

    expect((await cancelRecord(s.owner, order, first.recordOf(order))).ok).toBe(true);
    expect(await priceOf(item.variantId)).toEqual({ price: null, at: null });
  });

  it("an older record's cancel leaves the newest price as it is", async () => {
    const s = await scene();
    const item = await insertItem();
    const order = await openOrder(s, item.variantId, "100");
    const first = await buy(s, [{ order, qty: "10", unitPrice: "1000" }]);
    await buy(s, [{ order, qty: "10", unitPrice: "9000" }]);

    expect((await cancelRecord(s.owner, order, first.recordOf(order))).ok).toBe(true);
    expect((await priceOf(item.variantId)).price).toBe(9_000n);
  });
});

describe("Refusals (Decided ahead, question 3; 06 rules 3, 8 and 9)", () => {
  it("a record cancelled before is wrong_status: the cancel is one update", async () => {
    const s = await scene();
    const item = await insertItem();
    const order = await openOrder(s, item.variantId, "10");
    const bought = await buy(s, [{ order, qty: "10" }]);
    expect((await cancelRecord(s.owner, order, bought.recordOf(order))).ok).toBe(true);

    const again = await cancelRecord(s.owner, order, bought.recordOf(order));
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.orders).toEqual([{ orderId: order.id, code: "wrong_status" }]);
  });

  it("an order sent to settlement is wrong_status (07 Fixing a mistake 1 and 4)", async () => {
    const s = await scene();
    const item = await insertItem();
    const order = await openOrder(s, item.variantId, "10");
    const bought = await buy(s, [{ order, qty: "10" }]);
    await setOrderStatus(order.id, "SETTLEMENT");

    const result = await cancelRecord(s.owner, order, bought.recordOf(order));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.orders).toEqual([{ orderId: order.id, code: "wrong_status" }]);
    expect((await recordRow(bought.recordOf(order))).isCancelled).toBe(false);
  });

  it("a record of another order is not found", async () => {
    const s = await scene();
    const item = await insertItem();
    const order = await openOrder(s, item.variantId, "10");
    const other = await openOrder(s, item.variantId, "10");
    const bought = await buy(s, [{ order: other, qty: "10" }]);

    const result = await cancelRecord(s.owner, order, bought.recordOf(other));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.orders).toEqual([{ orderId: order.id, code: "not_found" }]);
    expect((await recordRow(bought.recordOf(other))).isCancelled).toBe(false);
  });

  it("another branch's record sent with an own Open order is not found, and nothing is written (03 rule 1; permission review of 3.7)", async () => {
    const s = await scene();
    const other = await scene();
    const pens = await insertItem();
    const mine = await openOrder(s, pens.variantId, "10");
    const theirs = await openOrder(other, pens.variantId, "10");
    await buy(s, [{ order: mine, qty: "10" }]);
    // The other branch's record is Open, not cancelled, of goods with stock: only the wall stops it.
    const elsewhere = await buy(other, [{ order: theirs, qty: "10" }]);
    const reversals = () =>
      db.$count(
        stockMovements,
        and(eq(stockMovements.variantId, pens.variantId), eq(stockMovements.type, "REVERSAL")),
      );

    const result = await cancelRecord(s.owner, mine, elsewhere.recordOf(theirs));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.orders).toEqual([{ orderId: mine.id, code: "not_found" }]);
    expect((await recordRow(elsewhere.recordOf(theirs))).isCancelled).toBe(false);
    expect(await reversals()).toBe(0);
    expect(await balanceOf(other, pens.variantId)).toMatchObject({ qty: 10 });
  });

  it("a reason under 5 characters is invalid input (06 rule 3)", async () => {
    const s = await scene();
    const item = await insertItem();
    const order = await openOrder(s, item.variantId, "10");
    const bought = await buy(s, [{ order, qty: "10" }]);

    const result = await cancelRecord(s.owner, order, bought.recordOf(order), { reason: " typo " });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.fields).toEqual({ reason: "errors.field.tooShort" });
  });

  it("an old version is stale_version (06 rule 7)", async () => {
    const s = await scene();
    const item = await insertItem();
    const order = await openOrder(s, item.variantId, "10");
    const bought = await buy(s, [{ order, qty: "10" }]);
    const stale = (await versionOf(order.id)) - 1;

    const result = await cancelRecord(s.owner, order, bought.recordOf(order), { version: stale });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.orders).toEqual([{ orderId: order.id, code: "stale_version" }]);
  });

  it("the same client key twice returns the first result and writes nothing more (rule 8)", async () => {
    const s = await scene();
    const item = await insertItem();
    const order = await openOrder(s, item.variantId, "10");
    const bought = await buy(s, [{ order, qty: "10" }]);
    const clientKey = randomUUID();
    const version = await versionOf(order.id);

    const first = await cancelRecord(s.owner, order, bought.recordOf(order), {
      clientKey,
      version,
    });
    const before = await snapshot(s, [order.id], [item.variantId]);
    const again = await cancelRecord(s.owner, order, bought.recordOf(order), {
      clientKey,
      version,
    });

    expect(first.ok && again.ok).toBe(true);
    if (!first.ok || !again.ok) return;
    expect(again.data).toEqual(first.data);
    expect(await snapshot(s, [order.id], [item.variantId])).toEqual(before);
  });
});

describe("The Head is told (10 Notifications: 'Purchase record cancelled')", () => {
  it("every active Head gets one notice with the count of records; the actor none", async () => {
    const s = await scene();
    const otherHead = await insertUser("HEAD");
    const pens = await insertItem();
    const a = await openOrder(s, pens.variantId, "10", "2031-05-01T07:00:00Z");
    const b = await openOrder(s, pens.variantId, "10", "2031-05-01T08:00:00Z");
    const bought = await buy(s, [
      { order: a, qty: "10" },
      { order: b, qty: "10" },
    ]);

    const result = await runOrdersAction(cancelTrip, s.head.id, {
      clientKey: randomUUID(),
      orders: [
        { id: a.id, version: await versionOf(a.id) },
        { id: b.id, version: await versionOf(b.id) },
      ],
      tripId: bought.tripId,
      reason: REASON,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const told = await db
      .select({
        userId: notifications.userId,
        params: notifications.params,
        link: notifications.link,
      })
      .from(notifications)
      .where(eq(notifications.type, "PURCHASE_CANCELLED"));
    const forOther = told.filter((row) => row.userId === otherHead.id);
    expect(forOther).toHaveLength(1);
    expect(forOther[0]!.params).toMatchObject({ count: 2, branch: s.branch.code });
    expect(forOther[0]!.link).toContain(result.data.actionId);
    expect(told.filter((row) => row.userId === s.head.id)).toHaveLength(0);
    expect(told.filter((row) => row.userId === s.owner.id)).toHaveLength(0);
  });
});
