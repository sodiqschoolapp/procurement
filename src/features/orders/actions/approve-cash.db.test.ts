import { randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import type { RequestStatus } from "@/domain/request-status";
import { db } from "@/server/db/client";
import { moneyActions, moneyRows, notifications, orderActions, orders } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertOrder } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { approveOrders } from "./approve";

// Finance approval with cash, build plan 4.2 (Done when: the three orders of the worked example
// with 650 000 make one action with rows 520 000, 100 000 and 30 000 and open all three; orders of
// two Managers make two actions; a failure rolls back the approval and the cash) and the plan's
// Tests: 08-money-and-settlement.md (When Finance approves; Money ledger 1; Worked example, "Three
// orders, one action"), 06-approval-workflow.md (Allowed moves: Waiting for Finance, Approve; rule
// 8), 03-roles-and-permissions.md (matrix: "Record money given, returned, paid back"),
// 10-notifications-analytics-reports.md (Notifications: "Cash given"), developer-rules.md rules 3
// and 8, and the review of the plan, corrections 2 and 3. Every passing case has the refused data
// beside it (D40); every fixture is asserted (D38).

type Ticked = { id: string; version: number };

function ticked(list: readonly Ticked[], cash?: Record<string, string>, clientKey = randomUUID()) {
  return {
    clientKey,
    orders: list.map(({ id, version }) => ({ id, version })),
    ...(cash ? { cash } : {}),
  };
}

function approve(userId: string, input: unknown) {
  return runOrdersAction(approveOrders, userId, input);
}

/** A branch with its Finance user and two Managers, and a Head of all branches. */
async function scene() {
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const colleague = await insertUser("MANAGER", { branches: [branch.id] });
  const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
  const finance = await insertUser("FINANCE", { branches: [branch.id] });
  const head = await insertUser("HEAD");
  return { branch, manager, colleague, principal, finance, head };
}

/** One order waiting for Finance with a planned total of qty × 5 000 so'm. */
function order(
  branchId: string,
  ownerId: string,
  qty: string,
  options: { status?: RequestStatus; paymentType?: "CASH" | "TRANSFER" | "CARD" } = {},
) {
  return insertOrder({
    branchId,
    ownerId,
    status: options.status ?? "PENDING_FINANCE",
    plannedQty: qty,
    plannedPrice: 5_000n,
    paymentType: options.paymentType ?? "CASH",
  });
}

async function statusesOf(ids: readonly string[]) {
  const rows = await db
    .select({ id: orders.id, status: orders.status, version: orders.version })
    .from(orders)
    .where(inArray(orders.id, [...ids]));
  return new Map(rows.map((row) => [row.id, { status: row.status, version: row.version }]));
}

/** The money actions of a browser id, each with its rows by order. */
async function cashOf(clientKey: string) {
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
    rows: Object.fromEntries(
      rows
        .filter((row) => row.moneyActionId === action.id)
        .map((row) => [row.orderId, { kind: row.kind, amount: row.amount }]),
    ),
  }));
}

async function noticesOf(userId: string, type: (typeof notifications.$inferSelect)["type"]) {
  return db
    .select({ params: notifications.params, link: notifications.link })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, type)));
}

function expectOk(result: Awaited<ReturnType<typeof approve>>) {
  expect(result).toMatchObject({ ok: true });
  return (result as Extract<typeof result, { ok: true }>).data;
}

function expectRefused(result: Awaited<ReturnType<typeof approve>>) {
  expect(result.ok).toBe(false);
  return (result as Extract<typeof result, { ok: false }>).error;
}

/** Nothing of a refused call was written: no approval, no cash, the orders as they were. */
async function nothingSaved(clientKey: string, list: readonly Ticked[], status: RequestStatus) {
  expect(await db.select().from(orderActions).where(eq(orderActions.clientKey, clientKey))).toEqual(
    [],
  );
  expect(await cashOf(clientKey)).toEqual([]);
  const states = await statusesOf(list.map((each) => each.id));
  for (const each of list) {
    expect(states.get(each.id)).toEqual({ status, version: each.version });
  }
}

describe("the cash is saved with the approval (08 When Finance approves; Worked example)", () => {
  it("three orders with 650 000: one action, rows 520 000, 100 000 and 30 000, all three Open", async () => {
    // 20:30 UTC is already the next day in Tashkent (CLAUDE.md rule 10).
    setClock("2026-10-17T20:30:00Z");
    const { branch, manager, finance } = await scene();
    const notebooks = await order(branch.id, manager.id, "104.000"); // 520 000
    const pens = await order(branch.id, manager.id, "20.000"); // 100 000
    const folders = await order(branch.id, manager.id, "6.000"); // 30 000
    const three = [notebooks, pens, folders];
    const input = ticked(three, {
      [notebooks.id]: "520 000",
      [pens.id]: "100000",
      [folders.id]: "30000",
    });

    const result = expectOk(await approve(finance.id, input));

    for (const each of result.orders) expect(each.status).toBe("PURCHASING");
    const [action, ...more] = await cashOf(input.clientKey);
    expect(more).toEqual([]);
    expect(action).toMatchObject({
      clientKey: input.clientKey,
      orderActionId: result.actionId,
      managerId: manager.id,
      occurredOn: "2026-10-18",
      documentNo: null,
      fileId: null,
      supplierId: null,
      comment: null,
      isCancelled: false,
      createdBy: finance.id,
    });
    expect(action!.rows).toEqual({
      [notebooks.id]: { kind: "CASH_GIVEN", amount: 520_000n },
      [pens.id]: { kind: "CASH_GIVEN", amount: 100_000n },
      [folders.id]: { kind: "CASH_GIVEN", amount: 30_000n },
    });
    const total = Object.values(action!.rows).reduce((sum, row) => sum + row.amount, 0n);
    expect(total).toBe(650_000n);
  });

  it("orders of two Managers make two actions with one browser id, each with its own rows (08 Money ledger 1)", async () => {
    const { branch, manager, colleague, finance } = await scene();
    const mine = await order(branch.id, manager.id, "10.000");
    const theirs = await order(branch.id, colleague.id, "4.000");
    const input = ticked([mine, theirs], { [mine.id]: "50000", [theirs.id]: "20000" });

    expectOk(await approve(finance.id, input));

    const actions = await cashOf(input.clientKey);
    expect(actions).toHaveLength(2);
    const byManager = new Map(actions.map((action) => [action.managerId, action.rows]));
    expect(byManager.get(manager.id)).toEqual({
      [mine.id]: { kind: "CASH_GIVEN", amount: 50_000n },
    });
    expect(byManager.get(colleague.id)).toEqual({
      [theirs.id]: { kind: "CASH_GIVEN", amount: 20_000n },
    });
  });

  it("rows of 0 write nothing: one row at 0 writes the others; all at 0 or no cash write no action", async () => {
    const { branch, manager, colleague, finance } = await scene();
    const given = await order(branch.id, manager.id, "10.000");
    const later = await order(branch.id, manager.id, "4.000");
    const zero = await order(branch.id, colleague.id, "2.000");
    const input = ticked([given, later, zero], {
      [given.id]: "50000",
      [later.id]: "0",
      [zero.id]: "0",
    });
    expectOk(await approve(finance.id, input));
    const [action, ...more] = await cashOf(input.clientKey);
    expect(more).toEqual([]);
    expect(action!.managerId).toBe(manager.id);
    expect(action!.rows).toEqual({ [given.id]: { kind: "CASH_GIVEN", amount: 50_000n } });

    const allZero = await order(branch.id, manager.id, "1.000");
    const zeroInput = ticked([allZero], { [allZero.id]: "0" });
    expectOk(await approve(finance.id, zeroInput));
    expect(await cashOf(zeroInput.clientKey)).toEqual([]);

    const noCash = await order(branch.id, manager.id, "1.000");
    const noCashInput = ticked([noCash]);
    expectOk(await approve(finance.id, noCashInput));
    expect(await cashOf(noCashInput.clientKey)).toEqual([]);
    const states = await statusesOf([allZero.id, noCash.id]);
    expect(states.get(allZero.id)?.status).toBe("PURCHASING");
    expect(states.get(noCash.id)?.status).toBe("PURCHASING");
  });

  it("Finance can change any row: more than planned is saved as typed, and a Transfer order changed to Cash gets its row", async () => {
    const { branch, manager, finance } = await scene();
    const cash = await order(branch.id, manager.id, "10.000"); // 50 000 planned
    const transfer = await order(branch.id, manager.id, "2.000", { paymentType: "TRANSFER" });
    const input = {
      ...ticked([cash, transfer], { [cash.id]: "70000", [transfer.id]: "10000" }),
      paymentTypes: { [transfer.id]: "CASH" },
    };
    expectOk(await approve(finance.id, input));
    const [action] = await cashOf(input.clientKey);
    expect(action!.rows).toEqual({
      [cash.id]: { kind: "CASH_GIVEN", amount: 70_000n },
      [transfer.id]: { kind: "CASH_GIVEN", amount: 10_000n },
    });
    const [changed] = await db
      .select({ paymentType: orders.paymentType })
      .from(orders)
      .where(eq(orders.id, transfer.id));
    expect(changed!.paymentType).toBe("CASH");
  });
});

describe("all or nothing (06 rule 8; developer-rules.md rule 3)", () => {
  it("one of three orders at an old version: nothing approved and no cash", async () => {
    const { branch, manager, finance } = await scene();
    const three = [
      await order(branch.id, manager.id, "10.000"),
      await order(branch.id, manager.id, "4.000"),
      await order(branch.id, manager.id, "2.000"),
    ];
    const sent = three.map((each, at) => ({
      id: each.id,
      version: at === 2 ? each.version + 1 : each.version,
    }));
    const input = ticked(sent, Object.fromEntries(three.map((each) => [each.id, "10000"])));
    const error = expectRefused(await approve(finance.id, input));
    expect(error.code).toBe("stale_version");
    expect(error.orders).toEqual([{ orderId: three[2]!.id, code: "stale_version" }]);
    await nothingSaved(input.clientKey, three, "PENDING_FINANCE");
  });

  it("a failure at the money write itself rolls back the approval and the cash", async () => {
    const { branch, manager, finance } = await scene();
    const three = [
      await order(branch.id, manager.id, "10.000"),
      await order(branch.id, manager.id, "4.000"),
      await order(branch.id, manager.id, "2.000"),
    ];
    const failing = three[1]!.id;
    // A trigger of this test only, made and dropped here: the row of one order cannot be written.
    await db.execute(
      sql.raw(`create function test_refuse_money_row() returns trigger language plpgsql as $$
        begin
          if new.order_id = '${failing}' then raise exception 'test: money row refused'; end if;
          return new;
        end $$`),
    );
    await db.execute(
      sql.raw(`create trigger test_refuse_money_row before insert on money_rows
        for each row execute function test_refuse_money_row()`),
    );
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const input = ticked(three, Object.fromEntries(three.map((each) => [each.id, "10000"])));
      const error = expectRefused(await approve(finance.id, input));
      expect(error.code).toBe("unexpected");
      await nothingSaved(input.clientKey, three, "PENDING_FINANCE");
    } finally {
      logged.mockRestore();
      await db.execute(sql.raw("drop trigger test_refuse_money_row on money_rows"));
      await db.execute(sql.raw("drop function test_refuse_money_row()"));
    }
  });

  it("the same browser id again returns the first result and writes no second action (rule 8)", async () => {
    const { branch, manager, finance } = await scene();
    const one = await order(branch.id, manager.id, "10.000");
    const input = ticked([one], { [one.id]: "50000" });
    const first = expectOk(await approve(finance.id, input));
    const again = expectOk(await approve(finance.id, input));
    expect(again).toEqual(first);
    const actions = await cashOf(input.clientKey);
    expect(actions).toHaveLength(1);
    expect(actions[0]!.rows).toEqual({ [one.id]: { kind: "CASH_GIVEN", amount: 50_000n } });
  });
});

describe("who may give cash, and where (03 matrix: money.record; rules 1, 8; review of the plan, correction 2)", () => {
  it("cash sent by the Principal at the Principal's step is forbidden; without it the same orders approve", async () => {
    const { branch, manager, principal } = await scene();
    const one = await order(branch.id, manager.id, "10.000", { status: "PENDING_PRINCIPAL" });
    const input = ticked([one], { [one.id]: "50000" });
    const error = expectRefused(await approve(principal.id, input));
    expect(error.code).toBe("forbidden");
    expect(error.orders).toEqual([{ orderId: one.id, code: "forbidden" }]);
    await nothingSaved(input.clientKey, [one], "PENDING_PRINCIPAL");
    expectOk(await approve(principal.id, ticked([one])));
  });

  it("cash sent by the Head at the Head's step is forbidden", async () => {
    const { branch, manager, head } = await scene();
    const one = await order(branch.id, manager.id, "10.000", { status: "PENDING_HEAD" });
    const input = ticked([one], { [one.id]: "50000" });
    const error = expectRefused(await approve(head.id, input));
    expect(error.code).toBe("forbidden");
    await nothingSaved(input.clientKey, [one], "PENDING_HEAD");
  });

  it("an order of another branch beside Finance's own, with cash, is not_found and nothing is written", async () => {
    const { branch, manager, finance } = await scene();
    const other = await insertBranch();
    const stranger = await insertUser("MANAGER", { branches: [other.id] });
    await insertUser("FINANCE", { branches: [other.id] });
    const own = await order(branch.id, manager.id, "10.000");
    const foreign = await order(other.id, stranger.id, "10.000");
    const input = ticked([own, foreign], { [own.id]: "50000", [foreign.id]: "50000" });
    const error = expectRefused(await approve(finance.id, input));
    expect(error.code).toBe("not_found");
    expect(error.orders).toEqual([{ orderId: foreign.id, code: "not_found" }]);
    await nothingSaved(input.clientKey, [own, foreign], "PENDING_FINANCE");
  });

  it("cash naming an order that is not ticked, or an amount not whole so'm, is invalid_input", async () => {
    const { branch, manager, finance } = await scene();
    const one = await order(branch.id, manager.id, "10.000");
    const outside = await order(branch.id, manager.id, "10.000");
    for (const cash of [
      { [outside.id]: "50000" },
      { [one.id]: "-5" },
      { [one.id]: "1.5" },
      { [one.id]: "abc" },
      { [one.id]: "" },
    ]) {
      const input = ticked([one], cash);
      expect(expectRefused(await approve(finance.id, input)).code).toBe("invalid_input");
      await nothingSaved(input.clientKey, [one], "PENDING_FINANCE");
    }
    expect((await statusesOf([outside.id])).get(outside.id)?.status).toBe("PENDING_FINANCE");
  });

  it("one Manager's cash in two branches is refused whole; cash in one of them only is one action of that branch (decided item 5)", async () => {
    const east = await insertBranch();
    const west = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [east.id, west.id] });
    const finance = await insertUser("FINANCE", { branches: [east.id, west.id] });
    const inEast = await order(east.id, manager.id, "10.000");
    const inWest = await order(west.id, manager.id, "4.000");

    const both = ticked([inEast, inWest], { [inEast.id]: "50000", [inWest.id]: "20000" });
    const error = expectRefused(await approve(finance.id, both));
    expect(error.code).toBe("invalid_input");
    expect(error.fields).toEqual({ cash: "errors.field.cashOneBranch" });
    await nothingSaved(both.clientKey, [inEast, inWest], "PENDING_FINANCE");

    const oneBranch = ticked([inEast, inWest], { [inEast.id]: "50000", [inWest.id]: "0" });
    expectOk(await approve(finance.id, oneBranch));
    const [action, ...more] = await cashOf(oneBranch.clientKey);
    expect(more).toEqual([]);
    expect(action!.rows).toEqual({ [inEast.id]: { kind: "CASH_GIVEN", amount: 50_000n } });
  });
});

describe("who is told (10 Notifications: Finance approved; Cash given; decided item 4)", () => {
  it("two Managers in one branch, one given cash: he gets CASH_GIVEN only, the other and the Head the approval", async () => {
    const { branch, manager, colleague, finance, head } = await scene();
    const mine = [
      await order(branch.id, manager.id, "10.000"),
      await order(branch.id, manager.id, "4.000"),
    ];
    const theirs = await order(branch.id, colleague.id, "2.000");
    const input = ticked([...mine, theirs], {
      [mine[0]!.id]: "50000",
      [mine[1]!.id]: "20000",
      [theirs.id]: "0",
    });
    const result = expectOk(await approve(finance.id, input));

    const cashNotices = await noticesOf(manager.id, "CASH_GIVEN");
    expect(cashNotices).toHaveLength(1);
    expect(cashNotices[0]!.params).toMatchObject({
      count: 3,
      branch: branch.code,
      amount: "70000",
    });
    expect(cashNotices[0]!.link).toBe(
      `/orders?${new URLSearchParams({ branch: branch.id, action: result.actionId }).toString()}`,
    );
    expect(await noticesOf(manager.id, "REQUEST_FINANCE_APPROVED")).toEqual([]);

    expect(await noticesOf(colleague.id, "CASH_GIVEN")).toEqual([]);
    expect(await noticesOf(colleague.id, "REQUEST_FINANCE_APPROVED")).toHaveLength(1);
    expect(await noticesOf(head.id, "CASH_GIVEN")).toEqual([]);
    expect(await noticesOf(head.id, "REQUEST_FINANCE_APPROVED")).toHaveLength(1);
    expect(await noticesOf(finance.id, "CASH_GIVEN")).toEqual([]);
  });

  it("a Manager given cash in one of two branches: CASH_GIVEN for that branch, the approval for the other", async () => {
    const east = await insertBranch();
    const west = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [east.id, west.id] });
    const finance = await insertUser("FINANCE", { branches: [east.id, west.id] });
    const inEast = await order(east.id, manager.id, "10.000");
    const inWest = await order(west.id, manager.id, "4.000");
    expectOk(await approve(finance.id, ticked([inEast, inWest], { [inEast.id]: "50000" })));
    const cash = await noticesOf(manager.id, "CASH_GIVEN");
    expect(cash.map((notice) => notice.params)).toEqual([
      expect.objectContaining({ branch: east.code, count: 1, amount: "50000" }),
    ]);
    const approved = await noticesOf(manager.id, "REQUEST_FINANCE_APPROVED");
    expect(approved.map((notice) => notice.params)).toEqual([
      expect.objectContaining({ branch: west.code, count: 1 }),
    ]);
  });

  it("no cash, no CASH_GIVEN: the owner gets the approval as before", async () => {
    const { branch, manager, finance } = await scene();
    const one = await order(branch.id, manager.id, "10.000");
    expectOk(await approve(finance.id, ticked([one], { [one.id]: "0" })));
    expect(await noticesOf(manager.id, "CASH_GIVEN")).toEqual([]);
    expect(await noticesOf(manager.id, "REQUEST_FINANCE_APPROVED")).toHaveLength(1);
  });
});
