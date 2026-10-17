import { randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import {
  orderEvents,
  priceHistory,
  productVariants,
  purchaseExtras,
  purchaseTrips,
  purchases,
  settings,
  stockBalances,
  stockMovements,
  tripFiles,
} from "@/server/db/schema";
import { now } from "@/server/clock";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertFileRow, setLastPurchasePrice } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import {
  insertExtraCostType,
  insertItem,
  insertOrder,
  orderRow,
} from "../../../../tests/helpers/orders";
import { type InsertedUser, insertUser } from "../../../../tests/helpers/users";
import { recordPurchase } from "./record-purchase";

// One trip, many orders, build plan 3.4 (Done when: a trip of three orders writes three records,
// one trip and the receipt once; one failing order saves nothing; a trip over orders of two owners
// is refused; a trip with a "Delivery" service order raises no stock for it), and the plan's
// Tests: 07-purchasing.md (One trip, many orders 1 to 4; What saving a record does; Purchase
// record, Date bought and Comment), 02 A7, developer-rules.md rules 3, 4 and 8. A refused trip is
// checked against every table a trip writes (review of the plan, correction 2).

const TODAY = "2031-05-10";

type Order = { id: string; version: number; variantId: string };

/**
 * A branch with a Manager's three Open orders: Tata pens 20 (submitted first) and 10 (submitted
 * later) of one subtype, a group row, and a "Delivery" service, all approved on 5 May 2031.
 */
async function scene() {
  setClock(`${TODAY}T07:00:00Z`);
  await setReceiptRequired(false);
  const branch = await insertBranch();
  const owner = await insertUser("MANAGER", { branches: [branch.id] });
  const pens = await insertItem();
  const delivery = await insertItem({ type: "SERVICE" });
  const open = (variantId: string, plannedQty: string, submittedAt: string, approved = "05") =>
    insertOrder({
      branchId: branch.id,
      ownerId: owner.id,
      status: "PURCHASING",
      variantId,
      plannedQty,
      plannedPrice: 5_000n,
      paymentType: "CASH",
      submittedAt: new Date(`2031-05-01T${submittedAt}:00Z`),
      approvedAt: new Date(`2031-05-${approved}T07:00:00Z`),
    });
  const older = await open(pens.variantId, "20", "07:00");
  const newer = await open(pens.variantId, "10", "08:00");
  const service = await open(delivery.variantId, "1", "09:00");
  return { branch, owner, pens, delivery, older, newer, service, open };
}

async function setReceiptRequired(on: boolean) {
  await db
    .insert(settings)
    .values({ key: "receipt_required_for_cash", value: on, createdAt: now() })
    .onConflictDoUpdate({ target: settings.key, set: { value: on } });
}

type Line = { qty?: string; unitPrice?: string; extras?: unknown[]; comment?: string | null };

function trip(
  user: InsertedUser,
  ticked: readonly (Order & Line)[],
  shared: Record<string, unknown> = {},
) {
  return runOrdersAction(recordPurchase, user.id, {
    clientKey: randomUUID(),
    orders: ticked.map(({ id, version }) => ({ id, version })),
    purchasedOn: TODAY,
    paymentType: "CASH",
    supplierId: null,
    receiptFileIds: [],
    ...shared,
    lines: ticked.map((order) => ({
      orderId: order.id,
      qty: order.qty ?? "10",
      unitPrice: order.unitPrice ?? "5000",
      extras: order.extras ?? [],
      comment: order.comment ?? null,
    })),
  });
}

/** Every row a trip writes for these orders and subtypes, counted, and the orders as they stand. */
async function written(orderIds: readonly string[], variantIds: readonly string[]) {
  const records = await db
    .select()
    .from(purchases)
    .where(inArray(purchases.orderId, [...orderIds]));
  const recordIds = records.map((record) => record.id);
  const count = async (rows: Promise<unknown[]>) => (await rows).length;
  return {
    trips: await db.$count(purchaseTrips),
    records: records.length,
    tripFiles: await db.$count(tripFiles),
    extras:
      recordIds.length === 0
        ? 0
        : await count(
            db.select().from(purchaseExtras).where(inArray(purchaseExtras.purchaseId, recordIds)),
          ),
    movements: await count(
      db
        .select()
        .from(stockMovements)
        .where(inArray(stockMovements.variantId, [...variantIds])),
    ),
    balances: await count(
      db
        .select()
        .from(stockBalances)
        .where(inArray(stockBalances.variantId, [...variantIds])),
    ),
    prices: await count(
      db
        .select()
        .from(priceHistory)
        .where(
          sql`${inArray(priceHistory.variantId, [...variantIds])} and ${priceHistory.source} = 'PURCHASE'`,
        ),
    ),
    lastPrices: (
      await db
        .select({ id: productVariants.id, price: productVariants.lastPurchasePrice })
        .from(productVariants)
        .where(inArray(productVariants.id, [...variantIds]))
        .orderBy(productVariants.id)
    ).map((row) => row.price),
    events: await count(
      db
        .select()
        .from(orderEvents)
        .where(
          sql`${inArray(orderEvents.orderId, [...orderIds])} and ${orderEvents.type} = 'RECORD_PURCHASE'`,
        ),
    ),
    orders: await Promise.all(orderIds.map((id) => orderRow(id))),
  };
}

/** Nothing of a trip is left: the same counts and order rows as before it (07 One trip 4). */
async function expectNothingSaved(
  before: Awaited<ReturnType<typeof written>>,
  orderIds: readonly string[],
  variantIds: readonly string[],
) {
  expect(await written(orderIds, variantIds)).toEqual(before);
  expect(before.records).toBe(0);
}

describe("recordPurchase: one trip, many orders (07 One trip, many orders; plan of 3.4)", () => {
  it("a trip of three orders writes three records, one trip, the receipt once and an event per order (07 One trip 1)", async () => {
    const s = await scene();
    const receipt = await insertFileRow(s.owner.id);
    const result = await trip(
      s.owner,
      [
        { ...s.older, qty: "20" },
        { ...s.newer, qty: "10" },
        { ...s.service, qty: "1" },
      ],
      { receiptFileIds: [receipt.id] },
    );
    expect(result).toMatchObject({ ok: true });

    const records = await db
      .select()
      .from(purchases)
      .where(inArray(purchases.orderId, [s.older.id, s.newer.id, s.service.id]));
    expect(records).toHaveLength(3);
    const tripIds = new Set(records.map((record) => record.tripId));
    expect(tripIds.size).toBe(1);
    const [tripId] = [...tripIds];
    expect(await db.select().from(tripFiles).where(eq(tripFiles.tripId, tripId!))).toMatchObject([
      { fileId: receipt.id },
    ]);
    expect(await db.$count(tripFiles, eq(tripFiles.fileId, receipt.id))).toBe(1);
    expect(
      await db
        .select()
        .from(orderEvents)
        .where(
          sql`${inArray(orderEvents.orderId, [s.older.id, s.newer.id, s.service.id])} and ${orderEvents.type} = 'RECORD_PURCHASE'`,
        ),
    ).toHaveLength(3);
    for (const order of [s.older, s.newer, s.service]) {
      expect(await orderRow(order.id)).toMatchObject({
        progress: "DONE",
        version: order.version + 1,
      });
    }
  });

  it("a trip with a 'Delivery' service order raises stock for the product only (07 One trip 3; A7)", async () => {
    const s = await scene();
    expect(
      await trip(s.owner, [
        { ...s.older, qty: "20" },
        { ...s.service, qty: "1" },
      ]),
    ).toMatchObject({ ok: true });
    const balances = await db
      .select({ variantId: stockBalances.variantId, qty: stockBalances.qty })
      .from(stockBalances)
      .where(inArray(stockBalances.variantId, [s.pens.variantId, s.delivery.variantId]));
    expect(balances).toEqual([{ variantId: s.pens.variantId, qty: "20.000" }]);
    expect(
      await db
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.variantId, s.delivery.variantId)),
    ).toEqual([]);
    expect((await orderRow(s.service.id))?.progress).toBe("DONE");
  });

  it("30 pens split 20 and 10 over the group row fill both orders (07 One trip 2)", async () => {
    const s = await scene();
    expect(
      await trip(s.owner, [
        { ...s.newer, qty: "10" },
        { ...s.older, qty: "20" },
      ]),
    ).toMatchObject({ ok: true });
    expect((await orderRow(s.older.id))?.progress).toBe("DONE");
    expect((await orderRow(s.newer.id))?.progress).toBe("DONE");
    const [balance] = await db
      .select({ qty: stockBalances.qty })
      .from(stockBalances)
      .where(eq(stockBalances.variantId, s.pens.variantId));
    expect(balance).toEqual({ qty: "30.000" });
  });

  it("one order with a refused field saves nothing for any of the three (07 One trip 4)", async () => {
    const s = await scene();
    const ids = [s.older.id, s.newer.id, s.service.id];
    const variants = [s.pens.variantId, s.delivery.variantId];
    const before = await written(ids, variants);
    // The newer order's price differs from its plan without a comment.
    expect(
      await trip(s.owner, [
        { ...s.older, qty: "20" },
        { ...s.newer, qty: "10", unitPrice: "5500" },
        { ...s.service, qty: "1" },
      ]),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { "lines.1.comment": "errors.field.required" } },
    });
    await expectNothingSaved(before, ids, variants);
  });

  it("one order failing after the other two were written saves nothing: no trip, record, extra, file, movement, balance, price or version (07 One trip 4; What saving a record does)", async () => {
    const s = await scene();
    await setLastPurchasePrice(s.pens.variantId, 4_000n);
    const receipt = await insertFileRow(s.owner.id);
    const fee = await insertExtraCostType();
    const ids = [s.older.id, s.newer.id, s.service.id];
    const variants = [s.pens.variantId, s.delivery.variantId];
    const before = await written(ids, variants);
    // The service is the newest submit, so its writes come last; its history event fails after
    // every record, movement, price and order update of the trip is written.
    await db.execute(sql`
      create function fail_trip_event() returns trigger language plpgsql as $$
      begin
        raise exception 'the third order fails';
      end $$`);
    await db.execute(
      sql.raw(`
      create trigger fail_trip_event before insert on order_events
      for each row when (new.order_id = '${s.service.id}')
      execute function fail_trip_event()`),
    );
    try {
      expect(
        await trip(
          s.owner,
          [
            {
              ...s.older,
              qty: "20",
              extras: [{ extraCostTypeId: fee.id, amount: "1000", paymentType: "CASH" }],
            },
            { ...s.newer, qty: "10" },
            { ...s.service, qty: "1" },
          ],
          { receiptFileIds: [receipt.id] },
        ),
      ).toMatchObject({ ok: false, error: { code: "unexpected" } });
    } finally {
      await db.execute(sql`drop trigger fail_trip_event on order_events`);
      await db.execute(sql`drop function fail_trip_event()`);
    }
    await expectNothingSaved(before, ids, variants);
    expect(before.lastPrices).toContain(4_000n);
  });

  it("a trip over orders of two owners is refused whole, for the Head too; one owner's orders pass (07 One trip: one branch and one owner)", async () => {
    const s = await scene();
    const head = await insertUser("HEAD");
    const colleague = await insertUser("MANAGER", { branches: [s.branch.id] });
    const theirs = await insertOrder({
      branchId: s.branch.id,
      ownerId: colleague.id,
      status: "PURCHASING",
      variantId: s.pens.variantId,
      plannedQty: "10",
      plannedPrice: 5_000n,
      paymentType: "CASH",
      approvedAt: new Date("2031-05-05T07:00:00Z"),
    });
    const ids = [s.older.id, theirs.id];
    const variants = [s.pens.variantId];
    const before = await written(ids, variants);
    expect(
      await trip(head, [
        { ...s.older, qty: "20" },
        { ...theirs, qty: "10" },
      ]),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid_input",
        messageKey: "errors.invalidInput",
        fields: { orders: "errors.field.tripOneOwner" },
      },
    });
    await expectNothingSaved(before, ids, variants);
    // The Manager meets the owner rule first: a colleague's order is forbidden.
    expect(
      await trip(s.owner, [
        { ...s.older, qty: "20" },
        { ...theirs, qty: "10" },
      ]),
    ).toMatchObject({ ok: false, error: { orders: [{ orderId: theirs.id, code: "forbidden" }] } });
    await expectNothingSaved(before, ids, variants);
    // The same Head with one owner's orders: saved.
    expect(
      await trip(head, [
        { ...s.older, qty: "20" },
        { ...s.newer, qty: "10" },
      ]),
    ).toMatchObject({ ok: true });
  });

  it("a trip over orders of two branches is refused whole for the Head (07 One trip: one branch)", async () => {
    const s = await scene();
    const head = await insertUser("HEAD");
    const other = await insertBranch();
    const otherOrder = await insertOrder({
      branchId: other.id,
      ownerId: s.owner.id,
      status: "PURCHASING",
      variantId: s.pens.variantId,
      plannedQty: "10",
      plannedPrice: 5_000n,
      paymentType: "CASH",
      approvedAt: new Date("2031-05-05T07:00:00Z"),
    });
    const ids = [s.older.id, otherOrder.id];
    const before = await written(ids, [s.pens.variantId]);
    expect(
      await trip(head, [
        { ...s.older, qty: "20" },
        { ...otherOrder, qty: "10" },
      ]),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid_input",
        messageKey: "errors.invalidInput",
        fields: { orders: "errors.field.tripOneOwner" },
      },
    });
    await expectNothingSaved(before, ids, [s.pens.variantId]);
  });

  it("a Manager of two branches with own Open orders in both: refused whole, nothing saved (07 One trip: one branch)", async () => {
    const s = await scene();
    const other = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [s.branch.id, other.id] });
    const open = (branchId: string) =>
      insertOrder({
        branchId,
        ownerId: manager.id,
        status: "PURCHASING",
        variantId: s.pens.variantId,
        plannedQty: "10",
        plannedPrice: 5_000n,
        paymentType: "CASH",
        approvedAt: new Date("2031-05-05T07:00:00Z"),
      });
    const here = await open(s.branch.id);
    const there = await open(other.id);
    const ids = [here.id, there.id];
    const before = await written(ids, [s.pens.variantId]);
    expect(
      await trip(manager, [
        { ...here, qty: "10" },
        { ...there, qty: "10" },
      ]),
    ).toEqual({
      ok: false,
      error: {
        code: "invalid_input",
        messageKey: "errors.invalidInput",
        fields: { orders: "errors.field.tripOneOwner" },
      },
    });
    await expectNothingSaved(before, ids, [s.pens.variantId]);
    const hereToo = await open(s.branch.id);
    expect(
      await trip(manager, [
        { ...here, qty: "10" },
        { ...hereToo, qty: "10" },
      ]),
    ).toMatchObject({ ok: true });
  });

  it("lines that do not match the ticked orders are refused and save nothing (developer-rules rule 4)", async () => {
    const s = await scene();
    const ids = [s.older.id, s.newer.id];
    const before = await written(ids, [s.pens.variantId]);
    const base = {
      clientKey: randomUUID(),
      orders: [
        { id: s.older.id, version: s.older.version },
        { id: s.newer.id, version: s.newer.version },
      ],
      purchasedOn: TODAY,
      paymentType: "CASH",
      supplierId: null,
      receiptFileIds: [],
    };
    const lineOf = (orderId: string) => ({
      orderId,
      qty: "10",
      unitPrice: "5000",
      extras: [],
      comment: null,
    });
    for (const lines of [
      [lineOf(s.older.id)],
      [lineOf(s.older.id), lineOf(s.service.id)],
      [lineOf(s.older.id), lineOf(s.older.id)],
    ]) {
      expect(
        await runOrdersAction(recordPurchase, s.owner.id, {
          ...base,
          clientKey: randomUUID(),
          lines,
        }),
      ).toMatchObject({
        ok: false,
        error: { code: "invalid_input", fields: { lines: expect.any(String) } },
      });
    }
    await expectNothingSaved(before, ids, [s.pens.variantId]);
  });

  it("the shared date must not be before the newest approval of the trip's orders (07 Date bought; decided item 1)", async () => {
    const s = await scene();
    const later = await s.open(s.pens.variantId, "5", "10:00", "09");
    expect(
      await trip(
        s.owner,
        [
          { ...s.older, qty: "20" },
          { ...later, qty: "5" },
        ],
        { purchasedOn: "2031-05-07" },
      ),
    ).toMatchObject({
      ok: false,
      error: { fields: { purchasedOn: "errors.field.beforeApproval" } },
    });
    expect(
      await trip(
        s.owner,
        [
          { ...s.older, qty: "20" },
          { ...later, qty: "5" },
        ],
        { purchasedOn: "2031-05-09" },
      ),
    ).toMatchObject({ ok: true });
  });

  it("a comment is needed per order against its own plan: a Cash trip over a Card order needs one there only (07 Comment; decided item 5)", async () => {
    const s = await scene();
    const card = await insertOrder({
      branchId: s.branch.id,
      ownerId: s.owner.id,
      status: "PURCHASING",
      variantId: s.pens.variantId,
      plannedQty: "10",
      plannedPrice: 5_000n,
      paymentType: "CARD",
      submittedAt: new Date("2031-05-01T10:00:00Z"),
      approvedAt: new Date("2031-05-05T07:00:00Z"),
    });
    expect(
      await trip(s.owner, [
        { ...s.older, qty: "20" },
        { ...card, qty: "10" },
      ]),
    ).toMatchObject({
      ok: false,
      error: { fields: { "lines.1.comment": "errors.field.required" } },
    });
    expect(
      await trip(s.owner, [
        { ...s.older, qty: "20" },
        { ...card, qty: "10", comment: "naqd to'landi" },
      ]),
    ).toMatchObject({ ok: true });
  });

  it("the last purchase price is the newest order's record whatever order the lines came in; each priced record writes its row (decided item 4)", async () => {
    const s = await scene();
    expect(
      await trip(s.owner, [
        { ...s.newer, qty: "10", unitPrice: "5500", comment: "qimmatroq" },
        { ...s.older, qty: "20", unitPrice: "5000" },
      ]),
    ).toMatchObject({ ok: true });
    const [variant] = await db
      .select({ price: productVariants.lastPurchasePrice })
      .from(productVariants)
      .where(eq(productVariants.id, s.pens.variantId));
    expect(variant?.price).toBe(5_500n);
    expect(
      (
        await db
          .select({ price: priceHistory.price })
          .from(priceHistory)
          .where(
            sql`${priceHistory.variantId} = ${s.pens.variantId} and ${priceHistory.source} = 'PURCHASE'`,
          )
      )
        .map((row) => row.price)
        .sort(),
    ).toEqual([5_000n, 5_500n]);
  });

  it("with receipt_required_for_cash on, the cash trip needs its receipt once (07 Receipt; edge case 'No receipt photo')", async () => {
    const s = await scene();
    await setReceiptRequired(true);
    const ticked = [
      { ...s.older, qty: "20" },
      { ...s.newer, qty: "10" },
    ];
    expect(await trip(s.owner, ticked)).toMatchObject({
      ok: false,
      error: { fields: { receiptFileIds: "errors.field.required" } },
    });
    const receipt = await insertFileRow(s.owner.id);
    expect(await trip(s.owner, ticked, { receiptFileIds: [receipt.id] })).toMatchObject({
      ok: true,
    });
  });

  it("the same client key twice returns the first result and writes nothing more (developer-rules rule 8)", async () => {
    const s = await scene();
    const input = {
      clientKey: randomUUID(),
      orders: [
        { id: s.older.id, version: s.older.version },
        { id: s.newer.id, version: s.newer.version },
      ],
      purchasedOn: TODAY,
      paymentType: "CASH",
      supplierId: null,
      receiptFileIds: [],
      lines: [
        { orderId: s.older.id, qty: "20", unitPrice: "5000", extras: [], comment: null },
        { orderId: s.newer.id, qty: "10", unitPrice: "5000", extras: [], comment: null },
      ],
    };
    const first = await runOrdersAction(recordPurchase, s.owner.id, input);
    const second = await runOrdersAction(recordPurchase, s.owner.id, input);
    expect(first).toMatchObject({ ok: true });
    expect(second).toEqual(first);
    const records = await db
      .select({ tripId: purchases.tripId })
      .from(purchases)
      .where(inArray(purchases.orderId, [s.older.id, s.newer.id]));
    expect(records).toHaveLength(2);
    expect(new Set(records.map((record) => record.tripId)).size).toBe(1);
  });
});
