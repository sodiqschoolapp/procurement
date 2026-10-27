import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getManagerHome } from "@/features/home/queries/manager-home";
import { recordMoney } from "@/features/money/actions/record-money";
import { getMoneyWithManagers } from "@/features/money/queries/money-with-managers";
import { getOrderPage } from "@/features/orders/queries/order-page";
import { switchManagerRight } from "@/features/users/actions/manager-rights";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import {
  analyticsCash,
  analyticsOrders,
  moneyRows,
  notifications,
  orderEvents,
  orders,
} from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { refreshNow } from "../../../../tests/helpers/analytics";
import { insertProduct, insertSubtypes } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { refusalOf } from "../../../../tests/helpers/database-error";
import {
  DAY,
  atPrincipal,
  buy,
  expectOk,
  openedSkipped,
  openedThroughFinance,
  ordersNow,
  principalApproves,
  setFinanceStep,
  stepScene,
  ticked,
} from "../../../../tests/helpers/finance-step";
import { insertMoneyAction, insertMoneyRow } from "../../../../tests/helpers/money";
import { noticesOf } from "../../../../tests/helpers/moves";
import { setOrderFields } from "../../../../tests/helpers/order-fields";
import { insertOrder } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { closeExactOrders } from "./close-exact";
import { closeSkippedOrders } from "./close-skipped";
import { moveOrdersToManager } from "./move-owner";
import { sendToSettlementOrders } from "./send-to-settlement";

// The orders of the Finance step switch (06-approval-workflow.md, Allowed moves; Finance step
// switched off 1 to 6; 08 Money ledger, last bullet; Overspend guard; 07 Purchase record, Date
// bought; Substitution; 03 rule 7, CLOSE_ALONE; 10 Notifications; 11 Order page layout 2 and 3;
// plan of 4.10c). Every order goes from Draft through the real actions (D38); each passing case
// has the refused one beside it (D40). The switch itself: switch-finance-step.db.test.ts; S21:
// finance-step.s21.db.test.ts; the roles: close-skipped-matrix.db.test.ts.

async function close(userId: string, list: readonly { id: string }[]) {
  return runOrdersAction(closeSkippedOrders, userId, await ticked(list.map((order) => order.id)));
}

async function refusedOrders(answer: Promise<unknown>) {
  const result = (await answer) as { ok: boolean; error?: { orders?: unknown } };
  expect(result.ok).toBe(false);
  return result.error?.orders;
}

describe("the Principal's approval with the step off (06 Finance step switched off 1; 10 Notifications)", () => {
  it("opens the order, marks it, sets approved_at, and tells its owner and the Head, not Finance; with the step on it waits for Finance as before", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const skipped = await atPrincipal(s);
    const ordinary = await atPrincipal(s);

    await setFinanceStep(false);
    await principalApproves(s, [skipped]);
    await setFinanceStep(true);
    await principalApproves(s, [ordinary]);

    const now = await ordersNow([skipped.id, ordinary.id]);
    expect(now.get(skipped.id)).toMatchObject({
      status: "PURCHASING",
      skippedFinance: true,
      approvedAt: new Date(`${DAY}T07:00:00Z`),
    });
    expect(now.get(ordinary.id)).toMatchObject({
      status: "PENDING_FINANCE",
      skippedFinance: false,
      approvedAt: null,
    });
    const [event] = await db
      .select({ from: orderEvents.fromStatus, to: orderEvents.toStatus })
      .from(orderEvents)
      .where(and(eq(orderEvents.orderId, skipped.id), eq(orderEvents.type, "APPROVE")))
      .orderBy(orderEvents.createdAt)
      .then((rows) => rows.slice(-1));
    expect(event).toEqual({ from: "PENDING_PRINCIPAL", to: "PURCHASING" });

    // One notice each: the skipped order to the owner and the Head, the other to Finance.
    expect(await noticesOf(s.manager.id, "REQUEST_PRINCIPAL_APPROVED")).toHaveLength(1);
    expect(await noticesOf(s.head.id, "REQUEST_PRINCIPAL_APPROVED")).toHaveLength(1);
    expect(await noticesOf(s.finance.id, "REQUEST_PRINCIPAL_APPROVED")).toHaveLength(1);
  });
});

describe("Close of an order that skipped Finance (06 Allowed moves, 'Open, skipped Finance | Close'; Finance step switched off 3 and 4)", () => {
  it("the owner closes a finished order with a difference, with no settlement and no acknowledgment; the Head is told of the overspend", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const order = await openedSkipped(s);
    // 100 × 6 500 + 20 000 = 670 000 against 520 000: 28.8 % and 150 000 over the guard.
    expectOk(await buy(s, [{ order, unitPrice: "6500", comment: "Narx oshgan" }]));

    const closed = expectOk(await close(s.manager.id, [order]));

    expect(closed.orders).toEqual([{ id: order.id, status: "CLOSED" }]);
    expect((await ordersNow([order.id])).get(order.id)).toMatchObject({
      status: "CLOSED",
      closedAt: new Date(`${DAY}T07:00:00Z`),
    });
    expect(await noticesOf(s.head.id, "OVERSPEND_ABOVE_GUARD")).toHaveLength(1);
    expect(await noticesOf(s.head.id, "REQUEST_CLOSED")).toHaveLength(1);
    expect(await noticesOf(s.finance.id, "REQUEST_CLOSED")).toHaveLength(1);
    await setFinanceStep(true);
  });

  it("an order still buying is not ready; an order that went through Finance has no such Close, and a skipped one no Close (exact match) or Send to settlement (D40)", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const buying = await openedSkipped(s);
    expectOk(await buy(s, [{ order: buying, qty: "60", comment: "Qolgani ertaga" }]));
    expect(await refusedOrders(close(s.manager.id, [buying]))).toEqual([
      { orderId: buying.id, code: "not_ready" },
    ]);

    const finished = await openedSkipped(s);
    expectOk(await buy(s, [{ order: finished }]));
    for (const action of [closeExactOrders, sendToSettlementOrders]) {
      expect(
        await refusedOrders(runOrdersAction(action, s.manager.id, await ticked([finished.id]))),
      ).toEqual([{ orderId: finished.id, code: "wrong_status" }]);
    }

    const ordinary = await openedThroughFinance(s, {}, "520000");
    expectOk(await buy(s, [{ order: ordinary }]));
    expect(await refusedOrders(close(s.manager.id, [ordinary]))).toEqual([
      { orderId: ordinary.id, code: "wrong_status" },
    ]);
    expect((await ordersNow([finished.id, ordinary.id])).get(finished.id)?.status).toBe(
      "PURCHASING",
    );
  });

  it("a substitution, an overspend above the guard and the owner's CLOSE_ALONE off, all on one order: the Manager is refused, the Head closes it with no acknowledgment and is told of the overspend (07 Substitution; 03 CLOSE_ALONE; D46)", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const pens = await insertProduct();
    const [blue, black] = await insertSubtypes(pens.id, [{ name: "Ko'k" }, { name: "Qora" }]);
    const order = await openedSkipped(s, { variantId: blue! });
    expectOk(
      await buy(s, [
        { order, variantId: black!, unitPrice: "6500", comment: "Ko'k qolmagan, qimmatroq" },
      ]),
    );
    expect(
      await runAction(switchManagerRight, s.head.id, {
        id: s.manager.id,
        right: "CLOSE_ALONE",
        enabled: false,
      }),
    ).toMatchObject({ ok: true });

    expect(await refusedOrders(close(s.manager.id, [order]))).toEqual([
      { orderId: order.id, code: "forbidden" },
    ]);
    // Another Head is told of the overspend; the Head who closes is the actor (notify()).
    const otherHead = await insertUser("HEAD");
    expectOk(await close(s.head.id, [order]));
    expect((await ordersNow([order.id])).get(order.id)?.status).toBe("CLOSED");
    expect(await noticesOf(otherHead.id, "OVERSPEND_ABOVE_GUARD")).toHaveLength(1);
    expect(await noticesOf(s.head.id, "OVERSPEND_ABOVE_GUARD")).toEqual([]);
    await setFinanceStep(true);
  });

  it("rule 6: with the step switched on again, an Open order that skipped Finance still closes by its owner without settlement", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const order = await openedSkipped(s);
    await setFinanceStep(true);
    expectOk(await buy(s, [{ order, unitPrice: "4500", comment: "Arzonroq topildi" }]));
    expect(
      await refusedOrders(
        runOrdersAction(sendToSettlementOrders, s.manager.id, await ticked([order.id])),
      ),
    ).toEqual([{ orderId: order.id, code: "wrong_status" }]);
    expectOk(await close(s.manager.id, [order]));
    expect((await ordersNow([order.id])).get(order.id)?.status).toBe("CLOSED");
  });
});

describe("no money on an order that skipped Finance (06 Finance step switched off 2)", () => {
  it("Finance's Cash given and Bank transfer are refused on it and go through on an Open order beside it", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const skipped = await openedSkipped(s);
    const ordinary = await openedThroughFinance(s);
    for (const kind of ["CASH_GIVEN", "BANK_TRANSFER"] as const) {
      const refused = await runOrdersAction(recordMoney, s.finance.id, {
        ...(await ticked([skipped.id])),
        kind,
        occurredOn: DAY,
        comment: "Invented comment",
        amounts: { [skipped.id]: "100000" },
      });
      expect(refused).toMatchObject({
        ok: false,
        error: { orders: [{ orderId: skipped.id, code: "wrong_status" }] },
      });
      expectOk(
        await runOrdersAction(recordMoney, s.finance.id, {
          ...(await ticked([ordinary.id])),
          kind,
          occurredOn: DAY,
          comment: "Invented comment",
          amounts: { [ordinary.id]: "100000" },
        }),
      );
    }
    expect(await db.select().from(moneyRows).where(eq(moneyRows.orderId, skipped.id))).toEqual([]);
    await setFinanceStep(true);
  });

  it("the database refuses a money row on it straight, and takes one on an ordinary order (money_rows_not_skipped; D39)", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const skipped = await openedSkipped(s);
    const ordinary = await openedThroughFinance(s);
    const action = await insertMoneyAction({ managerId: s.manager.id, createdBy: s.finance.id });
    const actionId = action.rows[0]!.id;
    expect(
      await refusalOf(insertMoneyRow({ moneyActionId: actionId, orderId: skipped.id })),
    ).toEqual(expect.objectContaining({ code: "23514", constraint: "money_rows_not_skipped" }));
    await insertMoneyRow({ moneyActionId: actionId, orderId: ordinary.id });
    await setFinanceStep(true);
  });

  it("the database refuses an order that skipped Finance at Waiting for Finance or for settlement, by insert and by update (orders_skipped_finance_status_check; D39)", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const skipped = await openedSkipped(s);
    for (const status of ["SETTLEMENT", "PENDING_FINANCE"] as const) {
      expect(
        await refusalOf(db.update(orders).set({ status }).where(eq(orders.id, skipped.id))),
      ).toEqual(
        expect.objectContaining({
          code: "23514",
          constraint: "orders_skipped_finance_status_check",
        }),
      );
    }
    const inserted = await insertOrder({
      branchId: s.branch.id,
      ownerId: s.manager.id,
      status: "SETTLEMENT",
    });
    expect(
      await refusalOf(
        db.update(orders).set({ skippedFinance: true }).where(eq(orders.id, inserted.id)),
      ),
    ).toEqual(expect.objectContaining({ constraint: "orders_skipped_finance_status_check" }));
    expect(
      await refusalOf(
        db.insert(orders).values({
          branchId: s.branch.id,
          ownerId: s.manager.id,
          createdBy: s.manager.id,
          status: "PENDING_FINANCE",
          number: "ZZ-31-9999",
          paymentType: "CASH",
          variantId: skipped.variantId,
          departmentId: (
            await db
              .select({ departmentId: orders.departmentId })
              .from(orders)
              .where(eq(orders.id, skipped.id))
          )[0]!.departmentId,
          neededBy: "2031-05-01",
          plannedQty: "1",
          plannedPrice: 1000n,
          plannedTotal: 1000n,
          submittedAt: new Date(`${DAY}T07:00:00Z`),
          skippedFinance: true,
          createdAt: new Date(`${DAY}T07:00:00Z`),
          updatedAt: new Date(`${DAY}T07:00:00Z`),
        }),
      ),
    ).toEqual(expect.objectContaining({ constraint: "orders_skipped_finance_status_check" }));
    await setFinanceStep(true);
  });
});

describe("no cash count on an order that skipped Finance (06 Finance step switched off 2; 08 Money ledger, last bullet; Done when)", () => {
  it("a skipped order bought 670 000 in cash adds nothing to its Manager's balance: Money with managers, cash I hold, the analytics cash and Cash needed soon see only the ordinary order", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const skipped = await openedSkipped(s);
    expectOk(await buy(s, [{ order: skipped, unitPrice: "6500", comment: "Narx oshgan" }]));
    const stillBuying = await openedSkipped(s);
    // 700 000 given, 520 000 spent: the Manager holds 180 000 (D40: the reader is not empty).
    const ordinary = await openedThroughFinance(s, {}, "700000");
    expectOk(await buy(s, [{ order: ordinary }]));
    const unpaid = await openedThroughFinance(s);

    const blocks = await getMoneyWithManagers(s.head.id, s.branch.id);
    expect(blocks.map((block) => ({ held: block.held, owed: block.owed }))).toEqual([
      { held: 180_000n, owed: 0n },
    ]);
    expect(blocks[0]!.orders.map((order) => order.id)).toEqual([ordinary.id]);

    const home = await getManagerHome(s.manager.id, s.branch.id);
    expect(home.cash).toEqual({ held: 180_000n, owed: 0n, orders: 1 });

    await refreshNow();
    const cash = await db
      .select({ orderId: analyticsCash.orderId, count: analyticsCash.cashCount })
      .from(analyticsCash)
      .where(eq(analyticsCash.branchId, s.branch.id));
    expect(cash).toEqual([{ orderId: ordinary.id, count: 180_000n }]);
    const needed = await db
      .select({ orderId: analyticsOrders.orderId, needed: analyticsOrders.cashNeeded })
      .from(analyticsOrders)
      .where(inArray(analyticsOrders.orderId, [stillBuying.id, unpaid.id]));
    expect(new Map(needed.map((row) => [row.orderId, row.needed]))).toEqual(
      new Map([
        [stillBuying.id, 0n],
        [unpaid.id, 520_000n],
      ]),
    );
    await setFinanceStep(true);
  });

  it("03 rule 7: a skipped order bought in cash moves to another Manager; an ordinary one holding cash beside it does not", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const other = await insertUser("MANAGER", { branches: [s.branch.id] });
    const skipped = await openedSkipped(s);
    expectOk(await buy(s, [{ order: skipped, qty: "40", comment: "Qolgani keyin" }]));
    const ordinary = await openedThroughFinance(s, {}, "520000");

    expect(
      await runOrdersAction(moveOrdersToManager, s.head.id, {
        ...(await ticked([ordinary.id])),
        managerId: other.id,
      }),
    ).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: ordinary.id, code: "not_ready" }] },
    });
    expectOk(
      await runOrdersAction(moveOrdersToManager, s.head.id, {
        ...(await ticked([skipped.id])),
        managerId: other.id,
      }),
    );
    const [moved] = await db
      .select({ ownerId: orders.ownerId })
      .from(orders)
      .where(eq(orders.id, skipped.id));
    expect(moved!.ownerId).toBe(other.id);
    await setFinanceStep(true);
  });
});

describe("the date bought of a skipped order (07 Purchase record, Date bought: 'the Principal's, for an order that skipped Finance')", () => {
  it("a day before the Principal's approval is refused naming the Principal; the approval day goes through", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const order = await openedSkipped(s);
    expect(await buy(s, [{ order }], "CASH", "2031-03-31")).toMatchObject({
      ok: false,
      error: { fields: { purchasedOn: "errors.field.beforePrincipalApproval" } },
    });
    expectOk(await buy(s, [{ order }], "CASH", DAY));
    await setFinanceStep(true);
  });
});

describe("the order page of a skipped order (11 Order page layout 2 and 3; 06 rule 11)", () => {
  it("Finance reads Skipped, the Principal's approval is the move that opened it, no money can be recorded; an ordinary order beside it shows Finance done", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const skipped = await openedSkipped(s);
    const page = (await getOrderPage(s.finance.id, skipped.id))!;
    expect(page.skippedFinance).toBe(true);
    expect(page.financeStep).toBe(false);
    expect(page.steps.find((view) => view.step === "FINANCE")).toEqual({
      step: "FINANCE",
      state: "skipped",
      by: null,
    });
    const approvals = page.events.filter((event) => event.type === "APPROVE");
    expect(approvals).toHaveLength(2);
    expect(approvals.find((event) => event.from === "PENDING_PRINCIPAL")?.to).toBe("PURCHASING");
    expect(page.canRecordMoney).toBe(false);

    const ordinary = await openedThroughFinance(s);
    const other = (await getOrderPage(s.finance.id, ordinary.id))!;
    expect(other.skippedFinance).toBe(false);
    expect(other.financeStep).toBe(true);
    expect(other.steps.find((view) => view.step === "FINANCE")?.state).toBe("done");
    expect(other.canRecordMoney).toBe(true);
  });

  it("the Closed notice of a skipped order goes to the owner, the Heads and Finance (10 'Closed, reopened')", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const order = await openedSkipped(s);
    expectOk(await buy(s, [{ order }]));
    expectOk(await close(s.head.id, [order]));
    const told = await db
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(
        and(eq(notifications.type, "REQUEST_CLOSED"), eq(notifications.branchId, s.branch.id)),
      );
    // Every active Head of the database is told too; the scene's own people are read here.
    const people = new Set([s.manager.id, s.principal.id, s.finance.id]);
    expect(new Set(told.map((row) => row.userId).filter((id) => people.has(id)))).toEqual(
      new Set([s.manager.id, s.finance.id]),
    );
    await setFinanceStep(true);
  });
});

// 08 Numbers: an order without a planned price "is left out of the overspend guard"; 06 Finance
// step switched off 3 and 4; plan of 2.5d-b, decided item 5 (Look first); S24 "no overspend
// notice is sent". The priced order beside it in the same close still sends its notice (D40).
describe("Close of an unpriced order that skipped Finance (08 Numbers; Overspend guard; plan of 2.5d-b)", () => {
  it("one close of a priced order over the guard and an unpriced one bought for more: one notice, for the priced order only", async () => {
    setClock(`${DAY}T07:00:00Z`);
    await setFinanceStep(false);
    await setOrderFields({ price: { ask: "optional", place: "row" } });
    const s = await stepScene();
    const priced = await atPrincipal(s);
    const unpriced = await atPrincipal(s, { price: null });
    await principalApproves(s, [priced, unpriced]);
    // 100 × 6 500 + 20 000 = 670 000 against 520 000: over the guard. The unpriced order costs
    // the same and has nothing to be over.
    expectOk(
      await buy(s, [
        { order: priced, unitPrice: "6500", comment: "Narx oshgan" },
        { order: unpriced, unitPrice: "6500" },
      ]),
    );

    const closed = expectOk(await close(s.manager.id, [priced, unpriced]));

    expect(closed.orders.map((each) => each.status)).toEqual(["CLOSED", "CLOSED"]);
    const told = await noticesOf(s.head.id, "OVERSPEND_ABOVE_GUARD");
    expect(told).toHaveLength(1);
    expect(told[0]!.params).toMatchObject({ count: 1 });
    await setOrderFields({});
    await setFinanceStep(true);
  });
});
