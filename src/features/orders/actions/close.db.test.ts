import { randomUUID } from "node:crypto";

import { and, count, eq, inArray, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { confirmSettlement } from "@/features/money/actions/confirm-settlement";
import { settleCash } from "@/features/money/actions/settle-cash";
import { getSettlement } from "@/features/money/queries/settlement";
import { getOrderPage } from "@/features/orders/queries/order-page";
import { tickedSummary } from "@/features/orders/queries/order-list";
import { markNotBought } from "@/features/purchasing/actions/finish-buying";
import { recordPurchase } from "@/features/purchasing/actions/record-purchase";
import { switchManagerRight } from "@/features/users/actions/manager-rights";
import { runAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";
import { db } from "@/server/db/client";
import {
  branches,
  moneyRows,
  notifications,
  orderActions,
  orderEvents,
  orders,
  stockMovements,
} from "@/server/db/schema";
import { type OrdersResult, runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertProduct, insertSubtypes } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertMoneyAction, insertMoneyRow } from "../../../../tests/helpers/money";
import {
  insertExtraCostType,
  insertOrder,
  insertOrderExtra,
} from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { approveOrders } from "./approve";
import { closeOrders } from "./close";
import { closeExactOrders } from "./close-exact";
import { sendToSettlementOrders } from "./send-to-settlement";
import { submitDrafts } from "./submit";

// Finance's Close, build plan 4.6 (Done when: S2, S3, S9, S13 and S20 as tests, and the endings of
// S10 and S16) and the plan's Tests: 08-money-and-settlement.md (Closing 2 and 3; Overspend guard;
// Worked example), 06-approval-workflow.md (Allowed moves: "Waiting for settlement | Close |
// Finance | Closed"; rules 7 and 8), 10-notifications-analytics-reports.md (Notifications:
// "Closed, reopened"), 15 S2, S3, S9, S10, S12 (its readiness), S13, S16, S20, and the review of
// the plan (corrections 1 and 2). Every order goes through the real actions from Draft to
// settlement; every fixture is asserted (D38); every passing case has the refused data beside it
// (D40). The permission rows are close-matrix.db.test.ts.

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
const receive = (amount: string): Row => ({ kind: "CASH_RETURNED", amount });
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

async function confirm(
  s: Scene,
  block: "TRANSFER" | "CARD",
  list: readonly Order[],
  notes?: Record<string, string>,
) {
  return expectOk(
    await runOrdersAction(confirmSettlement, s.finance.id, {
      ...ordersOf(await ticked(list.map((order) => order.id))),
      block,
      confirmed: true,
      ...(notes ? { notes } : {}),
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

async function totalOf(s: Scene, order: Order) {
  const page = await getOrderPage(s.manager.id, order.id);
  expect(page).not.toBeNull();
  return page!.colours?.total;
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

/** The guard's amount setting from now on (14 settings: one row per key). */
async function guardAmount(amount: string, at: string) {
  await db.execute(
    sql`insert into settings (key, value, created_at)
        values ('overspend_guard_min_amount', ${JSON.stringify(amount)}::jsonb, ${at})
        on conflict (key) do update set value = excluded.value`,
  );
}

describe("S2 and S3: Cheaper and Dearer (15; 08 Worked example; 08 Closing 3)", () => {
  it('S2: 100 × 4 500 + 20 000: Total orange "Left 50 000"; not ready at +50 000; Finance records 50 000 returned and closes', async () => {
    const s = await scene();
    const order = await opened(s);
    await buy(s, [{ order, unitPrice: "4500" }]);
    expect(await totalOf(s, order)).toEqual({ colour: "amber", difference: 50_000n });
    await toSettlement(s, [order]);
    const [shown] = await settlementOf(s, [order]);
    expect(shown!.prefill).toEqual({ orderId: order.id, kind: "CASH_RETURNED", amount: 50_000n });
    await expectNotReady(s, [order], [order]);

    await settle(s, { [order.id]: receive("50000") });
    await expectClosed(s, [order]);
  });

  it('S3: 100 × 5 200 + 30 000: Total red "Over 30 000"; Finance pays back 30 000 and closes with no Head step', async () => {
    const s = await scene();
    const order = await opened(s);
    await buy(s, [{ order, unitPrice: "5200", extra: "30000" }]);
    expect(await totalOf(s, order)).toEqual({ colour: "red", difference: -30_000n });
    await toSettlement(s, [order]);
    await expectNotReady(s, [order], [order]);

    await settle(s, { [order.id]: pay("30000") });
    // 5.8% and 30 000 so'm are under the default guard (10% and 100 000): no acknowledgment.
    await expectClosed(s, [order]);
  });
});

describe("S9: mixed payment (15 S9; 08 Closing 2 and 3)", () => {
  it('a cash order 10 000 over and a card order 40 000 under: "Pay Manager 10 000" and card "Left 40 000"; both close once both are handled', async () => {
    const s = await scene();
    const cash = await opened(s);
    const card = await opened(s, { paymentType: "CARD" });
    await buy(s, [{ order: cash, unitPrice: "5100" }]);
    await buy(s, [{ order: card, unitPrice: "4800", extra: null }], "CARD");
    await toSettlement(s, [cash, card]);

    const [cashShown, cardShown] = await settlementOf(s, [cash, card]);
    expect(cashShown!.prefill).toEqual({ orderId: cash.id, kind: "PAID_BACK", amount: 10_000n });
    expect(cardShown!.blocks.card).toMatchObject({ difference: 40_000n });
    expect(cardShown!.prefill).toBeNull();

    // Nothing handled: both are named.
    await expectNotReady(s, [cash, card], [cash, card]);
    // The cash paid back, the card not confirmed: only the card is named, and nothing closes.
    await settle(s, { [cash.id]: pay("10000") });
    await expectNotReady(s, [cash, card], [card]);
    await confirm(s, "CARD", [card]);
    await expectClosed(s, [cash, card]);
  });
});

describe('S13: nothing bought (15 S13; edge case "Cash was given but nothing was bought")', () => {
  it("520 000 given, Not bought: the settlement asks for 520 000 back; it closes after the Receive with no stock change", async () => {
    const s = await scene();
    const order = await opened(s);
    const movementsBefore = await db
      .select({ n: count() })
      .from(stockMovements)
      .where(eq(stockMovements.branchId, s.branch.id));
    expectOk(
      await runOrdersAction(markNotBought, s.manager.id, {
        ...ordersOf(await ticked([order.id])),
        reason: "The shop had none at all",
      }),
    );
    await toSettlement(s, [order]);
    const [shown] = await settlementOf(s, [order]);
    expect(shown!.prefill).toEqual({ orderId: order.id, kind: "CASH_RETURNED", amount: 520_000n });
    await expectNotReady(s, [order], [order]);

    // A partial Receive leaves 20 000 held: still not ready.
    await settle(s, { [order.id]: receive("500000") });
    await expectNotReady(s, [order], [order]);
    await settle(s, { [order.id]: receive("20000") });
    await expectClosed(s, [order]);
    expect(
      await db
        .select({ n: count() })
        .from(stockMovements)
        .where(eq(stockMovements.branchId, s.branch.id)),
    ).toEqual(movementsBefore);
  });
});

describe("S20: many orders, one action (15 S20; 08 Worked example, three orders)", () => {
  it("approval refused whole for the fourth order; 650 000 split 520 000, 100 000, 30 000; 0144 closed by the Manager; one settlement nets 20 000; both close", async () => {
    const s = await scene();
    const o142 = await atFinance(s);
    const o143 = await atFinance(s, { qty: "50", price: 2_000n, extra: 0n });
    const o144 = await atFinance(s, { qty: "10", price: 3_000n, extra: 0n });
    const fourth = await atFinance(s, { qty: "1", price: 1_000n, extra: 0n });
    // Another Finance user approves the fourth order a moment earlier.
    const stale = await ticked([o142.id, o143.id, o144.id, fourth.id]);
    expectOk(
      await runOrdersAction(approveOrders, s.colleague.id, ordersOf(await ticked([fourth.id]))),
    );
    const cash = { [o142.id]: "520000", [o143.id]: "100000", [o144.id]: "30000" };
    const firstKey = randomUUID();
    expect(
      await runOrdersAction(approveOrders, s.finance.id, { ...ordersOf(stale, firstKey), cash }),
    ).toMatchObject({ ok: false, error: { orders: [{ orderId: fourth.id }] } });
    expect(
      await db.select().from(orderActions).where(eq(orderActions.clientKey, firstKey)),
    ).toEqual([]);

    // Approved again without it.
    expectOk(
      await runOrdersAction(approveOrders, s.finance.id, {
        ...ordersOf(await ticked([o142.id, o143.id, o144.id])),
        cash,
      }),
    );
    const given = await db
      .select({ orderId: moneyRows.orderId, amount: moneyRows.amount })
      .from(moneyRows)
      .where(
        and(
          inArray(moneyRows.orderId, [o142.id, o143.id, o144.id, fourth.id]),
          eq(moneyRows.kind, "CASH_GIVEN"),
        ),
      );
    expect(Object.fromEntries(given.map((row) => [row.orderId, row.amount]))).toEqual({
      [o142.id]: 520_000n,
      [o143.id]: 100_000n,
      [o144.id]: 30_000n,
    });

    await buy(s, [
      { order: o142, unitPrice: "4500" },
      { order: o143, qty: "50", unitPrice: "2600", extra: null },
      { order: o144, qty: "10", unitPrice: "3000", extra: null },
    ]);
    expectOk(
      await runOrdersAction(closeExactOrders, s.manager.id, ordersOf(await ticked([o144.id]))),
    );
    await toSettlement(s, [o142, o143]);

    const shown = await settlementOf(s, [o142, o143]);
    expect(shown.map((order) => order.prefill)).toEqual([
      { orderId: o142.id, kind: "CASH_RETURNED", amount: 50_000n },
      { orderId: o143.id, kind: "PAID_BACK", amount: 30_000n },
    ]);
    // 30% over on 0143, but only 30 000 so'm: no Head step.
    await expectNotReady(s, [o142, o143], [o142, o143]);
    const settled = await settle(s, {
      [o142.id]: receive("50000"),
      [o143.id]: pay("30000"),
    });
    expect(settled.orders).toHaveLength(2);
    await expectClosed(s, [o142, o143]);
  });
});

describe("the endings of S10 and S16: Finance closes what the Manager could not (15 S10, S16)", () => {
  it("S16: the right to close alone off, an exact match sent to settlement: Finance closes it", async () => {
    const s = await scene();
    expect(
      await runAction(switchManagerRight, s.head.id, {
        id: s.manager.id,
        right: "CLOSE_ALONE",
        enabled: false,
      }),
    ).toMatchObject({ ok: true });
    const order = await opened(s);
    await buy(s, [{ order }]);
    await toSettlement(s, [order]);
    const summary = await tickedSummary(s.finance.id, [order.id]);
    expect(summary.actions).toContain("CLOSE");
    await expectClosed(s, [order]);
  });

  it("S10: black pens bought for blue at the same price, sent to settlement: Finance closes it", async () => {
    const s = await scene();
    const pens = await insertProduct();
    const [blue, black] = await insertSubtypes(pens.id, [{ name: "Ko'k" }, { name: "Qora" }]);
    const order = await opened(s, { variantId: blue! });
    await buy(s, [{ order, variantId: black!, comment: "Ko'k qolmagan" }]);
    expect((await getOrderPage(s.manager.id, order.id))?.substituted).toBe(true);
    await toSettlement(s, [order]);
    await expectClosed(s, [order]);
  });
});

describe("readiness and all or nothing (08 Closing 3; 06 rule 8)", () => {
  it("one ready and one not-ready order ticked: nothing closes and only the not-ready one is named", async () => {
    const s = await scene();
    const ready = await opened(s);
    const held = await opened(s);
    await buy(s, [{ order: ready }, { order: held, unitPrice: "4500" }]);
    await toSettlement(s, [ready, held]);
    await expectNotReady(s, [ready, held], [held]);
    // The ready one alone closes: the refusal named the right order.
    await expectClosed(s, [ready]);
  });

  it("a transfer confirmed while it matched is not ready once the amounts differ without a note; a note makes it ready", async () => {
    const s = await scene();
    const order = await opened(s, { paymentType: "TRANSFER", extra: 0n });
    const action = (await insertMoneyAction({ managerId: s.manager.id, createdBy: s.finance.id }))
      .rows[0]!.id;
    expect(
      (
        await insertMoneyRow({
          moneyActionId: action,
          orderId: order.id,
          kind: "BANK_TRANSFER",
          amount: "500000",
        })
      ).rows,
    ).toHaveLength(1);
    await buy(s, [{ order, extra: null }], "TRANSFER");
    await toSettlement(s, [order]);
    await expectNotReady(s, [order], [order]);
    await confirm(s, "TRANSFER", [order]);
    // Ready now; then a second transfer of 20 000 makes transferred and received differ.
    const more = (await insertMoneyAction({ managerId: s.manager.id, createdBy: s.finance.id }))
      .rows[0]!.id;
    await insertMoneyRow({
      moneyActionId: more,
      orderId: order.id,
      kind: "BANK_TRANSFER",
      amount: "20000",
    });
    await expectNotReady(s, [order], [order]);
    await confirm(s, "TRANSFER", [order], { [order.id]: "The supplier owes a refund of 20 000" });
    await expectClosed(s, [order]);
  });

  it("S12's readiness: above the guard at 50 000 the order waits for the Head's acknowledgment; at 100 000 it closes without it (review correction 2)", async () => {
    const s = await scene();
    // Planned 520 000, actual 600 000: 80 000 and about 15% over.
    const tight = await opened(s);
    const loose = await opened(s);
    await buy(s, [
      { order: tight, unitPrice: "5800" },
      { order: loose, unitPrice: "5800" },
    ]);
    await toSettlement(s, [tight, loose]);
    await settle(s, { [tight.id]: pay("80000"), [loose.id]: pay("80000") });
    // At the default 100 000 the Head is not needed.
    await expectClosed(s, [loose]);

    await guardAmount("50000", "2031-06-02T07:00:01Z");
    try {
      await expectNotReady(s, [tight], [tight]);
      await db.execute(sql`
        insert into order_settlements (order_id, overspend_ack_by, overspend_ack_at,
          overspend_ack_comment, created_at)
        values (${tight.id}, ${s.head.id}, ${`${TODAY}T07:00:00Z`}, 'Prices rose this week',
          ${`${TODAY}T07:00:00Z`})`);
      await expectClosed(s, [tight]);
    } finally {
      await guardAmount("100000", "2031-06-02T07:00:02Z");
    }
  });

  it("Close on an Open order is wrong_status; an old version is refused; nothing is saved (06 Allowed moves; rule 7)", async () => {
    const s = await scene();
    const open = await opened(s);
    await buy(s, [{ order: open }]);
    const key = randomUUID();
    expect(await close(s.finance.id, [open], key)).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: open.id, code: "wrong_status" }] },
    });
    expect(await db.select().from(orderActions).where(eq(orderActions.clientKey, key))).toEqual([]);

    await toSettlement(s, [open]);
    const old = [{ id: open.id, version: (await versionOf(open.id)) - 1 }];
    expect(await runOrdersAction(closeOrders, s.finance.id, ordersOf(old))).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: open.id, code: "stale_version" }] },
    });
    // The same browser id twice returns the first result (rule 8).
    const once = randomUUID();
    const first = expectOk(await close(s.finance.id, [open], once));
    const again = await runOrdersAction(closeOrders, s.finance.id, ordersOf(old, once));
    expect(expectOk(again)).toEqual(first);
  });
});

describe('who is told (10 Notifications, "Closed, reopened"; .claude/rules/server-actions.md)', () => {
  /** The REQUEST_CLOSED notices about the scenes' branches that went to the scenes' own people. */
  async function toldIn(scenes: readonly Scene[]) {
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
          eq(notifications.type, "REQUEST_CLOSED"),
          inArray(sql<string>`${notifications.params} ->> 'branch'`, codes),
        ),
      );
    return told.filter((notice) => people.has(notice.userId));
  }

  it("orders of two branches in one Close: one notice per branch to its owner, the Heads and its other Finance user, never the actor", async () => {
    const a = await scene();
    const b = await scene();
    // One Finance user of both branches closes; each branch keeps its own colleague.
    const both = await insertUser("FINANCE", { branches: [a.branch.id, b.branch.id] });
    const inA = await opened(a);
    const inB = await opened(b);
    await buy(a, [{ order: inA }]);
    await buy(b, [{ order: inB }]);
    await toSettlement(a, [inA]);
    await toSettlement(b, [inB]);
    expectOk(await close(both.id, [inA, inB]));

    const told = await toldIn([a, b]);
    const of = (scene: Scene) =>
      told
        .filter((notice) => (notice.params as { branch: string }).branch === scene.branch.code)
        .map((notice) => notice.userId)
        .sort();
    for (const each of [a, b]) {
      expect(of(each)).toEqual(
        [each.manager.id, each.finance.id, each.colleague.id, a.head.id, b.head.id].sort(),
      );
    }
    for (const notice of told) expect(notice.params).toMatchObject({ count: 1 });
    expect(told.some((notice) => notice.userId === both.id)).toBe(false);
  });
});
