import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { RequestStatus } from "@/domain/request-status";
import { db } from "@/server/db/client";
import {
  moneyActions,
  moneyRows,
  notifications,
  orderActions,
  orderEvents,
  orders,
} from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertMoneyAction, insertMoneyRow } from "../../../../tests/helpers/money";
import { insertOrder } from "../../../../tests/helpers/orders";
import { insertPurchaseRow, insertTrip } from "../../../../tests/helpers/purchases";
import { insertUser } from "../../../../tests/helpers/users";
import { getOrderMoney } from "../queries/order-money";
import { settleCash } from "./settle-cash";

// The settlement action (build plan 4.5, Done when) and the plan's Tests: 08-money-and-
// settlement.md (Closing 2, the Cash block: "partial amounts are allowed; the net is shown";
// Money ledger 1 to 3; Worked example, "Three orders, one action"), 15 S20 (its settlement),
// edge cases "One order holds money and another of the same Manager is owed" and "The ticked
// orders in settlement belong to two Managers", 10 Notifications ("Cash given, cash returned, paid
// back | Owner"), developer-rules.md rules 3, 8 and 9, and the plan's decided items 1 to 4 and 8.
// Every passing case has the refused data beside it (D40); every fixture is asserted (D38).

const COMMENT = "Invented settlement for the test";

async function scene() {
  setClock("2031-05-10T07:00:00Z");
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const colleague = await insertUser("MANAGER", { branches: [branch.id] });
  const finance = await insertUser("FINANCE", { branches: [branch.id] });
  return { branch, manager, colleague, finance };
}

/** Cash given to an order straight into the tables, as the approval writes it. */
async function given(orderId: string, managerId: string, financeId: string, amount: string) {
  const action = (await insertMoneyAction({ managerId, createdBy: financeId })).rows[0]!.id;
  await insertMoneyRow({ moneyActionId: action, orderId, kind: "CASH_GIVEN", amount });
}

/** A Cash purchase record of `qty` × `unitPrice` on an order (cash spent). */
async function bought(
  order: { id: string; branchId: string; ownerId: string; variantId: string },
  qty: string,
  unitPrice: string,
) {
  const trip = (await insertTrip(order.branchId, order.ownerId)).rows[0]!.id;
  const record = await insertPurchaseRow({
    tripId: trip,
    orderId: order.id,
    branchId: order.branchId,
    variantId: order.variantId,
    createdBy: order.ownerId,
    qty,
    unitPrice,
  });
  expect(record.rows).toHaveLength(1);
}

/**
 * 08 Worked example, "Three orders, one action": CHL-26-0142 (given 520 000, spent 470 000, count
 * +50 000) and CHL-26-0143 (given 100 000, spent 130 000, count −30 000), Waiting for settlement.
 */
async function workedExample(status: RequestStatus = "SETTLEMENT") {
  const s = await scene();
  const o142 = await insertOrder({
    branchId: s.branch.id,
    ownerId: s.manager.id,
    status,
    plannedQty: "100",
    plannedPrice: 5_200n,
    progress: "DONE",
  });
  const o143 = await insertOrder({
    branchId: s.branch.id,
    ownerId: s.manager.id,
    status,
    plannedQty: "50",
    plannedPrice: 2_000n,
    progress: "DONE",
  });
  await given(o142.id, s.manager.id, s.finance.id, "520000");
  await bought(o142, "100", "4700");
  await given(o143.id, s.manager.id, s.finance.id, "100000");
  await bought(o143, "50", "2600");
  expect(await countOf(s.finance.id, o142.id)).toBe(50_000n);
  expect(await countOf(s.finance.id, o143.id)).toBe(-30_000n);
  return { ...s, o142, o143 };
}

type Ticked = { id: string; version: number };
type Row = { kind: "CASH_RETURNED" | "PAID_BACK"; amount: string };

function input(ticked: readonly Ticked[], rows: Record<string, Row>, extra = {}) {
  return {
    clientKey: randomUUID(),
    orders: ticked.map(({ id, version }) => ({ id, version })),
    occurredOn: "2031-05-10",
    comment: COMMENT,
    rows,
    ...extra,
  };
}

function settle(userId: string, value: unknown) {
  return runOrdersAction(settleCash, userId, value);
}

async function countOf(userId: string, orderId: string) {
  const money = await getOrderMoney(userId, orderId);
  expect(money).not.toBeNull();
  return money!.count;
}

async function actionsOf(clientKey: string) {
  const actions = await db.select().from(moneyActions).where(eq(moneyActions.clientKey, clientKey));
  const rows = actions.length
    ? await db
        .select()
        .from(moneyRows)
        .where(
          inArray(
            moneyRows.moneyActionId,
            actions.map((action) => action.id),
          ),
        )
    : [];
  return actions.map((action) => ({
    ...action,
    rows: rows.filter((row) => row.moneyActionId === action.id),
  }));
}

const receive = (amount: string): Row => ({ kind: "CASH_RETURNED", amount });
const pay = (amount: string): Row => ({ kind: "PAID_BACK", amount });

describe("the settlement action (08 Closing 2, the Cash block)", () => {
  it("the two-order settlement of the worked example records one action and leaves both counts at 0 (Done when; S20)", async () => {
    const { manager, finance, o142, o143 } = await workedExample();
    const sent = input([o142, o143], { [o142.id]: receive("50000"), [o143.id]: pay("30000") });
    const result = await settle(finance.id, sent);
    expect(result).toMatchObject({ ok: true });
    const actions = await actionsOf(sent.clientKey);
    expect(actions).toHaveLength(1);
    const [action] = actions;
    expect(action).toMatchObject({
      managerId: manager.id,
      occurredOn: "2031-05-10",
      comment: COMMENT,
      createdBy: finance.id,
    });
    expect(action!.rows).toHaveLength(2);
    expect(action!.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ orderId: o142.id, kind: "CASH_RETURNED", amount: 50_000n }),
        expect.objectContaining({ orderId: o143.id, kind: "PAID_BACK", amount: 30_000n }),
      ]),
    );
    // Saved with this settlement's order action (14: order_action_id).
    const [named] = await db
      .select({ type: orderActions.type })
      .from(orderActions)
      .where(eq(orderActions.id, action!.orderActionId!));
    expect(named!.type).toBe("SETTLE_CASH");
    expect(await countOf(finance.id, o142.id)).toBe(0n);
    expect(await countOf(finance.id, o143.id)).toBe(0n);
    // Each order's history names the action, its kind and the order's amount.
    const events = await db
      .select({
        orderId: orderEvents.orderId,
        type: orderEvents.type,
        payload: orderEvents.payload,
      })
      .from(orderEvents)
      .where(inArray(orderEvents.orderId, [o142.id, o143.id]));
    expect(events.find((event) => event.orderId === o143.id)).toMatchObject({
      type: "SETTLE_CASH",
      payload: { money: { actionId: action!.id, kind: "PAID_BACK", amount: "30000" } },
    });
    // The owner is told once, with the net: he hands Finance 20 000 (decided item 8, Look first).
    const told = await db
      .select({ type: notifications.type, params: notifications.params })
      .from(notifications)
      .where(and(eq(notifications.userId, manager.id), eq(notifications.type, "CASH_SETTLED")));
    expect(told).toHaveLength(1);
    expect(told[0]!.params).toMatchObject({
      count: 2,
      amount: "20000",
      direction: "TO_FINANCE",
    });
    // The orders stay Waiting for settlement: Finance's Close is 4.6.
    const statuses = await db
      .select({ status: orders.status })
      .from(orders)
      .where(inArray(orders.id, [o142.id, o143.id]));
    expect(statuses.map((row) => row.status)).toEqual(["SETTLEMENT", "SETTLEMENT"]);
  });

  it("a Pay row above what the order is owed is refused and nothing is written (Done when; 08 Money ledger 3)", async () => {
    const { finance, o142, o143 } = await workedExample();
    const sent = input([o142, o143], { [o142.id]: receive("50000"), [o143.id]: pay("30001") });
    expect(await settle(finance.id, sent)).toMatchObject({
      ok: false,
      error: {
        code: "not_ready",
        orders: [
          { orderId: o143.id, code: "not_ready", fields: { amount: "errors.field.aboveOwed" } },
        ],
      },
    });
    expect(await actionsOf(sent.clientKey)).toEqual([]);
    expect(await countOf(finance.id, o143.id)).toBe(-30_000n);
    // The same action at the owed amount passes (D40).
    const right = input([o142, o143], { [o142.id]: receive("50000"), [o143.id]: pay("30000") });
    expect(await settle(finance.id, right)).toMatchObject({ ok: true });
  });

  it("a Receive row above the count, or a row against the count's direction, is refused (08 Money ledger 3; decided item 2, Look first)", async () => {
    const { finance, o142, o143 } = await workedExample();
    const above = input([o142], { [o142.id]: receive("50001") });
    expect(await settle(finance.id, above)).toMatchObject({
      ok: false,
      error: {
        orders: [{ orderId: o142.id, fields: { amount: "errors.field.aboveCount" } }],
      },
    });
    // A Pay on an order that holds money, a Receive on one that is owed: each crosses over.
    const wrong = input([o142, o143], { [o142.id]: pay("1"), [o143.id]: receive("1") });
    const answer = await settle(finance.id, wrong);
    expect(answer).toMatchObject({ ok: false, error: { code: "not_ready" } });
    if (answer.ok) throw new Error("refused above");
    const failed = answer.error.orders ?? [];
    expect(failed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ orderId: o142.id, fields: { amount: "errors.field.aboveOwed" } }),
        expect.objectContaining({
          orderId: o143.id,
          fields: { amount: "errors.field.aboveCount" },
        }),
      ]),
    );
    expect(await actionsOf(wrong.clientKey)).toEqual([]);
  });

  it("a partial Receive is allowed and leaves the rest of the count (08 Closing 2)", async () => {
    const { finance, o142 } = await workedExample();
    expect(await settle(finance.id, input([o142], { [o142.id]: receive("20000") }))).toMatchObject({
      ok: true,
    });
    expect(await countOf(finance.id, o142.id)).toBe(30_000n);
  });

  it("a row of a kind other than Cash returned or Paid back is refused and nothing is written (08 Money ledger 2; review of the plan, correction 1)", async () => {
    const { finance, o142 } = await workedExample();
    for (const kind of ["BANK_TRANSFER", "CASH_GIVEN", "CARD_RETURNED"]) {
      const sent = input([o142], { [o142.id]: { kind, amount: "1000" } as unknown as Row });
      expect(await settle(finance.id, sent)).toMatchObject({
        ok: false,
        error: { code: "invalid_input" },
      });
      expect(await actionsOf(sent.clientKey)).toEqual([]);
    }
  });

  it("two Managers: one action each, in one call; a Manager whose rows are all 0 gets no action and no notice, and its order's event names no money (edge case 'two Managers'; review of the plan, Should fix 2)", async () => {
    const { branch, manager, colleague, finance, o142 } = await workedExample();
    const theirs = await insertOrder({
      branchId: branch.id,
      ownerId: colleague.id,
      status: "SETTLEMENT",
      progress: "DONE",
    });
    await given(theirs.id, colleague.id, finance.id, "50000");
    const third = await insertOrder({
      branchId: branch.id,
      ownerId: colleague.id,
      status: "SETTLEMENT",
      progress: "DONE",
    });
    await given(third.id, colleague.id, finance.id, "50000");

    const both = input([o142, theirs], {
      [o142.id]: receive("50000"),
      [theirs.id]: receive("50000"),
    });
    expect(await settle(finance.id, both)).toMatchObject({ ok: true });
    const actions = await actionsOf(both.clientKey);
    expect(new Set(actions.map((action) => action.managerId))).toEqual(
      new Set([manager.id, colleague.id]),
    );
    expect(new Set(actions.map((action) => action.orderActionId)).size).toBe(1);

    const allZero = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "SETTLEMENT",
      progress: "DONE",
    });
    await given(allZero.id, manager.id, finance.id, "50000");
    const before = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.userId, manager.id));
    const zero = input([allZero, third], {
      [allZero.id]: receive("0"),
      [third.id]: receive("50000"),
    });
    expect(await settle(finance.id, zero)).toMatchObject({ ok: true });
    const written = await actionsOf(zero.clientKey);
    expect(written.map((action) => action.managerId)).toEqual([colleague.id]);
    const after = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.userId, manager.id));
    expect(after).toHaveLength(before.length);
    const events = await db
      .select({ payload: orderEvents.payload })
      .from(orderEvents)
      .where(and(eq(orderEvents.orderId, allZero.id), eq(orderEvents.type, "SETTLE_CASH")));
    expect(events.every((event) => event.payload === null)).toBe(true);
  });

  it("no row above 0 is refused (08 Money ledger: an amount above 0)", async () => {
    const { finance, o142 } = await workedExample();
    const sent = input([o142], { [o142.id]: receive("0") });
    expect(await settle(finance.id, sent)).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { rows: "errors.field.noAmount" } },
    });
  });

  it("an order that is not Waiting for settlement is refused wrong_status (settlementAllows(); 06 Allowed moves)", async () => {
    const { finance, o142 } = await workedExample("PURCHASING");
    const sent = input([o142], { [o142.id]: receive("50000") });
    expect(await settle(finance.id, sent)).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: o142.id, code: "wrong_status" }] },
    });
    expect(await actionsOf(sent.clientKey)).toEqual([]);
  });

  it("one Manager's orders in two branches are refused whole (decided item 4, Look first)", async () => {
    const { branch } = await scene();
    const other = await insertBranch();
    const finance = await insertUser("FINANCE", { branches: [branch.id, other.id] });
    const roaming = await insertUser("MANAGER", { branches: [branch.id, other.id] });
    const o142 = await insertOrder({
      branchId: branch.id,
      ownerId: roaming.id,
      status: "SETTLEMENT",
      progress: "DONE",
    });
    await given(o142.id, roaming.id, finance.id, "50000");
    const there = await insertOrder({
      branchId: other.id,
      ownerId: roaming.id,
      status: "SETTLEMENT",
      progress: "DONE",
    });
    await given(there.id, roaming.id, finance.id, "50000");
    const sent = input([o142, there], { [o142.id]: receive("1000"), [there.id]: receive("1000") });
    expect(await settle(finance.id, sent)).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { rows: "errors.field.moneyOneBranch" } },
    });
    expect(await actionsOf(sent.clientKey)).toEqual([]);
  });

  it("the same browser id twice returns the first result and writes once (developer-rules.md rule 8)", async () => {
    const { finance, o142, o143 } = await workedExample();
    const sent = input([o142, o143], { [o142.id]: receive("50000"), [o143.id]: pay("30000") });
    const first = await settle(finance.id, sent);
    expect(first).toMatchObject({ ok: true });
    const again = await settle(finance.id, sent);
    expect(again).toEqual(first);
    const actions = await actionsOf(sent.clientKey);
    expect(actions).toHaveLength(1);
    if (!first.ok) throw new Error("passed above");
    expect(actions[0]!.orderActionId).toBe(first.data.actionId);
    expect(await countOf(finance.id, o142.id)).toBe(0n);
  });

  it("an old version is refused (developer-rules.md rule 9)", async () => {
    const { finance, o142 } = await workedExample();
    const sent = input([{ id: o142.id, version: o142.version + 5 }], {
      [o142.id]: receive("50000"),
    });
    expect(await settle(finance.id, sent)).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: o142.id, code: "stale_version" }] },
    });
  });
});
