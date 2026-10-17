import { randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { orderActions, orderEvents, orders, stockBalances } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";
import { getOrderPage } from "@/features/orders/queries/order-page";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertItem, insertOrder, orderRow } from "../../../../tests/helpers/orders";
import { insertPurchaseRow, insertTrip } from "../../../../tests/helpers/purchases";
import { insertUser } from "../../../../tests/helpers/users";
import { finishOrders, markNotBought, reopenBuying } from "./finish-buying";
import { recordPurchase } from "./record-purchase";

// Finish order, Not bought and Reopen buying (build plan 3.5; 07-purchasing.md, Order progress;
// edge-cases/purchasing-and-money.md: "The shop has only part of the quantity", "The item cannot be
// found at all", "More was bought than approved"; 06-approval-workflow.md rules 7 and 8; plan of
// 3.5, decided items 1, 3, 7, 8 and 15). And 15 S4 without the issue: 60 notebooks, then 40.
// The permission rows are finish-buying-matrix.db.test.ts; the ticked wall branch-wall.db.test.ts.

const TODAY = "2031-05-10";
const REASON = "The shop has no more";

async function scene() {
  setClock(`${TODAY}T07:00:00Z`);
  const branch = await insertBranch();
  const owner = await insertUser("MANAGER", { branches: [branch.id] });
  return { branch, owner };
}

type Scene = Awaited<ReturnType<typeof scene>>;

/** An Open order of 100 notebooks at 5 000, approved on 5 May 2031. */
async function openOrder(at: Scene, item?: { variantId: string }) {
  const own = item ?? (await insertItem());
  return insertOrder({
    branchId: at.branch.id,
    ownerId: at.owner.id,
    status: "PURCHASING",
    variantId: own.variantId,
    plannedQty: "100",
    plannedPrice: 5_000n,
    paymentType: "CARD",
    approvedAt: new Date("2031-05-05T07:00:00Z"),
  });
}

type Order = Awaited<ReturnType<typeof openOrder>>;

/** A record written straight into the table: received without stock, for the progress rules. */
async function received(at: Scene, order: Order, qty: string, cancelled = false) {
  const tripId = (await insertTrip(at.branch.id, at.owner.id)).rows[0]!.id;
  const id = (
    await insertPurchaseRow({
      tripId,
      orderId: order.id,
      branchId: at.branch.id,
      variantId: order.variantId,
      createdBy: at.owner.id,
      qty,
    })
  ).rows[0]!.id;
  if (cancelled) {
    // The one update the cancel-only trigger allows (3.2; Decided ahead, question 3).
    await db.execute(sql`
      update purchases set is_cancelled = true, cancel_reason = 'typo', cancelled_by = ${at.owner.id},
        cancelled_at = now() where id = ${id}`);
  }
}

async function versionOf(orderId: string) {
  return (await orderRow(orderId))!.version;
}

async function ticked(list: readonly Order[]) {
  return Promise.all(
    list.map(async (order) => ({ id: order.id, version: await versionOf(order.id) })),
  );
}

async function finish(at: Scene, list: readonly Order[], reason: unknown = REASON) {
  return runOrdersAction(finishOrders, at.owner.id, {
    clientKey: randomUUID(),
    orders: await ticked(list),
    reason,
  });
}

async function notBought(at: Scene, list: readonly Order[], reason: unknown = REASON) {
  return runOrdersAction(markNotBought, at.owner.id, {
    clientKey: randomUUID(),
    orders: await ticked(list),
    reason,
  });
}

async function reopen(at: Scene, list: readonly Order[]) {
  return runOrdersAction(reopenBuying, at.owner.id, {
    clientKey: randomUUID(),
    orders: await ticked(list),
  });
}

/** The real record action: 07 What saving a record does, with stock. */
async function buy(at: Scene, order: Order, qty: string, comment: string | null = null) {
  return runOrdersAction(recordPurchase, at.owner.id, {
    clientKey: randomUUID(),
    orders: [{ id: order.id, version: await versionOf(order.id) }],
    purchasedOn: TODAY,
    paymentType: "CARD",
    supplierId: null,
    receiptFileIds: [],
    lines: [
      {
        orderId: order.id,
        variantId: order.variantId,
        qty,
        unitPrice: "5000",
        extras: [],
        comment,
      },
    ],
  });
}

async function progressOf(orderId: string) {
  const [row] = await db
    .select({
      status: orders.status,
      progress: orders.progress,
      finishReason: orders.finishReason,
      version: orders.version,
    })
    .from(orders)
    .where(eq(orders.id, orderId));
  return row!;
}

async function stockOf(branchId: string, variantId: string) {
  const [row] = await db
    .select({ qty: stockBalances.qty })
    .from(stockBalances)
    .where(
      sql`${stockBalances.branchId} = ${branchId} and ${stockBalances.variantId} = ${variantId}`,
    );
  return row?.qty ?? null;
}

function refusedCodes(result: Awaited<ReturnType<typeof finish>>) {
  expect(result.ok).toBe(false);
  if (result.ok) return {};
  return Object.fromEntries((result.error.orders ?? []).map((one) => [one.orderId, one.code]));
}

describe("Finish order (07 Order progress: Done short with a reason)", () => {
  it("two ticked orders, one reason: Done short and the reason, one action, two events", async () => {
    const at = await scene();
    const first = await openOrder(at);
    const second = await openOrder(at);
    await received(at, first, "60");
    await received(at, second, "1");

    const result = await finish(at, [first, second], `  ${REASON}  `);
    expect(result.ok).toBe(true);
    for (const order of [first, second]) {
      expect(await progressOf(order.id)).toMatchObject({
        status: "PURCHASING",
        progress: "DONE_SHORT",
        // Stored trimmed (moveReason(); decided item 7).
        finishReason: REASON,
        version: order.version + 1,
      });
    }
    const events = await db
      .select()
      .from(orderEvents)
      .where(inArray(orderEvents.orderId, [first.id, second.id]));
    expect(events).toHaveLength(2);
    expect(new Set(events.map((event) => event.actionId)).size).toBe(1);
    for (const event of events) {
      expect(event).toMatchObject({
        type: "FINISH_ORDER",
        fromStatus: "PURCHASING",
        toStatus: "PURCHASING",
        comment: REASON,
        payload: { progress: { from: "OPEN", to: "DONE_SHORT" } },
      });
    }
    const [action] = await db
      .select()
      .from(orderActions)
      .where(eq(orderActions.id, events[0]!.actionId));
    expect(action).toMatchObject({ type: "FINISH_ORDER", reason: REASON, orderCount: 2 });
  });

  it("a ticked order with nothing received refuses the whole action, named with a wrong-status one (06 rule 8)", async () => {
    const at = await scene();
    const part = await openOrder(at);
    const empty = await openOrder(at);
    const done = await openOrder(at);
    await received(at, part, "60");
    await received(at, done, "100");
    await db.update(orders).set({ progress: "DONE" }).where(eq(orders.id, done.id));

    const result = await finish(at, [part, empty, done]);
    expect(refusedCodes(result)).toEqual({ [empty.id]: "not_ready", [done.id]: "wrong_status" });
    expect(await progressOf(part.id)).toMatchObject({ progress: "OPEN", finishReason: null });
    expect(await progressOf(empty.id)).toMatchObject({ progress: "OPEN" });
    expect(
      await db.select().from(orderEvents).where(eq(orderEvents.orderId, part.id)),
    ).toHaveLength(0);
  });

  it("an order whose only record is cancelled has received nothing: Finish is not ready (08; D40)", async () => {
    const at = await scene();
    const order = await openOrder(at);
    await received(at, order, "60", true);
    expect(refusedCodes(await finish(at, [order]))).toEqual({ [order.id]: "not_ready" });
  });

  it("a blank or 4-character reason is refused before anything is written (06 rule 3)", async () => {
    const at = await scene();
    const order = await openOrder(at);
    await received(at, order, "60");
    const none = await runOrdersAction(finishOrders, at.owner.id, {
      clientKey: randomUUID(),
      orders: [{ id: order.id, version: order.version }],
    });
    for (const result of [
      none,
      await finish(at, [order], ""),
      await finish(at, [order], "   "),
      await finish(at, [order], "abcd"),
    ]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("invalid_input");
    }
    expect(await progressOf(order.id)).toMatchObject({ progress: "OPEN", version: order.version });
  });

  it("a stale version is refused (06 rule 7)", async () => {
    const at = await scene();
    const order = await openOrder(at);
    await received(at, order, "60");
    const result = await runOrdersAction(finishOrders, at.owner.id, {
      clientKey: randomUUID(),
      orders: [{ id: order.id, version: order.version + 5 }],
      reason: REASON,
    });
    expect(refusedCodes(result)).toEqual({ [order.id]: "stale_version" });
  });

  it("Finish order on a Waiting-for-settlement order is wrong status", async () => {
    const at = await scene();
    const order = await openOrder(at);
    await received(at, order, "60");
    await db.update(orders).set({ status: "SETTLEMENT" }).where(eq(orders.id, order.id));
    expect(refusedCodes(await finish(at, [order]))).toEqual({ [order.id]: "wrong_status" });
  });
});

describe("Not bought (07 Order progress; edge case 'The item cannot be found at all')", () => {
  it("nothing received: Not bought with the reason", async () => {
    const at = await scene();
    const order = await openOrder(at);
    expect((await notBought(at, [order])).ok).toBe(true);
    expect(await progressOf(order.id)).toMatchObject({
      status: "PURCHASING",
      progress: "NOT_BOUGHT",
      finishReason: REASON,
    });
  });

  it("something received is refused; a cancelled-only record lets it through (D40)", async () => {
    const at = await scene();
    const bought = await openOrder(at);
    const cancelled = await openOrder(at);
    await received(at, bought, "0.5");
    await received(at, cancelled, "60", true);
    expect(refusedCodes(await notBought(at, [bought, cancelled]))).toEqual({
      [bought.id]: "not_ready",
    });
    expect((await notBought(at, [cancelled])).ok).toBe(true);
    expect((await progressOf(cancelled.id)).progress).toBe("NOT_BOUGHT");
  });
});

describe("Reopen buying (07: 'While the order is Open, the Manager can reopen a finished order's buying')", () => {
  it("Done short, Done and Not bought become Open, the reason cleared, the history kept", async () => {
    const at = await scene();
    const short = await openOrder(at);
    const done = await openOrder(at);
    const none = await openOrder(at);
    await received(at, short, "60");
    await received(at, done, "100");
    expect((await finish(at, [short])).ok).toBe(true);
    await db.update(orders).set({ progress: "DONE" }).where(eq(orders.id, done.id));
    expect((await notBought(at, [none])).ok).toBe(true);

    expect((await reopen(at, [short, done, none])).ok).toBe(true);
    for (const order of [short, done, none]) {
      expect(await progressOf(order.id)).toMatchObject({ progress: "OPEN", finishReason: null });
    }
    const [event] = await db
      .select()
      .from(orderEvents)
      .where(sql`${orderEvents.orderId} = ${short.id} and ${orderEvents.type} = 'REOPEN_BUYING'`);
    expect(event).toMatchObject({
      comment: null,
      payload: { progress: { from: "DONE_SHORT", to: "OPEN" } },
    });
  });

  it("an Open order with buying open, and a Waiting-for-settlement one, are wrong status", async () => {
    const at = await scene();
    const open = await openOrder(at);
    const settling = await openOrder(at);
    await received(at, settling, "60");
    await db
      .update(orders)
      .set({ status: "SETTLEMENT", progress: "DONE_SHORT", finishReason: REASON })
      .where(eq(orders.id, settling.id));
    expect(refusedCodes(await reopen(at, [open, settling]))).toEqual({
      [open.id]: "wrong_status",
      [settling.id]: "wrong_status",
    });
  });

  it("a reopened Done short order is recordable again (3.3 decided item 3); a record is refused before", async () => {
    const at = await scene();
    const order = await openOrder(at);
    expect((await buy(at, order, "60")).ok).toBe(true);
    expect((await finish(at, [order])).ok).toBe(true);
    const before = await buy(at, order, "40");
    expect(refusedCodes(before)).toEqual({ [order.id]: "wrong_status" });

    expect((await reopen(at, [order])).ok).toBe(true);
    expect((await buy(at, order, "40")).ok).toBe(true);
    expect((await progressOf(order.id)).progress).toBe("DONE");
  });

  it("over plan after a reopen of a Done order: the record needs its comment, and Done again (edge case 'More was bought than approved')", async () => {
    const at = await scene();
    const order = await openOrder(at);
    expect((await buy(at, order, "100")).ok).toBe(true);
    expect((await progressOf(order.id)).progress).toBe("DONE");
    expect((await reopen(at, [order])).ok).toBe(true);

    const bare = await buy(at, order, "10");
    expect(bare.ok).toBe(false);
    if (!bare.ok) {
      expect(bare.error.code).toBe("invalid_input");
      expect(bare.error.fields).toEqual({ "lines.0.comment": "errors.field.required" });
    }
    expect((await buy(at, order, "10", "Ten more came with the box")).ok).toBe(true);
    expect((await progressOf(order.id)).progress).toBe("DONE");
    const page = await getOrderPage(at.owner.id, order.id);
    expect(page?.received).toBe("110");
    expect(page?.overPlan).toBe(true);
  });

  it("Finish after a reopen of a Done order with no further record gives Done (decided item 1, Look first)", async () => {
    const at = await scene();
    const order = await openOrder(at);
    expect((await buy(at, order, "100")).ok).toBe(true);
    expect((await reopen(at, [order])).ok).toBe(true);
    expect((await finish(at, [order])).ok).toBe(true);
    expect(await progressOf(order.id)).toMatchObject({ progress: "DONE", finishReason: null });
  });
});

describe("15 S4 without the issue: 60 notebooks, then 40", () => {
  it("stock 60, then 100; the order stays Open until the second record", async () => {
    const at = await scene();
    const order = await openOrder(at);

    expect((await buy(at, order, "60")).ok).toBe(true);
    expect(await stockOf(at.branch.id, order.variantId)).toBe("60.000");
    expect(await progressOf(order.id)).toMatchObject({ status: "PURCHASING", progress: "OPEN" });
    // Edge case "The shop has only part of the quantity": the order stays Open, recordable.
    expect((await getOrderPage(at.owner.id, order.id))?.buying).toEqual(["FINISH_ORDER"]);

    expect((await buy(at, order, "40")).ok).toBe(true);
    expect(await stockOf(at.branch.id, order.variantId)).toBe("100.000");
    expect(await progressOf(order.id)).toMatchObject({ status: "PURCHASING", progress: "DONE" });
  });
});

describe("Not bought and a record of the same order at the same moment (15 Test layers)", () => {
  it("the record first: it is saved, Not bought is refused stale, nothing is Not bought with a record", async () => {
    const at = await scene();
    const order = await openOrder(at);
    const sent = [{ id: order.id, version: order.version }];
    const { db: pool } = await import("@/server/db/client");
    const holder = await pool.$client.connect();
    try {
      // A third transaction holds the order; the record queues first, then Not bought.
      await holder.query("begin");
      await holder.query("select id from orders where id = $1 for update", [order.id]);
      const record = runOrdersAction(recordPurchase, at.owner.id, {
        clientKey: randomUUID(),
        orders: sent,
        purchasedOn: TODAY,
        paymentType: "CARD",
        supplierId: null,
        receiptFileIds: [],
        lines: [
          {
            orderId: order.id,
            variantId: order.variantId,
            qty: "60",
            unitPrice: "5000",
            extras: [],
            comment: null,
          },
        ],
      });
      await waiters(holder, 1);
      const none = runOrdersAction(markNotBought, at.owner.id, {
        clientKey: randomUUID(),
        orders: sent,
        reason: REASON,
      });
      await waiters(holder, 2);
      await holder.query("commit");

      expect((await record).ok).toBe(true);
      expect(refusedCodes(await none)).toEqual({ [order.id]: "stale_version" });
    } finally {
      holder.release();
    }
    expect(await progressOf(order.id)).toMatchObject({ progress: "OPEN", finishReason: null });
  });
});

/** Waits until `count` other connections wait on a lock, read from pg_stat_activity. */
async function waiters(
  client: { query: (text: string) => Promise<{ rows: { n: number }[] }> },
  count: number,
) {
  for (let tries = 0; tries < 5_000; tries += 1) {
    await client.query("select pg_stat_clear_snapshot()");
    const waiting = await client.query(
      `select count(*)::int as n from pg_stat_activity
       where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid()`,
    );
    if (waiting.rows[0]!.n >= count) return;
  }
  throw new Error(`Never ${count} waiting connections.`);
}
