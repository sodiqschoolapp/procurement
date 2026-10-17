import { randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getSettlement } from "@/features/money/queries/settlement";
import { approveOrders } from "@/features/orders/actions/approve";
import { closeOrders } from "@/features/orders/actions/close";
import { sendBackForCorrectionOrders } from "@/features/orders/actions/send-back-for-correction";
import { sendToSettlementOrders } from "@/features/orders/actions/send-to-settlement";
import { submitDrafts } from "@/features/orders/actions/submit";
import { getOrderPage } from "@/features/orders/queries/order-page";
import { tickedSummary } from "@/features/orders/queries/order-list";
import { recordPurchase } from "@/features/purchasing/actions/record-purchase";
import { settleCash } from "@/features/money/actions/settle-cash";
import type { ActionResult } from "@/server/action-result";
import { db } from "@/server/db/client";
import {
  branches,
  notifications,
  orderActions,
  orderEvents,
  orderSettlements,
  orders,
} from "@/server/db/schema";
import { type OrdersResult, runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import {
  insertExtraCostType,
  insertOrder,
  insertOrderExtra,
} from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { acknowledgeOverspend } from "./acknowledge-overspend";

// The Head's Acknowledge overspend, build plan 4.7 (Done when: S12 as a test; with the guard off
// the same order closes without the Head) and the plan's Tests: 08-money-and-settlement.md
// (Overspend guard; Closing 3), 06-approval-workflow.md (rules 3, 7 and 8),
// 10-notifications-analytics-reports.md (Notifications: "Overspend above the guard | Head",
// "Overspend acknowledged | Finance users of the branch"), 15 S12, and the review of the plan
// (corrections 1 and 3). Every order goes through the real actions from Draft to settlement;
// every fixture is asserted (D38); every passing case has the refused data beside it (D40). The
// permission rows are acknowledge-overspend-matrix.db.test.ts.

const TODAY = "2031-06-02";
const COMMENT = "Invented settlement for the test";

function expectOk(result: ActionResult<unknown>) {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: OrdersResult }).data;
}

/** A branch with a Manager, a Principal, two Finance users, and a Head of all branches. */
async function scene() {
  setClock(`${TODAY}T07:00:00Z`);
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
  const finance = await insertUser("FINANCE", { branches: [branch.id] });
  const colleague = await insertUser("FINANCE", { branches: [branch.id] });
  const head = await insertUser("HEAD");
  return { branch, manager, principal, finance, colleague, head };
}

type Scene = Awaited<ReturnType<typeof scene>>;
type Ticked = { id: string; version: number };
type PaymentType = "CASH" | "CARD" | "TRANSFER";

async function versionOf(id: string): Promise<number> {
  const [row] = await db.select({ version: orders.version }).from(orders).where(eq(orders.id, id));
  return row!.version;
}

async function ticked(ids: readonly string[]): Promise<Ticked[]> {
  return Promise.all(ids.map(async (id) => ({ id, version: await versionOf(id) })));
}

function ordersOf(list: readonly Ticked[], clientKey: string = randomUUID()) {
  return { clientKey, orders: list.map(({ id, version }) => ({ id, version })) };
}

/** A draft of the scene's Manager, submitted and approved by the Head and the Principal. */
async function atFinance(
  s: Scene,
  options: {
    qty?: string;
    price?: bigint;
    extra?: bigint;
    variantId?: string;
    paymentType?: PaymentType;
  } = {},
) {
  const draft = await insertOrder({
    branchId: s.branch.id,
    ownerId: s.manager.id,
    variantId: options.variantId,
    plannedQty: options.qty ?? "100",
    plannedPrice: options.price ?? 5_000n,
    paymentType: options.paymentType ?? "CASH",
    neededBy: "2031-07-01",
  });
  const extra = options.extra ?? 20_000n;
  if (extra > 0n) await insertOrderExtra(draft.id, extra);
  const id = draft.id;
  expectOk(await runOrdersAction(submitDrafts, s.manager.id, ordersOf(await ticked([id]))));
  expectOk(await runOrdersAction(approveOrders, s.head.id, ordersOf(await ticked([id]))));
  expectOk(await runOrdersAction(approveOrders, s.principal.id, ordersOf(await ticked([id]))));
  return { id, variantId: draft.variantId };
}

type Order = Awaited<ReturnType<typeof atFinance>>;

/**
 * An order of 08 Worked example (100 notebooks × 5 000 plus 20 000 delivery unless changed),
 * through the three approvals; Finance gives `cash` (the planned 520 000 for a cash order).
 */
async function opened(s: Scene, options: Parameters<typeof atFinance>[1] & { cash?: string } = {}) {
  const order = await atFinance(s, options);
  const cash = options.cash ?? ((options.paymentType ?? "CASH") === "CASH" ? "520000" : "0");
  expectOk(
    await runOrdersAction(approveOrders, s.finance.id, {
      ...ordersOf(await ticked([order.id])),
      ...(cash === "0" ? {} : { cash: { [order.id]: cash } }),
    }),
  );
  return order;
}

/** One trip of the scene's Manager: each order with its line; the full quantity is Done (07). */
async function buy(
  s: Scene,
  lines: readonly {
    order: Order;
    qty?: string;
    unitPrice?: string;
    variantId?: string;
    extra?: string | null;
    comment?: string | null;
  }[],
  paymentType: PaymentType = "CASH",
) {
  const delivery = await insertExtraCostType();
  return expectOk(
    await runOrdersAction(recordPurchase, s.manager.id, {
      ...ordersOf(await ticked(lines.map(({ order }) => order.id))),
      purchasedOn: TODAY,
      paymentType,
      supplierId: null,
      receiptFileIds: [],
      lines: lines.map((line) => ({
        orderId: line.order.id,
        variantId: line.variantId ?? line.order.variantId,
        qty: line.qty ?? "100",
        unitPrice: line.unitPrice ?? "5000",
        extras:
          line.extra === null
            ? []
            : [
                {
                  extraCostTypeId: delivery.id,
                  amount: line.extra ?? "20000",
                  paymentType,
                },
              ],
        // A price or extra other than planned needs a comment (07 Recording a purchase).
        comment:
          line.comment ??
          (line.unitPrice !== undefined || line.extra !== undefined
            ? "Invented: the shop's price today"
            : null),
      })),
    }),
  );
}

async function toSettlement(s: Scene, list: readonly Order[]) {
  const moved = expectOk(
    await runOrdersAction(
      sendToSettlementOrders,
      s.manager.id,
      ordersOf(await ticked(list.map((order) => order.id))),
    ),
  );
  expect(moved.orders.map((order) => order.status)).toEqual(list.map(() => "SETTLEMENT"));
}

type Row = { kind: "CASH_RETURNED" | "PAID_BACK"; amount: string };
const pay = (amount: string): Row => ({ kind: "PAID_BACK", amount });

async function settle(s: Scene, rows: Record<string, Row>) {
  return expectOk(
    await runOrdersAction(settleCash, s.finance.id, {
      ...ordersOf(await ticked(Object.keys(rows))),
      occurredOn: TODAY,
      comment: COMMENT,
      rows,
    }),
  );
}

async function close(userId: string, list: readonly Order[], clientKey = randomUUID()) {
  return runOrdersAction(
    closeOrders,
    userId,
    ordersOf(await ticked(list.map((order) => order.id)), clientKey),
  );
}

/** A Close that worked: every order Closed, `closed_at` now, one CLOSE event each. */
async function expectClosed(s: Scene, list: readonly Order[]) {
  const result = await close(s.finance.id, list);
  const data = expectOk(result);
  expect(data.orders).toHaveLength(list.length);
  expect(data.orders).toEqual(
    expect.arrayContaining(list.map((order) => ({ id: order.id, status: "CLOSED" }))),
  );
  const ids = list.map((order) => order.id);
  const rows = await db
    .select({ id: orders.id, status: orders.status, closedAt: orders.closedAt })
    .from(orders)
    .where(inArray(orders.id, ids));
  for (const row of rows) {
    expect(row.status).toBe("CLOSED");
    expect(row.closedAt?.toISOString()).toBe(`${TODAY}T07:00:00.000Z`);
  }
  const events = await db
    .select({
      orderId: orderEvents.orderId,
      from: orderEvents.fromStatus,
      to: orderEvents.toStatus,
    })
    .from(orderEvents)
    .where(and(inArray(orderEvents.orderId, ids), eq(orderEvents.type, "CLOSE")));
  expect(events).toHaveLength(list.length);
  for (const event of events) expect(event).toMatchObject({ from: "SETTLEMENT", to: "CLOSED" });
  return data;
}

/** A refused Close: the orders named `not_ready`, and nothing saved at all. */
async function expectNotReady(s: Scene, list: readonly Order[], notReady: readonly Order[]) {
  const before = await ticked(list.map((order) => order.id));
  const key = randomUUID();
  const result = await close(s.finance.id, list, key);
  expect(result).toMatchObject({ ok: false, error: { code: "not_ready" } });
  const named = result.ok ? [] : (result.error.orders ?? []);
  expect(named).toHaveLength(notReady.length);
  expect(named).toEqual(
    expect.arrayContaining(notReady.map((order) => ({ orderId: order.id, code: "not_ready" }))),
  );
  expect(await db.select().from(orderActions).where(eq(orderActions.clientKey, key))).toEqual([]);
  expect(await ticked(list.map((order) => order.id))).toEqual(before);
  const statuses = await db
    .select({ status: orders.status })
    .from(orders)
    .where(
      inArray(
        orders.id,
        list.map((order) => order.id),
      ),
    );
  expect(statuses.map((row) => row.status)).toEqual(list.map(() => "SETTLEMENT"));
}

async function settlementOf(s: Scene, list: readonly Order[]) {
  const found = await getSettlement(
    s.finance.id,
    list.map((order) => order.id),
  );
  expect(found).not.toBeNull();
  const byId = new Map(found!.managers.flatMap((manager) => manager.orders).map((o) => [o.id, o]));
  return list.map((order) => byId.get(order.id)!);
}

/** A guard setting from now on (14 settings: one row per key), as JSON. */
async function guardSetting(
  key: "overspend_guard_min_amount" | "overspend_guard_percent",
  value: string | number,
) {
  await db.execute(
    sql`insert into settings (key, value, created_at)
        values (${key}, ${JSON.stringify(value)}::jsonb, ${`${TODAY}T06:00:00Z`})
        on conflict (key) do update set value = excluded.value`,
  );
}

/** Runs `body` with the guard's settings changed, and restores the defaults (10, 100 000). */
async function withGuard(
  guard: { percent?: number | "off"; amount?: string },
  body: () => Promise<void>,
) {
  if (guard.percent !== undefined) await guardSetting("overspend_guard_percent", guard.percent);
  if (guard.amount !== undefined) await guardSetting("overspend_guard_min_amount", guard.amount);
  try {
    await body();
  } finally {
    await guardSetting("overspend_guard_percent", 10);
    await guardSetting("overspend_guard_min_amount", "100000");
  }
}

const REASON = "Prices rose this week";

async function acknowledge(
  userId: string,
  list: readonly Order[],
  options: { reason?: string; clientKey?: string } = {},
) {
  return runOrdersAction(acknowledgeOverspend, userId, {
    ...ordersOf(await ticked(list.map((order) => order.id)), options.clientKey),
    reason: options.reason ?? REASON,
  });
}

/** The stored acknowledgment of an order: by, at and comment, or null when none. */
async function ackOf(order: Order) {
  const [row] = await db
    .select({
      by: orderSettlements.overspendAckBy,
      at: orderSettlements.overspendAckAt,
      comment: orderSettlements.overspendAckComment,
    })
    .from(orderSettlements)
    .where(eq(orderSettlements.orderId, order.id));
  return row?.by ? { by: row.by, at: row.at?.toISOString(), comment: row.comment } : null;
}

/**
 * An order of 08 Worked example bought at `unitPrice` and sent to settlement, its count settled
 * to 0: at 5 800, 600 000 (S12: 80 000 and about 15% over); at 6 500, 670 000 (150 000 and about
 * 29% over, above the default guard); at 5 200, 540 000 (20 000 over, under any amount above it).
 */
async function inSettlement(s: Scene, unitPrice: "5800" | "6500" | "5200") {
  const order = await opened(s);
  await buy(s, [{ order, unitPrice }]);
  await toSettlement(s, [order]);
  const over = { "5800": "80000", "6500": "150000", "5200": "20000" }[unitPrice];
  await settle(s, { [order.id]: pay(over) });
  return order;
}

/** The notices of `type` about the scenes' branches that went to the scenes' own people. */
async function toldIn(
  type: "OVERSPEND_ABOVE_GUARD" | "OVERSPEND_ACKNOWLEDGED",
  scenes: readonly Scene[],
) {
  const codes = (
    await db
      .select({ code: branches.code })
      .from(branches)
      .where(
        inArray(
          branches.id,
          scenes.map((each) => each.branch.id),
        ),
      )
  ).map((row) => row.code);
  const people = new Set(
    scenes.flatMap((each) => [
      each.manager.id,
      each.principal.id,
      each.finance.id,
      each.colleague.id,
      each.head.id,
    ]),
  );
  const told = await db
    .select({ userId: notifications.userId, params: notifications.params })
    .from(notifications)
    .where(
      and(
        eq(notifications.type, type),
        inArray(sql<string>`${notifications.params} ->> 'branch'`, codes),
      ),
    );
  return told
    .filter((notice) => people.has(notice.userId))
    .map((notice) => ({
      userId: notice.userId,
      branch: (notice.params as { branch: string }).branch,
      count: (notice.params as { count: number }).count,
    }));
}

async function codeOf(s: Scene) {
  const [row] = await db
    .select({ code: branches.code })
    .from(branches)
    .where(eq(branches.id, s.branch.id));
  return row!.code;
}

describe("S12 through the button (15 S12; 08 Overspend guard; Closing 3)", () => {
  it("at the amount 100 000 Finance closes without the Head, and the Head's acknowledgment is refused as not needed", async () => {
    const s = await scene();
    const order = await inSettlement(s, "5800");
    const key = randomUUID();
    expect(await acknowledge(s.head.id, [order], { clientKey: key })).toMatchObject({
      ok: false,
      error: { code: "not_ready", orders: [{ orderId: order.id, code: "not_ready" }] },
    });
    expect(await db.select().from(orderActions).where(eq(orderActions.clientKey, key))).toEqual([]);
    expect(await ackOf(order)).toBeNull();
    await expectClosed(s, [order]);
  });

  it("at 50 000 Finance cannot close until the Head acknowledges with a comment; then Finance closes", async () => {
    const s = await scene();
    const order = await inSettlement(s, "5800");
    await withGuard({ amount: "50000" }, async () => {
      await expectNotReady(s, [order], [order]);

      const done = expectOk(await acknowledge(s.head.id, [order], { reason: `  ${REASON}  ` }));
      expect(done.orders).toEqual([{ id: order.id, status: "SETTLEMENT" }]);
      expect(await ackOf(order)).toEqual({
        by: s.head.id,
        at: `${TODAY}T07:00:00.000Z`,
        comment: REASON,
      });
      const [event] = await db
        .select({
          from: orderEvents.fromStatus,
          to: orderEvents.toStatus,
          comment: orderEvents.comment,
          actorId: orderEvents.actorId,
        })
        .from(orderEvents)
        .where(
          and(eq(orderEvents.orderId, order.id), eq(orderEvents.type, "ACKNOWLEDGE_OVERSPEND")),
        );
      expect(event).toEqual({
        from: "SETTLEMENT",
        to: "SETTLEMENT",
        comment: REASON,
        actorId: s.head.id,
      });

      await expectClosed(s, [order]);
    });
  });

  it("with the guard off the same order closes without the Head (Done when), and the button is refused", async () => {
    const s = await scene();
    const order = await inSettlement(s, "5800");
    await withGuard({ percent: "off", amount: "50000" }, async () => {
      expect(await acknowledge(s.head.id, [order])).toMatchObject({
        ok: false,
        error: { code: "not_ready" },
      });
      await expectClosed(s, [order]);
    });
  });

  it("with both settings at 0 every overspend needs the Head: 20 000 over waits for him", async () => {
    const s = await scene();
    const order = await inSettlement(s, "5200");
    await withGuard({ percent: 0, amount: "0" }, async () => {
      await expectNotReady(s, [order], [order]);
      expectOk(await acknowledge(s.head.id, [order]));
      await expectClosed(s, [order]);
    });
  });
});

describe('ticked orders, all or nothing (08: "several ticked orders with one comment"; 06 rules 3, 7 and 8)', () => {
  it("two orders above the guard are acknowledged with one comment in one action", async () => {
    const s = await scene();
    const first = await inSettlement(s, "6500");
    const second = await inSettlement(s, "6500");
    const done = expectOk(await acknowledge(s.head.id, [first, second]));
    expect(done.orders).toHaveLength(2);
    const [action] = await db
      .select({ reason: orderActions.reason, count: orderActions.orderCount })
      .from(orderActions)
      .where(eq(orderActions.id, done.actionId));
    expect(action).toEqual({ reason: REASON, count: 2 });
    for (const order of [first, second]) {
      expect(await ackOf(order)).toMatchObject({ by: s.head.id, comment: REASON });
    }
  });

  it("one of three not above the guard, or one already acknowledged: not_ready names it and nothing is written", async () => {
    const s = await scene();
    const first = await inSettlement(s, "6500");
    const second = await inSettlement(s, "6500");
    const under = await inSettlement(s, "5200");
    const before = await ticked([first.id, second.id, under.id]);
    const key = randomUUID();
    expect(await acknowledge(s.head.id, [first, second, under], { clientKey: key })).toMatchObject({
      ok: false,
      error: { code: "not_ready", orders: [{ orderId: under.id, code: "not_ready" }] },
    });
    expect(await db.select().from(orderActions).where(eq(orderActions.clientKey, key))).toEqual([]);
    expect(await ticked([first.id, second.id, under.id])).toEqual(before);
    expect(await ackOf(first)).toBeNull();
    expect(await ackOf(second)).toBeNull();

    expectOk(await acknowledge(s.head.id, [first]));
    expect(await acknowledge(s.head.id, [first, second])).toMatchObject({
      ok: false,
      error: { code: "not_ready", orders: [{ orderId: first.id, code: "not_ready" }] },
    });
    expect(await ackOf(second)).toBeNull();
  });

  it("an Open order is wrong_status; a comment under 5 characters is refused; an old version is refused; the same browser id twice returns the first result", async () => {
    const s = await scene();
    const open = await opened(s);
    await buy(s, [{ order: open, unitPrice: "6500" }]);
    expect(await acknowledge(s.head.id, [open])).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: open.id, code: "wrong_status" }] },
    });

    const order = await inSettlement(s, "6500");
    expect(await acknowledge(s.head.id, [order], { reason: " ok  " })).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { reason: "errors.field.tooShort" } },
    });
    expect(await ackOf(order)).toBeNull();

    const old = [{ id: order.id, version: (await versionOf(order.id)) - 1 }];
    expect(
      await runOrdersAction(acknowledgeOverspend, s.head.id, { ...ordersOf(old), reason: REASON }),
    ).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: order.id, code: "stale_version" }] },
    });
    expect(await ackOf(order)).toBeNull();

    const once = randomUUID();
    const first = expectOk(await acknowledge(s.head.id, [order], { clientKey: once }));
    const again = await runOrdersAction(acknowledgeOverspend, s.head.id, {
      ...ordersOf(old, once),
      reason: REASON,
    });
    expect(expectOk(again)).toEqual(first);
  });

  it("Send back for correction clears the acknowledgment: sent to settlement again, the order needs the Head again (08 Overspend guard, last sentence; review correction 3)", async () => {
    const s = await scene();
    const order = await inSettlement(s, "6500");
    expectOk(await acknowledge(s.head.id, [order]));
    expect((await tickedSummary(s.head.id, [order.id])).canAcknowledgeOverspend).toBe(false);

    expectOk(
      await runOrdersAction(sendBackForCorrectionOrders, s.finance.id, {
        ...ordersOf(await ticked([order.id])),
        reason: "Invented: a record to check",
      }),
    );
    expect(await ackOf(order)).toBeNull();
    await toSettlement(s, [order]);
    await expectNotReady(s, [order], [order]);
    expect((await tickedSummary(s.head.id, [order.id])).canAcknowledgeOverspend).toBe(true);
    expectOk(await acknowledge(s.head.id, [order]));
    await expectClosed(s, [order]);
  });
});

describe("who is told (10 Notifications; .claude/rules/tests.md: two branches in one action)", () => {
  it('"Overspend above the guard": one notice per branch to the Heads, counting only the sent orders above it, never the actor (review correction 1)', async () => {
    const a = await scene();
    const b = await scene();
    const lists = [];
    for (const each of [a, b]) {
      const over = await opened(each);
      const under = await opened(each);
      await buy(each, [
        { order: over, unitPrice: "6500" },
        { order: under, unitPrice: "5200" },
      ]);
      lists.push(over, under);
    }
    // The Head of scene a sends the four orders of both branches in one action.
    expectOk(
      await runOrdersAction(
        sendToSettlementOrders,
        a.head.id,
        ordersOf(await ticked(lists.map((order) => order.id))),
      ),
    );
    const told = await toldIn("OVERSPEND_ABOVE_GUARD", [a, b]);
    expect(
      told.map((notice) => ({ ...notice })).sort((x, y) => (x.branch < y.branch ? -1 : 1)),
    ).toEqual(
      [
        { userId: b.head.id, branch: await codeOf(a), count: 1 },
        { userId: b.head.id, branch: await codeOf(b), count: 1 },
      ].sort((x, y) => (x.branch < y.branch ? -1 : 1)),
    );
  });

  it("no notice when no sent order is above the guard, or when the guard is off", async () => {
    const s = await scene();
    const under = await opened(s);
    await buy(s, [{ order: under, unitPrice: "5200" }]);
    await toSettlement(s, [under]);
    expect(await toldIn("OVERSPEND_ABOVE_GUARD", [s])).toEqual([]);

    await withGuard({ percent: "off" }, async () => {
      const over = await opened(s);
      await buy(s, [{ order: over, unitPrice: "6500" }]);
      await toSettlement(s, [over]);
      expect(await toldIn("OVERSPEND_ABOVE_GUARD", [s])).toEqual([]);
    });
  });

  it('"Overspend acknowledged": one notice per branch to that branch\'s active Finance users only', async () => {
    const a = await scene();
    const b = await scene();
    const inA = await inSettlement(a, "6500");
    const inB = await inSettlement(b, "6500");
    expectOk(await acknowledge(a.head.id, [inA, inB]));
    const told = await toldIn("OVERSPEND_ACKNOWLEDGED", [a, b]);
    const of = async (each: Scene) =>
      told
        .filter((notice) => notice.branch === each.branch.code)
        .map((notice) => notice.userId)
        .sort();
    for (const each of [a, b]) {
      expect(await of(each)).toEqual([each.finance.id, each.colleague.id].sort());
    }
    for (const notice of told) expect(notice.count).toBe(1);
  });
});

describe("what the screens are told (08 Overspend guard; Closing 3; D40)", () => {
  it("the list bar offers the button for a clean set only, and only to the Head", async () => {
    const s = await scene();
    const first = await inSettlement(s, "6500");
    const second = await inSettlement(s, "6500");
    const under = await inSettlement(s, "5200");
    const done = await inSettlement(s, "6500");
    expectOk(await acknowledge(s.head.id, [done]));
    const open = await opened(s);
    await buy(s, [{ order: open, unitPrice: "6500" }]);

    const offered = async (userId: string, list: readonly Order[]) =>
      (
        await tickedSummary(
          userId,
          list.map((order) => order.id),
        )
      ).canAcknowledgeOverspend;
    expect(await offered(s.head.id, [first, second])).toBe(true);
    expect(await offered(s.head.id, [first, under])).toBe(false);
    expect(await offered(s.head.id, [first, done])).toBe(false);
    expect(await offered(s.head.id, [first, open])).toBe(false);
    expect(await offered(s.finance.id, [first])).toBe(false);
    expect(await offered(s.manager.id, [first])).toBe(false);
    expect(await offered(s.principal.id, [first])).toBe(false);
  });

  it("the order page offers it to the Head on an order above the guard only", async () => {
    const s = await scene();
    const over = await inSettlement(s, "6500");
    const under = await inSettlement(s, "5200");
    expect((await getOrderPage(s.head.id, over.id))?.canAcknowledgeOverspend).toBe(true);
    expect((await getOrderPage(s.head.id, under.id))?.canAcknowledgeOverspend).toBe(false);
    expect((await getOrderPage(s.finance.id, over.id))?.canAcknowledgeOverspend).toBe(false);
    expect((await getOrderPage(s.principal.id, over.id))?.canAcknowledgeOverspend).toBe(false);
    expectOk(await acknowledge(s.head.id, [over]));
    expect((await getOrderPage(s.head.id, over.id))?.canAcknowledgeOverspend).toBe(false);
  });

  it("Finance's settlement screen names the order that waits, then the Head who acknowledged it", async () => {
    const s = await scene();
    const over = await inSettlement(s, "6500");
    const under = await inSettlement(s, "5200");
    const [shownOver, shownUnder] = await settlementOf(s, [over, under]);
    expect(shownOver!.overspend).toEqual({ over: 150_000n, percent: "28.8", acknowledgedBy: null });
    expect(shownUnder!.overspend).toBeNull();

    expectOk(await acknowledge(s.head.id, [over]));
    const [after] = await settlementOf(s, [over]);
    expect(after!.overspend).toEqual({
      over: 150_000n,
      percent: "28.8",
      acknowledgedBy: s.head.fullName,
    });
  });
});
