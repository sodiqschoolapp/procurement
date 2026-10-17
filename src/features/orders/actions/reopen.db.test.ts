import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { overspendNeedsAck } from "@/domain/money-ledger";
import { acknowledgeOverspend } from "@/features/money/actions/acknowledge-overspend";
import { cancelMoney } from "@/features/money/actions/cancel-money";
import { confirmSettlement } from "@/features/money/actions/confirm-settlement";
import { recordMoney } from "@/features/money/actions/record-money";
import { getOrderMoney } from "@/features/money/queries/order-money";
import { settlementFactsOf } from "@/features/money/settlement-facts";
import { cancelPurchase } from "@/features/purchasing/actions/cancel-purchase";
import { recordPurchase } from "@/features/purchasing/actions/record-purchase";
import type { ActionResult } from "@/server/action-result";
import { db } from "@/server/db/client";
import {
  moneyActions,
  orderActions,
  orderEvents,
  orderExtras,
  orderSettlements,
  orders,
  purchases,
} from "@/server/db/schema";
import { type OrdersResult, runOrdersAction } from "@/server/order-action";
import { readSettings } from "@/server/settings";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import {
  REASON,
  eventsOf,
  moveScene,
  noticeCount,
  noticesOf,
  nothingSaved,
  ordersAt,
  statusesOf,
  tickedInput,
} from "../../../../tests/helpers/moves";
import {
  insertExtraCostType,
  insertOrder,
  insertOrderExtra,
} from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { approveOrders } from "./approve";
import { closeOrders } from "./close";
import { reopenOrders } from "./reopen";
import { sendToSettlementOrders } from "./send-to-settlement";
import { submitDrafts } from "./submit";

// Reopen, build plan 4.8 (Done when: "reopen, cancel one record, and the order needs settlement
// again with the old confirmations gone") and the plan's Tests: 06-approval-workflow.md (Allowed
// moves: "Closed | Reopen | Head | Open | Reason. Settlement confirmations and the overspend
// acknowledgment are cleared"; rules 3, 6, 7, 8), 08 (Overspend guard, last sentence; Money
// ledger: "the Head reopens that order first"), edge cases "An error is found after closing" and
// "A money action must be cancelled but one of its orders is already Closed", 07 Fixing a mistake
// (fourth bullet), 10 Notifications ("Closed, reopened"), developer-rules.md rules 8 and 9, and
// the review of the plan (corrections 1 and 2). Every fixture is asserted (D38); every passing
// case has the refused data beside it (D40). The permission rows are reopen-matrix.db.test.ts.

const TODAY = "2031-06-02";
const MOMENT = `${TODAY}T07:00:00.000Z`;

function expectOk(result: ActionResult<unknown>) {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: OrdersResult }).data;
}

function reopen(userId: string, input: unknown) {
  return runOrdersAction(reopenOrders, userId, input);
}

async function versionOf(id: string): Promise<number> {
  const [row] = await db.select({ version: orders.version }).from(orders).where(eq(orders.id, id));
  return row!.version;
}

async function ticked(ids: readonly string[], clientKey: string = randomUUID()) {
  return {
    clientKey,
    orders: await Promise.all(ids.map(async (id) => ({ id, version: await versionOf(id) }))),
  };
}

/** A branch with a Manager, a Principal, two Finance users, and two Heads of all branches. */
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

/**
 * An order of 08 Worked example (100 × 5 000 plus 20 000 delivery, cash), through the three
 * approvals; Finance gives the planned 520 000 in cash.
 */
async function opened(s: Scene) {
  const draft = await insertOrder({
    branchId: s.branch.id,
    ownerId: s.manager.id,
    plannedQty: "100",
    plannedPrice: 5_000n,
    paymentType: "CASH",
    neededBy: "2031-07-01",
  });
  await insertOrderExtra(draft.id, 20_000n);
  expectOk(await runOrdersAction(submitDrafts, s.manager.id, await ticked([draft.id])));
  expectOk(await runOrdersAction(approveOrders, s.head.id, await ticked([draft.id])));
  expectOk(await runOrdersAction(approveOrders, s.principal.id, await ticked([draft.id])));
  expectOk(
    await runOrdersAction(approveOrders, s.finance.id, {
      ...(await ticked([draft.id])),
      cash: { [draft.id]: "520000" },
    }),
  );
  return draft;
}

type Order = Awaited<ReturnType<typeof opened>>;

/** One trip of the Manager with one line for the order, at the planned price. */
async function buy(
  s: Scene,
  order: Order,
  line: { qty: string; extra?: string; comment?: string },
  paymentType: "CASH" | "TRANSFER",
) {
  const delivery = await insertExtraCostType();
  expectOk(
    await runOrdersAction(recordPurchase, s.manager.id, {
      ...(await ticked([order.id])),
      purchasedOn: TODAY,
      paymentType,
      supplierId: null,
      receiptFileIds: [],
      lines: [
        {
          orderId: order.id,
          variantId: order.variantId,
          qty: line.qty,
          unitPrice: "5000",
          extras: line.extra
            ? [{ extraCostTypeId: delivery.id, amount: line.extra, paymentType }]
            : [],
          // The planned extra comes on the cash trip only, so each line differs from the plan and
          // needs a comment (07 Recording a purchase).
          comment: line.comment ?? "Invented: part of the order",
        },
      ],
    }),
  );
}

async function confirmTransfer(s: Scene, order: Order) {
  expectOk(
    await runOrdersAction(confirmSettlement, s.finance.id, {
      ...(await ticked([order.id])),
      block: "TRANSFER",
      confirmed: true,
      notes: { [order.id]: "Invented: the shop sent more than planned" },
    }),
  );
}

async function acknowledge(s: Scene, order: Order) {
  expectOk(
    await runOrdersAction(acknowledgeOverspend, s.head.id, {
      ...(await ticked([order.id])),
      reason: "Invented: more were needed",
    }),
  );
}

async function toSettlement(s: Scene, order: Order) {
  const moved = expectOk(
    await runOrdersAction(sendToSettlementOrders, s.manager.id, await ticked([order.id])),
  );
  expect(moved.orders).toEqual([{ id: order.id, status: "SETTLEMENT" }]);
}

function close(s: Scene, order: Order) {
  return ticked([order.id]).then((input) => runOrdersAction(closeOrders, s.finance.id, input));
}

/** The order's plan as stored: frozen once Open (06 rule 6; CLAUDE.md rule 12). */
async function planOf(orderId: string) {
  const [plan] = await db
    .select({
      variantId: orders.variantId,
      plannedQty: orders.plannedQty,
      plannedPrice: orders.plannedPrice,
      plannedTotal: orders.plannedTotal,
      paymentType: orders.paymentType,
      neededBy: orders.neededBy,
    })
    .from(orders)
    .where(eq(orders.id, orderId));
  const extras = await db
    .select({ id: orderExtras.id, amount: orderExtras.amount })
    .from(orderExtras)
    .where(eq(orderExtras.orderId, orderId));
  return { plan, extras };
}

async function settlementRowOf(orderId: string) {
  return db.select().from(orderSettlements).where(eq(orderSettlements.orderId, orderId));
}

const CLEARED = {
  transferConfirmedBy: null,
  transferConfirmedAt: null,
  transferNote: null,
  cardConfirmedBy: null,
  cardConfirmedAt: null,
  overspendAckBy: null,
  overspendAckAt: null,
  overspendAckComment: null,
};

/** Both guard settings for the body, restored to 10 % and 100 000 after (08 Overspend guard). */
async function withGuard(guard: { percent: number; amount: string }, body: () => Promise<void>) {
  async function put(key: string, value: string | number) {
    await db.execute(
      sql`insert into settings (key, value, created_at)
          values (${key}, ${JSON.stringify(value)}::jsonb, ${`${TODAY}T06:00:00Z`})
          on conflict (key) do update set value = excluded.value`,
    );
  }
  await put("overspend_guard_percent", guard.percent);
  await put("overspend_guard_min_amount", guard.amount);
  try {
    await body();
  } finally {
    await put("overspend_guard_percent", 10);
    await put("overspend_guard_min_amount", "100000");
  }
}

describe("Done when: reopen, cancel one record, and the order needs settlement again (edge case 'An error is found after closing')", () => {
  it("the Head reopens a Closed order; a record is cancelled; Finance's Close is not ready until the confirmation and the acknowledgment are given again", async () => {
    const s = await scene();
    // Every overspend needs the Head (08 Overspend guard: both settings at 0).
    await withGuard({ percent: 0, amount: "0" }, async () => {
      const order = await opened(s);
      // Two bank-transfer trips over the plan, then the planned cash trip: 115 received of 100,
      // actual 595 000 against a plan of 520 000; cash spent 520 000 of 520 000 given.
      await buy(s, order, { qty: "10" }, "TRANSFER");
      await buy(s, order, { qty: "5" }, "TRANSFER");
      await buy(
        s,
        order,
        { qty: "100", extra: "20000", comment: "Invented: more than planned" },
        "CASH",
      );
      await toSettlement(s, order);
      await acknowledge(s, order);
      await confirmTransfer(s, order);
      expect((await close(s, order)).ok).toBe(true);
      const plan = await planOf(order.id);

      const [wrong] = await db
        .select({ id: purchases.id })
        .from(purchases)
        .where(and(eq(purchases.orderId, order.id), eq(purchases.qty, "5.000")));
      expect(wrong).toBeDefined();
      const cancelInput = async () => ({
        ...(await ticked([order.id])),
        purchaseId: wrong!.id,
        reason: "Invented: five were faulty",
      });
      // 07 Fixing a mistake, fourth bullet: Closed, no correction before the reopen (D40).
      expect(
        await runOrdersAction(cancelPurchase, s.manager.id, await cancelInput()),
      ).toMatchObject({
        ok: false,
        error: { orders: [{ orderId: order.id, code: "wrong_status" }] },
      });

      const version = await versionOf(order.id);
      const done = expectOk(
        await reopen(s.head.id, { ...(await ticked([order.id])), reason: `  ${REASON}  ` }),
      );
      expect(done.orders).toEqual([{ id: order.id, status: "PURCHASING" }]);
      const [row] = await db
        .select({
          status: orders.status,
          version: orders.version,
          closedAt: orders.closedAt,
          progress: orders.progress,
        })
        .from(orders)
        .where(eq(orders.id, order.id));
      // Decided items 1 and 3 (Look first): Open, `closed_at` cleared, the progress kept.
      expect(row).toEqual({
        status: "PURCHASING",
        version: version + 1,
        closedAt: null,
        progress: "DONE",
      });
      // 06 Closed row; 08 Overspend guard, last sentence (decided item 2, Look first).
      expect(await settlementRowOf(order.id)).toEqual([expect.objectContaining(CLEARED)]);
      const [event] = await db
        .select({
          from: orderEvents.fromStatus,
          to: orderEvents.toStatus,
          comment: orderEvents.comment,
          actorId: orderEvents.actorId,
          payload: orderEvents.payload,
        })
        .from(orderEvents)
        .where(and(eq(orderEvents.orderId, order.id), eq(orderEvents.type, "REOPEN")));
      expect(event).toEqual({
        from: "CLOSED",
        to: "PURCHASING",
        comment: REASON,
        actorId: s.head.id,
        payload: { settlementCleared: true },
      });
      // 06 rule 6: the plan of an Open order never changes (review of the plan, correction 1).
      expect(await planOf(order.id)).toEqual(plan);

      // The correction: the faulty record is cancelled now that the order is Open.
      expectOk(await runOrdersAction(cancelPurchase, s.manager.id, await cancelInput()));
      expect(await planOf(order.id)).toEqual(plan);
      await toSettlement(s, order);

      // Only the cleared confirmation and acknowledgment can refuse the Close (review of the plan,
      // Must fix 1): buying Done (110 of 100), cash count 0, and still above the guard (570 000).
      const [progress] = await db
        .select({ progress: orders.progress })
        .from(orders)
        .where(eq(orders.id, order.id));
      expect(progress!.progress).toBe("DONE");
      const facts = (await settlementFactsOf(db, [order.id])).get(order.id)!;
      expect(facts.blocks.cash?.count).toBe(0n);
      expect(facts.blocks.transfer).not.toBeNull();
      expect(overspendNeedsAck(facts, await readSettings(db))).toBe(true);
      expect(await close(s, order)).toMatchObject({
        ok: false,
        error: { code: "not_ready", orders: [{ orderId: order.id, code: "not_ready" }] },
      });

      // Finance settles it again: the confirmation and the Head's acknowledgment, then Close.
      await confirmTransfer(s, order);
      expect(await close(s, order)).toMatchObject({ ok: false, error: { code: "not_ready" } });
      await acknowledge(s, order);
      expect(await close(s, order)).toMatchObject({
        ok: true,
        data: { orders: [{ id: order.id, status: "CLOSED" }] },
      });
      const [closed] = await db
        .select({ closedAt: orders.closedAt })
        .from(orders)
        .where(eq(orders.id, order.id));
      expect(closed!.closedAt?.toISOString()).toBe(MOMENT);
    });
  });
});

describe("A money action with a Closed order (edge case; 08 Money ledger: the Head reopens it first)", () => {
  it("the cancel is refused while Closed and passes after the reopen; the cash count follows", async () => {
    const s = await scene();
    const order = await insertOrder({
      branchId: s.branch.id,
      ownerId: s.manager.id,
      status: "PURCHASING",
    });
    const recordKey = randomUUID();
    expectOk(
      await runOrdersAction(recordMoney, s.finance.id, {
        ...(await ticked([order.id], recordKey)),
        kind: "CASH_GIVEN",
        occurredOn: TODAY,
        comment: "Invented money",
        amounts: { [order.id]: "30000" },
      }),
    );
    const [action] = await db
      .select({ id: moneyActions.id })
      .from(moneyActions)
      .where(eq(moneyActions.clientKey, recordKey));
    expect((await getOrderMoney(s.finance.id, order.id))!.count).toBe(30_000n);
    await db
      .update(orders)
      .set({ status: "CLOSED", closedAt: new Date(MOMENT) })
      .where(eq(orders.id, order.id));
    const cancel = async () =>
      runOrdersAction(cancelMoney, s.finance.id, {
        ...(await ticked([order.id])),
        moneyActionId: action!.id,
        reason: "Invented: typed the wrong amount",
      });

    expect(await cancel()).toMatchObject({
      ok: false,
      error: {
        code: "wrong_status",
        orders: [
          {
            orderId: order.id,
            code: "wrong_status",
            fields: { status: "errors.field.closedReopenFirst" },
          },
        ],
      },
    });
    expect((await getOrderMoney(s.finance.id, order.id))!.count).toBe(30_000n);

    expectOk(await reopen(s.head.id, { ...(await ticked([order.id])), reason: REASON }));
    expectOk(await cancel());
    expect((await getOrderMoney(s.finance.id, order.id))!.count).toBe(0n);
  });
});

describe("Reopen (06 Allowed moves, Closed row; rules 3, 7, 8)", () => {
  it("a Closed order with no settlement row (closed as an exact match) reopens; no row is made (review of the plan, correction 2)", async () => {
    setClock(`${TODAY}T07:00:00Z`);
    const { branch, manager, head } = await moveScene();
    const [order] = await ordersAt(branch.id, manager.id, "CLOSED");
    await db
      .update(orders)
      .set({ closedAt: new Date(MOMENT) })
      .where(eq(orders.id, order!.id));
    expect(await reopen(head.id, tickedInput([order!]))).toMatchObject({
      ok: true,
      data: { orders: [{ id: order!.id, status: "PURCHASING" }] },
    });
    const [row] = await db
      .select({ closedAt: orders.closedAt })
      .from(orders)
      .where(eq(orders.id, order!.id));
    expect(row!.closedAt).toBeNull();
    expect(await settlementRowOf(order!.id)).toEqual([]);
    const [event] = await db
      .select({ payload: orderEvents.payload })
      .from(orderEvents)
      .where(eq(orderEvents.orderId, order!.id));
    expect(event!.payload ?? {}).not.toHaveProperty("settlementCleared");
  });

  it("a reason is required, 5 to 500 characters once trimmed; nothing is saved without one (06 rule 3)", async () => {
    const { branch, manager, head } = await moveScene();
    const [order] = await ordersAt(branch.id, manager.id, "CLOSED");
    const notices = await noticeCount();
    for (const [extra, field] of [
      [{}, "errors.field.required"],
      [{ reason: "   " }, "errors.field.required"],
      [{ reason: " abcd " }, "errors.field.tooShort"],
      [{ reason: "a".repeat(501) }, "errors.field.tooLong"],
    ] as const) {
      const sent = tickedInput([order!], extra);
      expect(await reopen(head.id, sent)).toMatchObject({
        ok: false,
        error: { code: "invalid_input", fields: { reason: field } },
      });
      await nothingSaved(sent.clientKey, [order!.id], notices);
    }
    expect(await reopen(head.id, tickedInput([order!], { reason: "abcde" }))).toMatchObject({
      ok: true,
    });
  });

  it("an order in any other status is wrong_status, with a Closed order beside it (06: Closed only)", async () => {
    const { branch, manager, head } = await moveScene();
    for (const status of ["PURCHASING", "SETTLEMENT", "REJECTED", "CANCELLED"] as const) {
      const [closed] = await ordersAt(branch.id, manager.id, "CLOSED");
      const [other] = await ordersAt(branch.id, manager.id, status);
      const notices = await noticeCount();
      const sent = tickedInput([closed!, other!]);
      expect(await reopen(head.id, sent)).toMatchObject({
        ok: false,
        error: { orders: [{ orderId: other!.id, code: "wrong_status" }] },
      });
      await nothingSaved(sent.clientKey, [closed!.id, other!.id], notices);
      const states = await statusesOf([closed!.id, other!.id]);
      expect(states.get(closed!.id)).toMatchObject({ status: "CLOSED", version: 1 });
      expect(states.get(other!.id)).toMatchObject({ status, version: 1 });
    }
  });

  it("three Closed orders reopen in one action, one event each (06 rule 8)", async () => {
    const { branch, manager, head } = await moveScene();
    const three = await ordersAt(branch.id, manager.id, "CLOSED", 3);
    const sent = tickedInput(three);
    expect(await reopen(head.id, sent)).toMatchObject({ ok: true });
    const actions = await db
      .select({ id: orderActions.id })
      .from(orderActions)
      .where(eq(orderActions.clientKey, sent.clientKey));
    expect(actions).toHaveLength(1);
    for (const order of three) {
      expect(await eventsOf(order.id)).toEqual([
        { type: "REOPEN", from: "CLOSED", to: "PURCHASING", comment: REASON, note: null },
      ]);
    }
  });

  it("an old version is stale_version and nothing is saved; the same client key twice gives the first result (rules 7 and 9; developer-rules rule 8)", async () => {
    const { branch, manager, head } = await moveScene();
    const [order] = await ordersAt(branch.id, manager.id, "CLOSED");
    const notices = await noticeCount();
    const stale = tickedInput([{ id: order!.id, version: order!.version + 1 }]);
    expect(await reopen(head.id, stale)).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: order!.id, code: "stale_version" }] },
    });
    await nothingSaved(stale.clientKey, [order!.id], notices);

    const sent = tickedInput([order!]);
    const first = await reopen(head.id, sent);
    expect(first).toMatchObject({ ok: true });
    expect(await reopen(head.id, sent)).toEqual(first);
    expect(await eventsOf(order!.id)).toHaveLength(1);
    expect((await statusesOf([order!.id])).get(order!.id)).toMatchObject({ version: 2 });
  });

  it("the Manager owner, the Principal and Finance are forbidden; another branch's user does not find it (03 Permission matrix)", async () => {
    const { branch, manager, principal, finance, head } = await moveScene();
    const [order] = await ordersAt(branch.id, manager.id, "CLOSED");
    const notices = await noticeCount();
    for (const user of [manager, principal, finance]) {
      const sent = tickedInput([order!]);
      expect(await reopen(user.id, sent)).toMatchObject({
        ok: false,
        error: { orders: [{ orderId: order!.id, code: "forbidden" }] },
      });
      await nothingSaved(sent.clientKey, [order!.id], notices);
    }
    const elsewhere = await insertUser("FINANCE", { branches: [(await insertBranch()).id] });
    const walled = tickedInput([order!]);
    expect(await reopen(elsewhere.id, walled)).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: order!.id, code: "not_found" }] },
    });
    await nothingSaved(walled.clientKey, [order!.id], notices);
    // The Head at the right version passes (D40).
    expect(await reopen(head.id, tickedInput([order!]))).toMatchObject({ ok: true });
  });
});

describe('who is told (10 Notifications, "Closed, reopened"; decided item 4, Look first)', () => {
  it("the owner, every other active Head and the branch's active Finance; never the actor, another branch's Finance or a deactivated user", async () => {
    const { branch, manager, finance, head } = await moveScene();
    const otherHead = await insertUser("HEAD");
    const gone = await insertUser("FINANCE", { branches: [branch.id], isActive: false });
    const elsewhere = await insertUser("FINANCE", { branches: [(await insertBranch()).id] });
    const two = await ordersAt(branch.id, manager.id, "CLOSED", 2);
    expect(await reopen(head.id, tickedInput(two))).toMatchObject({ ok: true });
    const ofBranch = async (userId: string) =>
      (await noticesOf(userId, "REQUEST_REOPENED")).filter(
        (n) => (n.params as { branch: string }).branch === branch.code,
      );
    for (const told of [manager, otherHead, finance]) {
      expect(await ofBranch(told.id)).toEqual([
        { params: expect.objectContaining({ count: 2, branch: branch.code }) },
      ]);
    }
    for (const silent of [head, gone, elsewhere]) expect(await ofBranch(silent.id)).toEqual([]);
  });

  it("orders of two branches: one notice per branch to each owner, the Head and each branch's Finance (.claude/rules/tests.md)", async () => {
    const first = await insertBranch();
    const second = await insertBranch();
    const a = await insertUser("MANAGER", { branches: [first.id] });
    const b = await insertUser("MANAGER", { branches: [second.id] });
    const financeA = await insertUser("FINANCE", { branches: [first.id] });
    const financeB = await insertUser("FINANCE", { branches: [second.id] });
    const actor = await insertUser("HEAD");
    const head = await insertUser("HEAD");
    const [one] = await ordersAt(first.id, a.id, "CLOSED");
    const [two] = await ordersAt(second.id, b.id, "CLOSED");
    expect(await reopen(actor.id, tickedInput([one!, two!]))).toMatchObject({ ok: true });
    const headNotices = (await noticesOf(head.id, "REQUEST_REOPENED")).filter((n) =>
      [first.code, second.code].includes((n.params as { branch: string }).branch),
    );
    expect(headNotices).toHaveLength(2);
    for (const [user, code] of [
      [a, first.code],
      [financeA, first.code],
      [b, second.code],
      [financeB, second.code],
    ] as const) {
      expect(await noticesOf(user.id, "REQUEST_REOPENED")).toEqual([
        { params: expect.objectContaining({ branch: code, count: 1 }) },
      ]);
    }
  });
});
