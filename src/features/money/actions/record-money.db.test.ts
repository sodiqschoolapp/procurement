import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { MoneyRowKind } from "@/domain/money-ledger";
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
import { insertFileRow } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertMoneyAction, insertMoneyRow } from "../../../../tests/helpers/money";
import { insertOrder } from "../../../../tests/helpers/orders";
import { insertPurchaseRow, insertTrip } from "../../../../tests/helpers/purchases";
import { insertUser } from "../../../../tests/helpers/users";
import { getOrderMoney } from "../queries/order-money";
import { recordMoney } from "./record-money";

// Record money (build plan 4.3) and the plan's Tests: 08-money-and-settlement.md (Money ledger:
// rows, kinds, rules 1 and 3; the cash count; When Finance approves: "Finance can add more actions
// at any time while the orders are Open"), edge cases "The Manager bought before cash was given"
// and "Finance gives cash for several orders", 10-notifications-analytics-reports.md
// (Notifications: "Cash given, cash returned, paid back | Owner"), developer-rules.md rules 3, 8
// and 9, and the decided items of the plan of 4.3. Every passing case has the refused data beside
// it (D40); every fixture is asserted (D38).

const COMMENT = "Invented money for the test";

/** A branch with its Finance user and two Managers. Orders plan 10 × 5 000 = 50 000 in cash. */
async function scene() {
  setClock("2031-05-10T07:00:00Z");
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const colleague = await insertUser("MANAGER", { branches: [branch.id] });
  const finance = await insertUser("FINANCE", { branches: [branch.id] });
  return { branch, manager, colleague, finance };
}

function order(branchId: string, ownerId: string, status: RequestStatus = "PURCHASING") {
  return insertOrder({ branchId, ownerId, status });
}

type Ticked = { id: string; version: number };

function input(
  ticked: readonly Ticked[],
  kind: MoneyRowKind,
  amounts: Record<string, string>,
  extra: Record<string, unknown> = {},
) {
  return {
    clientKey: randomUUID(),
    orders: ticked.map(({ id, version }) => ({ id, version })),
    kind,
    occurredOn: "2031-05-09",
    comment: COMMENT,
    amounts,
    ...extra,
  };
}

function record(userId: string, value: unknown) {
  return runOrdersAction(recordMoney, userId, value);
}

/** The money actions of a browser id, each with its rows. */
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

/** A Cash purchase record of `qty` × 5 000 on an order (cash spent). */
async function bought(
  orderId: string,
  branchId: string,
  userId: string,
  variantId: string,
  qty: string,
) {
  const trip = (await insertTrip(branchId, userId)).rows[0]!.id;
  await insertPurchaseRow({ tripId: trip, orderId, branchId, variantId, createdBy: userId, qty });
}

/** Cash given to an order straight into the tables, as the approval writes it. */
async function given(orderId: string, managerId: string, financeId: string, amount: string) {
  const action = (await insertMoneyAction({ managerId, createdBy: financeId })).rows[0]!.id;
  await insertMoneyRow({ moneyActionId: action, orderId, kind: "CASH_GIVEN", amount });
}

async function countOf(userId: string, orderId: string) {
  const money = await getOrderMoney(userId, orderId);
  expect(money).not.toBeNull();
  return money!.count;
}

describe("Record money (08 Money ledger)", () => {
  it("each of the six kinds writes one action with its date, document number and comment, and one row per order", async () => {
    const { branch, manager, finance } = await scene();
    for (const kind of [
      "CASH_GIVEN",
      "PAID_BACK",
      "BANK_TRANSFER",
      "CARD_TOPUP",
      "CARD_RETURNED",
      "CASH_RETURNED",
    ] as const) {
      const one = await order(branch.id, manager.id);
      // Cash returned needs cash held; Paid back cash owed (08 Money ledger 3).
      if (kind === "CASH_RETURNED") await given(one.id, manager.id, finance.id, "50000");
      if (kind === "PAID_BACK") {
        await bought(one.id, branch.id, manager.id, one.variantId, "10");
      }
      const sent = input([one], kind, { [one.id]: "30000" }, { documentNo: " PP-17 " });
      const result = await record(finance.id, sent);
      expect(result).toMatchObject({ ok: true });
      const [action] = await actionsOf(sent.clientKey);
      expect(action).toMatchObject({
        managerId: manager.id,
        occurredOn: "2031-05-09",
        documentNo: "PP-17",
        comment: COMMENT,
        createdBy: finance.id,
        isCancelled: false,
      });
      expect(action!.rows).toEqual([
        expect.objectContaining({ orderId: one.id, kind, amount: 30_000n }),
      ]);
      // The action names its order action (14: order_action_id).
      const [named] = await db
        .select({ type: orderActions.type })
        .from(orderActions)
        .where(eq(orderActions.id, action!.orderActionId!));
      expect(named!.type).toBe("RECORD_MONEY");
    }
  });

  it("rows of 0 or empty write nothing; with no amount above 0 nothing is written (decided item 2)", async () => {
    const { branch, manager, finance } = await scene();
    const a = await order(branch.id, manager.id);
    const b = await order(branch.id, manager.id);
    const sent = input([a, b], "CASH_GIVEN", { [a.id]: "40000", [b.id]: "0" });
    expect(await record(finance.id, sent)).toMatchObject({ ok: true });
    const [action] = await actionsOf(sent.clientKey);
    expect(action!.rows.map((row) => row.orderId)).toEqual([a.id]);

    const none = input([a, b], "CASH_GIVEN", { [a.id]: "0" });
    const answer = await record(finance.id, {
      ...none,
      orders: [
        { id: a.id, version: a.version + 1 },
        { id: b.id, version: b.version + 1 },
      ],
    });
    expect(answer).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { amounts: "errors.field.noAmount" } },
    });
    expect(await actionsOf(none.clientKey)).toEqual([]);
  });

  it("orders of two Managers make two actions with one browser id, in one transaction (08 Money ledger 1)", async () => {
    const { branch, manager, colleague, finance } = await scene();
    const a = await order(branch.id, manager.id);
    const b = await order(branch.id, colleague.id);
    const sent = input([a, b], "CASH_GIVEN", { [a.id]: "50000", [b.id]: "20000" });
    expect(await record(finance.id, sent)).toMatchObject({ ok: true });
    const actions = await actionsOf(sent.clientKey);
    expect(actions).toHaveLength(2);
    const byManager = new Map(actions.map((action) => [action.managerId, action]));
    expect(byManager.get(manager.id)!.rows).toEqual([
      expect.objectContaining({ orderId: a.id, amount: 50_000n }),
    ]);
    expect(byManager.get(colleague.id)!.rows).toEqual([
      expect.objectContaining({ orderId: b.id, amount: 20_000n }),
    ]);
    expect(new Set(actions.map((action) => action.orderActionId)).size).toBe(1);
  });

  it("one Manager's orders in two branches are refused whole (decided item 4, Look first)", async () => {
    const { branch, manager } = await scene();
    const second = await insertBranch();
    const finance = await insertUser("FINANCE", { branches: [branch.id, second.id] });
    const roaming = await insertUser("MANAGER", { branches: [branch.id, second.id] });
    const a = await order(branch.id, roaming.id);
    const b = await order(second.id, roaming.id);
    // A second Manager's order of one branch beside it would pass alone.
    const c = await order(branch.id, manager.id);
    const sent = input([a, b, c], "CASH_GIVEN", {
      [a.id]: "10000",
      [b.id]: "10000",
      [c.id]: "10000",
    });
    expect(await record(finance.id, sent)).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { amounts: "errors.field.moneyOneBranch" } },
    });
    expect(await actionsOf(sent.clientKey)).toEqual([]);
  });

  it("the same browser id twice returns the first result and writes nothing more (developer-rules.md rule 8)", async () => {
    const { branch, manager, finance } = await scene();
    const a = await order(branch.id, manager.id);
    const sent = input([a], "CASH_GIVEN", { [a.id]: "50000" });
    const first = await record(finance.id, sent);
    expect(first).toMatchObject({ ok: true });
    const again = await record(finance.id, sent);
    expect(again).toEqual(first);
    const actions = await actionsOf(sent.clientKey);
    expect(actions).toHaveLength(1);
    expect(actions[0]!.rows).toHaveLength(1);
  });

  it("an order sent with an old version is refused, nothing written (rule 9)", async () => {
    const { branch, manager, finance } = await scene();
    const a = await order(branch.id, manager.id);
    const b = await order(branch.id, manager.id);
    const sent = input([a, { id: b.id, version: b.version + 1 }], "CASH_GIVEN", {
      [a.id]: "50000",
      [b.id]: "50000",
    });
    expect(await record(finance.id, sent)).toMatchObject({
      ok: false,
      error: { code: "stale_version", orders: [{ orderId: b.id, code: "stale_version" }] },
    });
    expect(await actionsOf(sent.clientKey)).toEqual([]);
  });

  it("an order Waiting for settlement takes money; a Closed one beside it is refused (decided item 1, Look first)", async () => {
    const { branch, manager, finance } = await scene();
    const settling = await order(branch.id, manager.id, "SETTLEMENT");
    const closed = await order(branch.id, manager.id, "CLOSED");
    const both = input([settling, closed], "CARD_RETURNED", {
      [settling.id]: "5000",
      [closed.id]: "5000",
    });
    expect(await record(finance.id, both)).toMatchObject({
      ok: false,
      error: { code: "wrong_status", orders: [{ orderId: closed.id, code: "wrong_status" }] },
    });
    expect(await actionsOf(both.clientKey)).toEqual([]);

    const alone = input([settling], "CARD_RETURNED", { [settling.id]: "5000" });
    expect(await record(finance.id, alone)).toMatchObject({ ok: true });
    expect(await actionsOf(alone.clientKey)).toHaveLength(1);
  });

  it("a Draft, an order in approval, Sent back, Rejected, Cancelled and Closed are refused, each beside an Open one (decided item 1)", async () => {
    const { branch, manager, finance } = await scene();
    for (const status of [
      "DRAFT",
      "PENDING_HEAD",
      "PENDING_PRINCIPAL",
      "PENDING_FINANCE",
      "RETURNED",
      "REJECTED",
      "CANCELLED",
      "CLOSED",
    ] as const) {
      const open = await order(branch.id, manager.id);
      const other = await order(branch.id, manager.id, status);
      const sent = input([open, other], "CASH_GIVEN", { [open.id]: "50000", [other.id]: "50000" });
      const result = await record(finance.id, sent);
      // A Draft is behind the draft wall for Finance: "Not found" (06 Statuses).
      const code = status === "DRAFT" ? "not_found" : "wrong_status";
      expect(result).toMatchObject({ ok: false, error: { orders: [{ orderId: other.id, code }] } });
      expect(await actionsOf(sent.clientKey)).toEqual([]);
    }
  });

  it("an amount on an order that is not ticked, of another branch, is refused before anything is read (review of the plan, Should fix 5)", async () => {
    const { branch, manager, finance } = await scene();
    const other = await insertBranch();
    const stranger = await insertUser("MANAGER", { branches: [other.id] });
    const theirs = await order(other.id, stranger.id);
    const a = await order(branch.id, manager.id);
    const sent = input([a], "CASH_GIVEN", { [a.id]: "50000", [theirs.id]: "50000" });
    expect(await record(finance.id, sent)).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    expect(await actionsOf(sent.clientKey)).toEqual([]);
  });

  it("Cash given above the planned cash is allowed: it has no limit (08 Money ledger 3)", async () => {
    const { branch, manager, finance } = await scene();
    const a = await order(branch.id, manager.id);
    const sent = input([a], "CASH_GIVEN", { [a.id]: "90000" });
    expect(await record(finance.id, sent)).toMatchObject({ ok: true });
    expect(await countOf(finance.id, a.id)).toBe(90_000n);
  });
});

describe('the date (08 Money ledger: "one date, not later than today"; D55 (15); plan of 4.10b, decided item 5, Look first)', () => {
  it("today in Tashkent is saved and tomorrow is refused, with the clock where the UTC and Tashkent dates differ (rule 10)", async () => {
    const { branch, manager, finance } = await scene();
    // 20:00 UTC on 20 May is 01:00 on 21 May in Tashkent.
    setClock("2031-05-20T20:00:00Z");
    const one = await order(branch.id, manager.id);
    const tomorrow = input([one], "CASH_GIVEN", { [one.id]: "10000" }, { occurredOn: "2031-05-22" });
    expect(await record(finance.id, tomorrow)).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { occurredOn: "errors.field.inFuture" } },
    });
    expect(await actionsOf(tomorrow.clientKey)).toEqual([]);

    const today = input([one], "CASH_GIVEN", { [one.id]: "10000" }, { occurredOn: "2031-05-21" });
    expect(await record(finance.id, today)).toMatchObject({ ok: true });
    expect(await actionsOf(today.clientKey)).toMatchObject([{ occurredOn: "2031-05-21" }]);
  });
});

describe("no crossing over (08 Money ledger 3; decided item 3, Look first)", () => {
  it("Cash returned at the count + 1 is refused; at the count it is allowed and the count is 0", async () => {
    const { branch, manager, finance } = await scene();
    const a = await order(branch.id, manager.id);
    await given(a.id, manager.id, finance.id, "50000");
    expect(await countOf(finance.id, a.id)).toBe(50_000n);

    const over = input([a], "CASH_RETURNED", { [a.id]: "50001" });
    expect(await record(finance.id, over)).toMatchObject({
      ok: false,
      error: {
        code: "not_ready",
        orders: [
          { orderId: a.id, code: "not_ready", fields: { amount: "errors.field.aboveCount" } },
        ],
      },
    });
    expect(await actionsOf(over.clientKey)).toEqual([]);

    const exact = input([a], "CASH_RETURNED", { [a.id]: "50000" });
    expect(await record(finance.id, exact)).toMatchObject({ ok: true });
    expect(await countOf(finance.id, a.id)).toBe(0n);
  });

  it("The Manager bought before cash was given: the count is below 0, Paid back of it brings it to 0, one so'm more is refused (edge case)", async () => {
    const { branch, manager, finance } = await scene();
    const a = await order(branch.id, manager.id);
    await bought(a.id, branch.id, manager.id, a.variantId, "10");
    expect(await countOf(finance.id, a.id)).toBe(-50_000n);

    const over = input([a], "PAID_BACK", { [a.id]: "50001" });
    expect(await record(finance.id, over)).toMatchObject({
      ok: false,
      error: {
        orders: [
          { orderId: a.id, code: "not_ready", fields: { amount: "errors.field.aboveOwed" } },
        ],
      },
    });
    expect(await actionsOf(over.clientKey)).toEqual([]);

    const exact = input([a], "PAID_BACK", { [a.id]: "50000" });
    expect(await record(finance.id, exact)).toMatchObject({ ok: true });
    expect(await countOf(finance.id, a.id)).toBe(0n);
  });

  it("a failure on one Manager's order rolls back every action and row of the call", async () => {
    const { branch, manager, colleague, finance } = await scene();
    const a = await order(branch.id, manager.id);
    const b = await order(branch.id, colleague.id);
    await given(a.id, manager.id, finance.id, "50000");
    await given(b.id, colleague.id, finance.id, "10000");
    const sent = input([a, b], "CASH_RETURNED", { [a.id]: "50000", [b.id]: "10001" });
    expect(await record(finance.id, sent)).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: b.id, code: "not_ready" }] },
    });
    expect(await actionsOf(sent.clientKey)).toEqual([]);
    const versions = await db
      .select({ version: orders.version })
      .from(orders)
      .where(inArray(orders.id, [a.id, b.id]));
    expect(versions.map((row) => row.version)).toEqual([1, 1]);
    expect(await countOf(finance.id, a.id)).toBe(50_000n);
  });
});

describe("the file (08 Money ledger: an optional file; decided item 5, Look first)", () => {
  it("Finance's own upload is attached to the action", async () => {
    const { branch, manager, finance } = await scene();
    const a = await order(branch.id, manager.id);
    const file = await insertFileRow(finance.id, "application/pdf");
    const sent = input([a], "BANK_TRANSFER", { [a.id]: "50000" }, { fileId: file.id });
    expect(await record(finance.id, sent)).toMatchObject({ ok: true });
    expect((await actionsOf(sent.clientKey))[0]!.fileId).toBe(file.id);
  });

  it("another user's upload, a file another record holds, and a file for two Managers are refused", async () => {
    const { branch, manager, colleague, finance } = await scene();
    const a = await order(branch.id, manager.id);
    const b = await order(branch.id, colleague.id);
    const theirs = await insertFileRow(manager.id, "application/pdf");
    const held = await insertFileRow(finance.id, "application/pdf");
    const holder = input([a], "BANK_TRANSFER", { [a.id]: "1000" }, { fileId: held.id });
    expect(await record(finance.id, holder)).toMatchObject({ ok: true });
    const fresh = await insertFileRow(finance.id, "application/pdf");

    for (const [ticked, fileId, field] of [
      [[a], theirs.id, "errors.field.notAllowed"],
      [[a], held.id, "errors.field.notAllowed"],
      [[a, b], fresh.id, "errors.field.fileOneManager"],
    ] as const) {
      const current = await db
        .select({ id: orders.id, version: orders.version })
        .from(orders)
        .where(
          inArray(
            orders.id,
            ticked.map((each) => each.id),
          ),
        );
      const amounts = Object.fromEntries(current.map((each) => [each.id, "1000"]));
      const sent = input(current, "BANK_TRANSFER", amounts, { fileId });
      expect(await record(finance.id, sent)).toMatchObject({
        ok: false,
        error: { code: "invalid_input", fields: { fileId: field } },
      });
      expect(await actionsOf(sent.clientKey)).toEqual([]);
    }
  });
});

describe("the owner's notice (10 Notifications: Cash given, cash returned, paid back | Owner; decided item 7)", () => {
  async function noticesOf(userId: string) {
    return db
      .select({ type: notifications.type, params: notifications.params })
      .from(notifications)
      .where(eq(notifications.userId, userId));
  }

  it("one notice per Manager for each cash kind, with the action's count and total; the information kinds tell no one", async () => {
    const { branch, manager, colleague, finance } = await scene();
    const a = await order(branch.id, manager.id);
    const b = await order(branch.id, manager.id);
    const c = await order(branch.id, colleague.id);
    const sent = input([a, b, c], "CASH_GIVEN", {
      [a.id]: "50000",
      [b.id]: "20000",
      [c.id]: "10000",
    });
    expect(await record(finance.id, sent)).toMatchObject({ ok: true });
    expect(await noticesOf(manager.id)).toEqual([
      {
        type: "CASH_GIVEN",
        params: expect.objectContaining({ count: 2, amount: "70000", via: "money" }),
      },
    ]);
    expect(await noticesOf(colleague.id)).toEqual([
      {
        type: "CASH_GIVEN",
        params: expect.objectContaining({ count: 1, amount: "10000", via: "money" }),
      },
    ]);

    const returned = input(
      [
        { id: a.id, version: a.version + 1 },
        { id: b.id, version: b.version + 1 },
      ],
      "CASH_RETURNED",
      { [a.id]: "5000", [b.id]: "5000" },
    );
    expect(await record(finance.id, returned)).toMatchObject({ ok: true });
    const paid = await order(branch.id, manager.id);
    await bought(paid.id, branch.id, manager.id, paid.variantId, "1");
    expect(
      await record(finance.id, input([paid], "PAID_BACK", { [paid.id]: "5000" })),
    ).toMatchObject({ ok: true });
    const types = (await noticesOf(manager.id)).map((notice) => notice.type).sort();
    expect(types).toEqual(["CASH_GIVEN", "CASH_PAID_BACK", "CASH_RETURNED"]);

    for (const kind of ["BANK_TRANSFER", "CARD_TOPUP", "CARD_RETURNED"] as const) {
      const quiet = await order(branch.id, colleague.id);
      expect(await record(finance.id, input([quiet], kind, { [quiet.id]: "1000" }))).toMatchObject({
        ok: true,
      });
    }
    expect(await noticesOf(colleague.id)).toHaveLength(1);
  });
});

describe("the history (decided item 12)", () => {
  it("each order's event names the money action, its kind and that order's amount", async () => {
    const { branch, manager, finance } = await scene();
    const a = await order(branch.id, manager.id);
    const b = await order(branch.id, manager.id);
    const sent = input([a, b], "CASH_GIVEN", { [a.id]: "50000", [b.id]: "20000" });
    expect(await record(finance.id, sent)).toMatchObject({ ok: true });
    const [action] = await actionsOf(sent.clientKey);
    const [event] = await db
      .select({ type: orderEvents.type, payload: orderEvents.payload })
      .from(orderEvents)
      .where(and(eq(orderEvents.orderId, b.id), eq(orderEvents.type, "RECORD_MONEY")));
    expect(event!.payload).toEqual({
      money: { actionId: action!.id, kind: "CASH_GIVEN", amount: "20000" },
    });
  });
});
