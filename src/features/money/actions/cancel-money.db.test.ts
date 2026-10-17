import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { MoneyRowKind } from "@/domain/money-ledger";
import { db } from "@/server/db/client";
import { moneyActions, orderEvents, orders } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertOrder, setOrderStatus } from "../../../../tests/helpers/orders";
import { insertPurchaseRow, insertTrip } from "../../../../tests/helpers/purchases";
import { insertUser } from "../../../../tests/helpers/users";
import { approveOrders } from "../../orders/actions/approve";
import { getOrderMoney } from "../queries/order-money";
import { cancelMoney } from "./cancel-money";
import { recordMoney } from "./record-money";

// Cancel a money action (build plan 4.3; Done when: "a cancelled action leaves every count as it
// was before") and the plan's Tests: 08-money-and-settlement.md (Money ledger: "a wrong one is
// cancelled whole, with a reason, while none of its orders is Closed … the Head reopens that order
// first"; Order's cash count), Decided ahead question 3 (the cancel fills its fields once), edge
// case "A money action must be cancelled but one of its orders is already Closed", and the
// decided items 9 and 10 of the plan of 4.3. Every passing case has the refused data beside it
// (D40); every fixture is asserted (D38).

const REASON = "Typed the wrong amount";

async function scene() {
  setClock("2031-05-10T07:00:00Z");
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const finance = await insertUser("FINANCE", { branches: [branch.id] });
  return { branch, manager, finance };
}

async function versionsOf(ids: readonly string[]) {
  const rows = await db
    .select({ id: orders.id, version: orders.version })
    .from(orders)
    .where(inArray(orders.id, [...ids]));
  return new Map(rows.map((row) => [row.id, row.version]));
}

/** Finance records money on the orders through the action; the action's id. */
async function recorded(
  financeId: string,
  ids: readonly string[],
  kind: MoneyRowKind,
  amount: string,
): Promise<string> {
  const versions = await versionsOf(ids);
  const clientKey = randomUUID();
  const result = await runOrdersAction(recordMoney, financeId, {
    clientKey,
    orders: ids.map((id) => ({ id, version: versions.get(id)! })),
    kind,
    occurredOn: "2031-05-10",
    comment: "Invented money",
    amounts: Object.fromEntries(ids.map((id) => [id, amount])),
  });
  expect(result).toMatchObject({ ok: true });
  const [action] = await db
    .select({ id: moneyActions.id })
    .from(moneyActions)
    .where(eq(moneyActions.clientKey, clientKey));
  return action!.id;
}

async function cancel(
  userId: string,
  moneyActionId: string,
  ids: readonly string[],
  reason = REASON,
) {
  const versions = await versionsOf(ids);
  return runOrdersAction(cancelMoney, userId, {
    clientKey: randomUUID(),
    moneyActionId,
    orders: ids.map((id) => ({ id, version: versions.get(id)! })),
    reason,
  });
}

async function countsOf(userId: string, ids: readonly string[]) {
  const counts: bigint[] = [];
  for (const id of ids) {
    const money = await getOrderMoney(userId, id);
    expect(money).not.toBeNull();
    counts.push(money!.count);
  }
  return counts;
}

async function actionRow(id: string) {
  const [row] = await db.select().from(moneyActions).where(eq(moneyActions.id, id));
  return row!;
}

describe("Cancel a money action (08 Money ledger; Decided ahead, question 3)", () => {
  it("a cancelled action leaves every count as it was before (build plan 4.3, Done when)", async () => {
    const { branch, manager, finance } = await scene();
    const a = await insertOrder({ branchId: branch.id, ownerId: manager.id, status: "PURCHASING" });
    const b = await insertOrder({ branchId: branch.id, ownerId: manager.id, status: "PURCHASING" });
    // A Cash purchase and an earlier action beside it stay counted (08 Order's cash count).
    const trip = (await insertTrip(branch.id, manager.id)).rows[0]!.id;
    await insertPurchaseRow({
      tripId: trip,
      orderId: a.id,
      branchId: branch.id,
      variantId: a.variantId,
      createdBy: manager.id,
      qty: "2",
    });
    await recorded(finance.id, [a.id], "CASH_GIVEN", "30000");
    const before = await countsOf(finance.id, [a.id, b.id]);
    expect(before).toEqual([20_000n, 0n]);

    for (const kind of ["CASH_GIVEN", "PAID_BACK", "BANK_TRANSFER"] as const) {
      const amount = kind === "PAID_BACK" ? "1" : "40000";
      const ids = kind === "PAID_BACK" ? [b.id] : [a.id, b.id];
      if (kind === "PAID_BACK") {
        await insertPurchaseRow({
          tripId: trip,
          orderId: b.id,
          branchId: branch.id,
          variantId: b.variantId,
          createdBy: manager.id,
          qty: "1",
        });
      }
      const start = await countsOf(finance.id, [a.id, b.id]);
      const action = await recorded(finance.id, ids, kind, amount);
      expect(await cancel(finance.id, action, ids)).toMatchObject({ ok: true });
      expect(await countsOf(finance.id, [a.id, b.id])).toEqual(start);
    }
  });

  it("fills the cancel fields once and changes nothing else; a second cancel is refused", async () => {
    const { branch, manager, finance } = await scene();
    const a = await insertOrder({ branchId: branch.id, ownerId: manager.id, status: "PURCHASING" });
    const action = await recorded(finance.id, [a.id], "CASH_GIVEN", "50000");
    const before = await actionRow(action);
    setClock("2031-05-11T08:30:00Z");
    expect(await cancel(finance.id, action, [a.id], `  ${REASON}  `)).toMatchObject({ ok: true });
    const after = await actionRow(action);
    expect(after).toEqual({
      ...before,
      isCancelled: true,
      cancelReason: REASON,
      cancelledBy: finance.id,
      cancelledAt: new Date("2031-05-11T08:30:00Z"),
    });
    expect(await cancel(finance.id, action, [a.id])).toMatchObject({
      ok: false,
      error: { code: "wrong_status", orders: [{ orderId: a.id, code: "wrong_status" }] },
    });
  });

  it("an action of three orders, one Closed, is refused: nothing cancelled, no version raised (the Head reopens it first)", async () => {
    const { branch, manager, finance } = await scene();
    const ids: string[] = [];
    for (let at = 0; at < 3; at += 1) {
      ids.push(
        (await insertOrder({ branchId: branch.id, ownerId: manager.id, status: "PURCHASING" })).id,
      );
    }
    const action = await recorded(finance.id, ids, "CASH_GIVEN", "10000");
    await setOrderStatus(ids[1]!, "CLOSED");
    const versions = await versionsOf(ids);
    expect(await cancel(finance.id, action, ids)).toMatchObject({
      ok: false,
      error: {
        code: "wrong_status",
        orders: [
          {
            orderId: ids[1],
            code: "wrong_status",
            fields: { status: "errors.field.closedReopenFirst" },
          },
        ],
      },
    });
    expect((await actionRow(action)).isCancelled).toBe(false);
    expect(await versionsOf(ids)).toEqual(versions);
  });

  it("orders that are not exactly the action's are refused (decided item 10)", async () => {
    const { branch, manager, finance } = await scene();
    const a = await insertOrder({ branchId: branch.id, ownerId: manager.id, status: "PURCHASING" });
    const b = await insertOrder({ branchId: branch.id, ownerId: manager.id, status: "PURCHASING" });
    const c = await insertOrder({ branchId: branch.id, ownerId: manager.id, status: "PURCHASING" });
    const action = await recorded(finance.id, [a.id, b.id], "CASH_GIVEN", "10000");
    for (const sent of [[a.id], [a.id, b.id, c.id]]) {
      expect(await cancel(finance.id, action, sent)).toMatchObject({
        ok: false,
        error: { code: "invalid_input" },
      });
    }
    expect((await actionRow(action)).isCancelled).toBe(false);
    expect(await cancel(finance.id, action, [a.id, b.id])).toMatchObject({ ok: true });
  });

  it("an own order sent with another branch's real action id is Not found, nothing cancelled (permission review of 3.7)", async () => {
    const { branch, manager, finance } = await scene();
    const other = await insertBranch();
    const stranger = await insertUser("MANAGER", { branches: [other.id] });
    const theirFinance = await insertUser("FINANCE", { branches: [other.id] });
    const theirs = await insertOrder({
      branchId: other.id,
      ownerId: stranger.id,
      status: "PURCHASING",
    });
    const theirAction = await recorded(theirFinance.id, [theirs.id], "CASH_GIVEN", "10000");
    // The caller's own order, Open, with a live action of its own: everything else would pass.
    const own = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PURCHASING",
    });
    await recorded(finance.id, [own.id], "CASH_GIVEN", "10000");
    expect(await cancel(finance.id, theirAction, [own.id])).toMatchObject({
      ok: false,
      error: { code: "not_found", orders: [{ orderId: own.id, code: "not_found" }] },
    });
    expect((await actionRow(theirAction)).isCancelled).toBe(false);
  });

  it("the approval's cash action can be cancelled (08 Money ledger: every action)", async () => {
    const { branch, manager, finance } = await scene();
    const a = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PENDING_FINANCE",
    });
    const clientKey = randomUUID();
    expect(
      await runOrdersAction(approveOrders, finance.id, {
        clientKey,
        orders: [{ id: a.id, version: a.version }],
        cash: { [a.id]: "50000" },
      }),
    ).toMatchObject({ ok: true });
    const [given] = await db
      .select({ id: moneyActions.id })
      .from(moneyActions)
      .where(eq(moneyActions.clientKey, clientKey));
    expect(await countsOf(finance.id, [a.id])).toEqual([50_000n]);
    expect(await cancel(finance.id, given!.id, [a.id])).toMatchObject({ ok: true });
    expect(await countsOf(finance.id, [a.id])).toEqual([0n]);
  });

  it("a reason under 5 characters is refused (06 rule 3; decided item 9); the history event carries the reason", async () => {
    const { branch, manager, finance } = await scene();
    const a = await insertOrder({ branchId: branch.id, ownerId: manager.id, status: "PURCHASING" });
    const action = await recorded(finance.id, [a.id], "CASH_GIVEN", "10000");
    expect(await cancel(finance.id, action, [a.id], "abcd")).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    expect((await actionRow(action)).isCancelled).toBe(false);
    expect(await cancel(finance.id, action, [a.id], "abcde")).toMatchObject({ ok: true });
    const [event] = await db
      .select({ comment: orderEvents.comment, payload: orderEvents.payload })
      .from(orderEvents)
      .where(and(eq(orderEvents.orderId, a.id), eq(orderEvents.type, "CANCEL_MONEY")));
    expect(event).toEqual({ comment: "abcde", payload: { money: { actionId: action } } });
  });
});
