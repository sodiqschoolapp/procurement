import { randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getOrderPage } from "@/features/orders/queries/order-page";
import { tickedSummary } from "@/features/orders/queries/order-list";
import { cancelMoney } from "@/features/money/actions/cancel-money";
import { recordMoney } from "@/features/money/actions/record-money";
import { recordPurchase } from "@/features/purchasing/actions/record-purchase";
import { switchManagerRight } from "@/features/users/actions/manager-rights";
import { runAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";
import { db } from "@/server/db/client";
import {
  branches,
  notifications,
  orderActions,
  orderEvents,
  orders,
  stockBalances,
} from "@/server/db/schema";
import { type OrdersResult, runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertProduct, insertSubtypes } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import {
  insertExtraCostType,
  insertOrder,
  insertOrderExtra,
} from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { exactMatchOf } from "../exact-match";
import { approveOrders } from "./approve";
import { closeExactOrders } from "./close-exact";
import { sendToSettlementOrders } from "./send-to-settlement";
import { submitDrafts } from "./submit";

// Close on an exact match, build plan 4.4 (Done when: S1 as a test; S16 and S10 up to the point
// where the order goes to Finance; ticking an exact match and an order with a difference offers
// "Close" for neither) and the plan's Tests: 08-money-and-settlement.md (Exact match; Closing 1;
// Worked example), 06-approval-workflow.md (Allowed moves: the two rows from Open; rule 8),
// 07-purchasing.md (Finishing; Substitution; One trip, many orders), 03-roles-and-permissions.md
// (Manager rights: CLOSE_ALONE), 10-notifications-analytics-reports.md (Notifications: "Sent to
// settlement"; "Closed, reopened"), 15 S1, S10, S16, developer-rules.md rules 8 and 9, and the
// review of the plan. Every order goes through the real actions from Draft to Open; every fixture
// is asserted (D38); every passing case has the refused data beside it (D40). The permission rows
// are close-exact-matrix.db.test.ts.

const TODAY = "2031-04-01";

function expectOk(result: ActionResult<unknown>) {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: OrdersResult }).data;
}

/** A branch with a Manager, a Principal, a Finance user, and a Head of all branches. */
async function scene() {
  setClock(`${TODAY}T07:00:00Z`);
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
  const finance = await insertUser("FINANCE", { branches: [branch.id] });
  const head = await insertUser("HEAD");
  return { branch, manager, principal, finance, head };
}

type Scene = Awaited<ReturnType<typeof scene>>;

async function versionOf(id: string): Promise<number> {
  const [row] = await db.select({ version: orders.version }).from(orders).where(eq(orders.id, id));
  return row!.version;
}

async function ticked(ids: readonly string[]) {
  return Promise.all(ids.map(async (id) => ({ id, version: await versionOf(id) })));
}

/**
 * An order of the scene's Manager (08 Worked example: 100 notebooks × 5 000 in cash, plus 20 000
 * delivery unless `extra` is 0), submitted, approved by the Head, the Principal and Finance, who
 * gives `cash` (the planned 520 000 unless given).
 */
async function opened(
  s: Scene,
  options: {
    qty?: string;
    price?: bigint;
    extra?: bigint;
    cash?: string;
    variantId?: string;
    paymentType?: "CASH" | "CARD";
  } = {},
) {
  const draft = await insertOrder({
    branchId: s.branch.id,
    ownerId: s.manager.id,
    variantId: options.variantId,
    plannedQty: options.qty ?? "100",
    plannedPrice: options.price ?? 5_000n,
    paymentType: options.paymentType ?? "CASH",
    neededBy: "2031-05-01",
  });
  const extra = options.extra ?? 20_000n;
  if (extra > 0n) await insertOrderExtra(draft.id, extra);
  const id = draft.id;
  expectOk(await runOrdersAction(submitDrafts, s.manager.id, ordersOf(await ticked([id]))));
  expectOk(await runOrdersAction(approveOrders, s.head.id, ordersOf(await ticked([id]))));
  expectOk(await runOrdersAction(approveOrders, s.principal.id, ordersOf(await ticked([id]))));
  const cash = options.cash ?? "520000";
  expectOk(
    await runOrdersAction(approveOrders, s.finance.id, {
      ...ordersOf(await ticked([id])),
      ...(cash === "0" ? {} : { cash: { [id]: cash } }),
    }),
  );
  return { id, variantId: draft.variantId };
}

type Opened = Awaited<ReturnType<typeof opened>>;

function ordersOf(
  list: readonly { id: string; version: number }[],
  clientKey: string = randomUUID(),
) {
  return { clientKey, orders: list.map(({ id, version }) => ({ id, version })) };
}

/** One trip of the scene's Manager in cash: each order with its line (07 One trip 1). */
async function buy(
  s: Scene,
  lines: readonly {
    order: Opened;
    qty?: string;
    unitPrice?: string;
    variantId?: string;
    extra?: string | null;
    extraPaymentType?: "CASH" | "CARD";
    comment?: string | null;
  }[],
  paymentType: "CASH" | "CARD" = "CASH",
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
                  paymentType: line.extraPaymentType ?? "CASH",
                },
              ],
        comment: line.comment ?? null,
      })),
    }),
  );
}

function close(userId: string, list: readonly { id: string; version: number }[], key?: string) {
  return runOrdersAction(closeExactOrders, userId, ordersOf(list, key));
}

function toSettlement(userId: string, list: readonly { id: string; version: number }[]) {
  return runOrdersAction(sendToSettlementOrders, userId, ordersOf(list));
}

async function stateOf(ids: readonly string[]) {
  const rows = await db
    .select({
      id: orders.id,
      status: orders.status,
      version: orders.version,
      closedAt: orders.closedAt,
    })
    .from(orders)
    .where(inArray(orders.id, [...ids]));
  return new Map(rows.map((row) => [row.id, row]));
}

/**
 * The notices of one type about the given branches. Every active Head of the database is told of
 * a Close, the Heads of other tests' scenes too: a test reads the users it names.
 */
async function noticesTo(
  type: (typeof notifications.$inferSelect)["type"],
  branchIds: readonly string[],
) {
  return db
    .select({ userId: notifications.userId, params: notifications.params })
    .from(notifications)
    .where(
      and(
        eq(notifications.type, type),
        inArray(
          sql<string>`${notifications.params} ->> 'branch'`,
          (
            await db
              .select({ code: branches.code })
              .from(branches)
              .where(inArray(branches.id, [...branchIds]))
          ).map((row) => row.code),
        ),
      ),
    );
}

async function stockOf(branchId: string, variantId: string) {
  const [row] = await db
    .select({ qty: stockBalances.qty })
    .from(stockBalances)
    .where(and(eq(stockBalances.branchId, branchId), eq(stockBalances.variantId, variantId)));
  return row?.qty ?? null;
}

/** The notices of one type about the scenes' branches that went to the scenes' own people. */
async function toldIn(type: (typeof notifications.$inferSelect)["type"], scenes: readonly Scene[]) {
  const people = new Set(
    scenes.flatMap((each) => [each.manager.id, each.principal.id, each.finance.id, each.head.id]),
  );
  const told = await noticesTo(
    type,
    scenes.map((each) => each.branch.id),
  );
  return told.filter((notice) => people.has(notice.userId));
}

/** A refused Close saved nothing: no action row, no Close event, the orders as they were. */
async function nothingClosed(
  clientKey: string,
  list: readonly { id: string; version: number }[],
  branchId: string,
) {
  expect(await db.select().from(orderActions).where(eq(orderActions.clientKey, clientKey))).toEqual(
    [],
  );
  const events = await db
    .select()
    .from(orderEvents)
    .where(
      and(
        inArray(
          orderEvents.orderId,
          list.map((order) => order.id),
        ),
        eq(orderEvents.type, "CLOSE_EXACT"),
      ),
    );
  expect(events).toEqual([]);
  const states = await stateOf(list.map((order) => order.id));
  for (const order of list) {
    expect(states.get(order.id)).toMatchObject({
      status: "PURCHASING",
      version: order.version,
      closedAt: null,
    });
  }
  expect(await noticesTo("REQUEST_CLOSED", [branchId])).toEqual([]);
}

describe("S1: an exact match closes by the Manager alone (15 S1; 08 Exact match; Closing 1)", () => {
  it("three approvals, 520 000 given, bought as planned: all green, count 0, stock +100, Closed", async () => {
    const s = await scene();
    const order = await opened(s);
    await buy(s, [{ order }]);
    expect(await stockOf(s.branch.id, order.variantId)).toBe("100.000");

    const summary = await tickedSummary(s.manager.id, [order.id]);
    expect(summary.colours).toMatchObject({
      number: { colour: "green" },
      price: { colour: "green" },
      total: { colour: "green" },
    });
    expect(summary.exactCount).toBe(1);
    expect(summary.actions).toContain("CLOSE_EXACT");
    expect(summary.actions).toContain("SEND_TO_SETTLEMENT");
    const page = await getOrderPage(s.manager.id, order.id);
    expect(page?.actions).toContain("CLOSE_EXACT");

    setClock(`${TODAY}T09:30:00Z`);
    const result = expectOk(await close(s.manager.id, await ticked([order.id])));
    expect(result.orders).toEqual([{ id: order.id, status: "CLOSED" }]);
    expect((await stateOf([order.id])).get(order.id)).toMatchObject({
      status: "CLOSED",
      closedAt: new Date(`${TODAY}T09:30:00Z`),
    });
    const events = await db
      .select({ type: orderEvents.type, from: orderEvents.fromStatus, to: orderEvents.toStatus })
      .from(orderEvents)
      .where(and(eq(orderEvents.orderId, order.id), eq(orderEvents.type, "CLOSE_EXACT")));
    expect(events).toEqual([{ type: "CLOSE_EXACT", from: "PURCHASING", to: "CLOSED" }]);
    // 10 Notifications, "Closed, reopened": the Head and Finance, one each; never the actor.
    const told = await toldIn("REQUEST_CLOSED", [s]);
    expect(told.map((notice) => notice.userId).sort()).toEqual([s.finance.id, s.head.id].sort());
    expect(told[0]?.params).toMatchObject({ count: 1, branch: s.branch.code });
    // Stock stays as the purchase left it (Close moves no stock).
    expect(await stockOf(s.branch.id, order.variantId)).toBe("100.000");
  });

  it("the same client key twice returns the first result; an old version is refused (rules 8, 9)", async () => {
    const s = await scene();
    const first = await opened(s);
    const second = await opened(s);
    await buy(s, [{ order: first }, { order: second }]);
    const list = await ticked([first.id]);
    const key = randomUUID();
    const done = expectOk(await close(s.manager.id, list, key));
    expect(expectOk(await close(s.manager.id, list, key))).toEqual(done);
    expect(await toldIn("REQUEST_CLOSED", [s])).toHaveLength(2);

    const stale = [{ id: second.id, version: (await versionOf(second.id)) - 1 }];
    expect(await close(s.manager.id, stale)).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: second.id, code: "stale_version" }] },
    });
  });
});

describe("Close needs every condition of 08 Exact match (plan of 4.4, Tests)", () => {
  it("an exact match and an order with a difference ticked together: Close for neither, refused whole", async () => {
    const s = await scene();
    const exact = await opened(s);
    const cheaper = await opened(s);
    await buy(s, [
      { order: exact },
      { order: cheaper, unitPrice: "4500", comment: "Arzonroq topildi" },
    ]);
    const both = await ticked([exact.id, cheaper.id]);

    const summary = await tickedSummary(s.manager.id, [exact.id, cheaper.id]);
    expect(summary.actions).not.toContain("CLOSE_EXACT");
    expect(summary.actions).toContain("SEND_TO_SETTLEMENT");
    expect(summary.exactCount).toBe(1);
    expect((await tickedSummary(s.manager.id, [exact.id])).actions).toContain("CLOSE_EXACT");

    const key = randomUUID();
    expect(await close(s.manager.id, both, key)).toMatchObject({
      ok: false,
      error: { code: "not_ready", orders: [{ orderId: cheaper.id, code: "not_ready" }] },
    });
    await nothingClosed(key, both, s.branch.id);
  });

  it("exactMatchOf() answers per order beside another order of the same trip (D40; 07 One trip)", async () => {
    const s = await scene();
    const exact = await opened(s);
    const cheaper = await opened(s);
    await buy(s, [
      { order: exact },
      { order: cheaper, unitPrice: "4500", comment: "Arzonroq topildi" },
    ]);
    const answer = await exactMatchOf(db, [exact.id, cheaper.id]);
    expect(Object.fromEntries(answer)).toEqual({ [exact.id]: true, [cheaper.id]: false });
    expectOk(await close(s.manager.id, await ticked([exact.id])));
    expect((await stateOf([exact.id, cheaper.id])).get(cheaper.id)?.status).toBe("PURCHASING");
  });

  // Each with Number and Price green and the rest matching but the one condition named.
  const NOT_EXACT: {
    name: string;
    cash?: string;
    line: Partial<Parameters<typeof buy>[1][number]>;
  }[] = [
    {
      // 08 Exact match: "the price 10 000 lower, the extra costs 10 000 higher" is not a match.
      name: "differences that cancel out: actual extra 30 000 against 20 000 planned",
      cash: "530000",
      line: { extra: "30000" },
    },
    {
      name: "an extra paid by card on a cash order (the payment type is not the planned one)",
      cash: "500000",
      line: { extraPaymentType: "CARD" },
    },
    { name: "a cash count of +50 000 (570 000 given for 520 000 spent)", cash: "570000", line: {} },
  ];
  for (const each of NOT_EXACT) {
    it(`not an exact match: ${each.name}`, async () => {
      const s = await scene();
      const order = await opened(s, { cash: each.cash });
      await buy(s, [{ order, ...each.line }]);
      const summary = await tickedSummary(s.manager.id, [order.id]);
      expect(summary.colours).toMatchObject({
        number: { colour: "green" },
        price: { colour: "green" },
      });
      expect(summary.actions).not.toContain("CLOSE_EXACT");
      const list = await ticked([order.id]);
      const key = randomUUID();
      expect(await close(s.manager.id, list, key)).toMatchObject({
        ok: false,
        error: { orders: [{ orderId: order.id, code: "not_ready" }] },
      });
      await nothingClosed(key, list, s.branch.id);
    });
  }

  it("buying not finished: neither move is offered, Close refused (07 Finishing)", async () => {
    const s = await scene();
    const order = await opened(s, { cash: "320000" });
    await buy(s, [{ order, qty: "60" }]);
    const summary = await tickedSummary(s.manager.id, [order.id]);
    expect(summary.actions).not.toContain("CLOSE_EXACT");
    expect(summary.actions).not.toContain("SEND_TO_SETTLEMENT");
    expect(summary.exactCount).toBeNull();
    const list = await ticked([order.id]);
    const key = randomUUID();
    expect(await close(s.manager.id, list, key)).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: order.id, code: "not_ready" }] },
    });
    await nothingClosed(key, list, s.branch.id);
  });

  it("a cancelled money action is left out of the count: cash given again, count 0, Closed (08 Order's cash count)", async () => {
    const s = await scene();
    const order = await opened(s, { cash: "0" });
    await buy(s, [{ order }]);
    const give = async (amount: string) =>
      runOrdersAction(recordMoney, s.finance.id, {
        ...ordersOf(await ticked([order.id])),
        kind: "CASH_GIVEN",
        occurredOn: TODAY,
        fileId: null,
        comment: "Invented comment",
        amounts: { [order.id]: amount },
      });
    const wrong = await give("520000");
    expect(wrong).toMatchObject({ ok: true });
    const [action] = await db
      .execute<{ id: string }>(
        sql`select a.id from money_actions a join money_rows r on r.money_action_id = a.id
          where r.order_id = ${order.id}`,
      )
      .then((found) => found.rows);
    expectOk(
      await runOrdersAction(cancelMoney, s.finance.id, {
        ...ordersOf(await ticked([order.id])),
        moneyActionId: action!.id,
        reason: "Invented: typed twice",
      }),
    );
    expect(Object.fromEntries(await exactMatchOf(db, [order.id]))).toEqual({ [order.id]: false });
    expect(await give("520000")).toMatchObject({ ok: true });
    expect(Object.fromEntries(await exactMatchOf(db, [order.id]))).toEqual({ [order.id]: true });
    expectOk(await close(s.manager.id, await ticked([order.id])));
  });
});

describe("S16: the right to close alone switched off (15 S16; 03 CLOSE_ALONE; 08 Closing 1)", () => {
  it("the Manager has no Close; Send to settlement takes the order to Finance, who is told", async () => {
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
    // Every label green and the count 0: an exact match all the same.
    expect(Object.fromEntries(await exactMatchOf(db, [order.id]))).toEqual({ [order.id]: true });

    const summary = await tickedSummary(s.manager.id, [order.id]);
    expect(summary.actions).not.toContain("CLOSE_EXACT");
    expect(summary.actions).toContain("SEND_TO_SETTLEMENT");
    const list = await ticked([order.id]);
    const key = randomUUID();
    expect(await close(s.manager.id, list, key)).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: order.id, code: "forbidden" }] },
    });
    await nothingClosed(key, list, s.branch.id);

    expect(expectOk(await toSettlement(s.manager.id, list)).orders).toEqual([
      { id: order.id, status: "SETTLEMENT" },
    ]);
    // Nobody else at all: no Head, not the owner.
    const told = await noticesTo("REQUEST_SENT_TO_SETTLEMENT", [s.branch.id]);
    expect(told.map((notice) => notice.userId)).toEqual([s.finance.id]);
    expect(told[0]?.params).toMatchObject({ count: 1, branch: s.branch.code });
  });

  it("the Head ticking that Manager's exact match: no Close, refused not_ready; Send to settlement offered (decided item 2)", async () => {
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
    const summary = await tickedSummary(s.head.id, [order.id]);
    expect(summary.actions).not.toContain("CLOSE_EXACT");
    expect(summary.actions).toContain("SEND_TO_SETTLEMENT");
    const list = await ticked([order.id]);
    const key = randomUUID();
    expect(await close(s.head.id, list, key)).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: order.id, code: "not_ready" }] },
    });
    await nothingClosed(key, list, s.branch.id);
  });
});

describe("S10: a substitution goes to Finance (15 S10; 07 Substitution; 08 Exact match)", () => {
  it("black pens bought for blue at the same price: stock for black, Substituted, no Close, to settlement", async () => {
    const s = await scene();
    const pens = await insertProduct();
    const [blue, black] = await insertSubtypes(pens.id, [{ name: "Ko'k" }, { name: "Qora" }]);
    const order = await opened(s, { variantId: blue! });
    await buy(s, [{ order, variantId: black!, comment: "Ko'k qolmagan" }]);
    expect(await stockOf(s.branch.id, black!)).toBe("100.000");
    expect(await stockOf(s.branch.id, blue!)).toBeNull();
    expect((await getOrderPage(s.manager.id, order.id))?.substituted).toBe(true);

    const summary = await tickedSummary(s.manager.id, [order.id]);
    expect(summary.colours).toMatchObject({
      number: { colour: "green" },
      price: { colour: "green" },
    });
    expect(summary.actions).not.toContain("CLOSE_EXACT");
    const list = await ticked([order.id]);
    const key = randomUUID();
    expect(await close(s.manager.id, list, key)).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: order.id, code: "not_ready" }] },
    });
    await nothingClosed(key, list, s.branch.id);
    expect(expectOk(await toSettlement(s.manager.id, list)).orders).toEqual([
      { id: order.id, status: "SETTLEMENT" },
    ]);
  });
});

describe("Close by the Head and the notices per branch (10 Notifications; .claude/rules)", () => {
  it("the Head closes a Manager's exact match: the owner and Finance are told, not the Head", async () => {
    const s = await scene();
    const order = await opened(s);
    await buy(s, [{ order }]);
    expectOk(await close(s.head.id, await ticked([order.id])));
    const told = await toldIn("REQUEST_CLOSED", [s]);
    expect(told.map((notice) => notice.userId).sort()).toEqual([s.manager.id, s.finance.id].sort());
  });

  it("orders of two branches in one Close: one notice per branch, each to its own Finance and owner", async () => {
    const a = await scene();
    const b = await scene();
    const head = a.head;
    const inA = await opened(a);
    const inB = await opened({ ...b, head });
    await buy(a, [{ order: inA }]);
    await buy(b, [{ order: inB }]);
    expectOk(await close(head.id, await ticked([inA.id, inB.id])));
    const told = await toldIn("REQUEST_CLOSED", [a, b]);
    const byUser = new Map(told.map((notice) => [notice.userId, notice.params]));
    expect(byUser.get(a.finance.id)).toMatchObject({ count: 1, branch: a.branch.code });
    expect(byUser.get(a.manager.id)).toMatchObject({ count: 1, branch: a.branch.code });
    expect(byUser.get(b.finance.id)).toMatchObject({ count: 1, branch: b.branch.code });
    expect(byUser.get(b.manager.id)).toMatchObject({ count: 1, branch: b.branch.code });
    // The other Head of scene b is told of both branches.
    expect(told.filter((notice) => notice.userId === b.head.id)).toHaveLength(2);
    expect(told.filter((notice) => notice.userId === head.id)).toEqual([]);
    expect(told).toHaveLength(6);
  });

  it("Send to settlement on two branches: each branch's Finance only, nobody else", async () => {
    const a = await scene();
    const b = await scene();
    const inA = await opened(a);
    const inB = await opened({ ...b, head: a.head });
    await buy(a, [{ order: inA, unitPrice: "4500", comment: "Arzonroq topildi" }]);
    await buy(b, [{ order: inB, unitPrice: "4500", comment: "Arzonroq topildi" }]);
    expectOk(await toSettlement(a.head.id, await ticked([inA.id, inB.id])));
    const told = await noticesTo("REQUEST_SENT_TO_SETTLEMENT", [a.branch.id, b.branch.id]);
    expect(
      told.map((notice) => [notice.userId, (notice.params as { branch: string }).branch]).sort(),
    ).toEqual(
      [
        [a.finance.id, a.branch.code],
        [b.finance.id, b.branch.code],
      ].sort(),
    );
  });
});
