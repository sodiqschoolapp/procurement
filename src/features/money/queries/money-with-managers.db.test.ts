import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertMoneyAction, insertMoneyRow } from "../../../../tests/helpers/money";
import { insertOrder } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertPurchaseRow, insertTrip } from "../../../../tests/helpers/purchases";
import { insertUser } from "../../../../tests/helpers/users";
import { getMoneyWithManagers } from "./money-with-managers";

// The page Money with managers (build plan 4.9; 08-money-and-settlement.md, Money with managers
// and Manager's cash balance; 11-screens-and-ux.md, Screens: "/money, Finance, Head"; plan of
// 4.9). The query is called directly; every order a wall or a rule keeps out has every other
// value that would let it in (.claude/rules/tests.md).

/** One money action of one row for the order's owner, dated `occurredOn`. */
async function money(
  order: { id: string; ownerId: string },
  createdBy: string,
  kind: string,
  amount: string,
  occurredOn: string,
) {
  const action = await insertMoneyAction({ managerId: order.ownerId, createdBy, occurredOn });
  const id = action.rows[0]!.id;
  await insertMoneyRow({ moneyActionId: id, orderId: order.id, kind, amount });
  return id;
}

async function scene() {
  setClock("2031-05-20T07:00:00Z");
  const a = await insertBranch();
  const b = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [a.id, b.id] });
  const financeA = await insertUser("FINANCE", { branches: [a.id] });
  const financeB = await insertUser("FINANCE", { branches: [b.id] });
  const head = await insertUser("HEAD");
  return { a, b, manager, financeA, financeB, head };
}

/** The block of one owner, by id: other tests' rows share the database. */
function blockOf(blocks: Awaited<ReturnType<typeof getMoneyWithManagers>>, ownerId: string) {
  return blocks.find((block) => block.ownerId === ownerId);
}

describe("getMoneyWithManagers: the branch wall (03 rule 1; CLAUDE.md rule 4; build plan 4.9, Done when)", () => {
  it("Finance of one branch sees no balance of another; the Head sees both", async () => {
    const { a, b, manager, financeA, financeB, head } = await scene();
    const inA = await insertOrder({ branchId: a.id, ownerId: manager.id, status: "PURCHASING" });
    const inB = await insertOrder({ branchId: b.id, ownerId: manager.id, status: "PURCHASING" });
    await money(inA, financeA.id, "CASH_GIVEN", "50000", "2031-05-10");
    // B's order is older and holds more: every value that would put it first, were it seen.
    await money(inB, financeB.id, "CASH_GIVEN", "70000", "2031-05-01");

    const seenByA = blockOf(await getMoneyWithManagers(financeA.id, null), manager.id);
    expect(seenByA).toMatchObject({ held: 50_000n, owed: 0n, since: "2031-05-10" });
    expect(seenByA!.orders.map((order) => order.id)).toEqual([inA.id]);

    const seenByHead = blockOf(await getMoneyWithManagers(head.id, null), manager.id);
    expect(seenByHead).toMatchObject({ held: 120_000n, owed: 0n, since: "2031-05-01" });
    expect(seenByHead!.orders.map((order) => order.id)).toEqual([inB.id, inA.id]);
  });

  it("Finance of A asking with branch B chosen is refused; with A chosen sees A only; the Head with B chosen sees B only", async () => {
    const { a, b, manager, financeA, financeB, head } = await scene();
    const inA = await insertOrder({ branchId: a.id, ownerId: manager.id, status: "PURCHASING" });
    const inB = await insertOrder({ branchId: b.id, ownerId: manager.id, status: "PURCHASING" });
    await money(inA, financeA.id, "CASH_GIVEN", "50000", "2031-05-10");
    await money(inB, financeB.id, "CASH_GIVEN", "70000", "2031-05-01");

    await expect(getMoneyWithManagers(financeA.id, b.id)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    const chosenA = blockOf(await getMoneyWithManagers(financeA.id, a.id), manager.id);
    expect(chosenA!.orders.map((order) => order.id)).toEqual([inA.id]);
    const chosenB = blockOf(await getMoneyWithManagers(head.id, b.id), manager.id);
    expect(chosenB!.orders.map((order) => order.id)).toEqual([inB.id]);
    expect(chosenB!.held).toBe(70_000n);
  });

  it("a malformed branch is refused as not found", async () => {
    const { financeA } = await scene();
    await expect(getMoneyWithManagers(financeA.id, "not-a-branch")).rejects.toMatchObject({
      kind: "not_found",
    });
  });
});

describe("getMoneyWithManagers: what is behind a balance (08 Money ledger; Money with managers)", () => {
  it("a cancelled action is left out of the count and of the date", async () => {
    const { a, manager, financeA } = await scene();
    const order = await insertOrder({ branchId: a.id, ownerId: manager.id, status: "PURCHASING" });
    const cancelled = await money(order, financeA.id, "CASH_GIVEN", "90000", "2031-05-01");
    await db.execute(sql`update money_actions set is_cancelled = true,
      cancel_reason = 'Invented mistake', cancelled_by = ${financeA.id},
      cancelled_at = '2031-05-02T05:00:00Z' where id = ${cancelled}`);
    await money(order, financeA.id, "CASH_GIVEN", "30000", "2031-05-08");

    const block = blockOf(await getMoneyWithManagers(financeA.id, a.id), manager.id);
    expect(block).toMatchObject({ held: 30_000n, owed: 0n, since: "2031-05-08" });
  });

  it("a Closed order with money is left out; the same order Open is listed", async () => {
    const { a, manager, financeA } = await scene();
    const closed = await insertOrder({ branchId: a.id, ownerId: manager.id, status: "CLOSED" });
    const open = await insertOrder({ branchId: a.id, ownerId: manager.id, status: "PURCHASING" });
    // Both hold 40 000 from the same date: only the status differs.
    await money(closed, financeA.id, "CASH_GIVEN", "40000", "2031-05-05");
    await money(open, financeA.id, "CASH_GIVEN", "40000", "2031-05-05");

    const block = blockOf(await getMoneyWithManagers(financeA.id, a.id), manager.id);
    expect(block!.orders.map((order) => order.id)).toEqual([open.id]);
    expect(block!.held).toBe(40_000n);
  });

  it("a cash purchase above the cash given is owed, apart from what another order holds, never netted", async () => {
    const { a, manager, financeA } = await scene();
    const holds = await insertOrder({ branchId: a.id, ownerId: manager.id, status: "PURCHASING" });
    const owed = await insertOrder({ branchId: a.id, ownerId: manager.id, status: "SETTLEMENT" });
    await money(holds, financeA.id, "CASH_GIVEN", "50000", "2031-05-06");
    await money(owed, financeA.id, "CASH_GIVEN", "20000", "2031-05-07");
    const trip = (await insertTrip(a.id, manager.id, undefined, "2031-05-04")).rows[0]!.id;
    await insertPurchaseRow({
      tripId: trip,
      orderId: owed.id,
      branchId: a.id,
      variantId: owed.variantId,
      createdBy: manager.id,
      qty: "6",
      unitPrice: "5000",
    });

    const block = blockOf(await getMoneyWithManagers(financeA.id, a.id), manager.id);
    expect(block).toMatchObject({ held: 50_000n, owed: 10_000n, since: "2031-05-04" });
    expect(block!.orders.map((order) => [order.id, order.cashCount])).toEqual([
      [owed.id, -10_000n],
      [holds.id, 50_000n],
    ]);
  });

  it("an order whose count is 0 is not listed, and its owner neither", async () => {
    const { a, financeA } = await scene();
    const settled = await insertUser("MANAGER", { branches: [a.id] });
    const order = await insertOrder({ branchId: a.id, ownerId: settled.id, status: "SETTLEMENT" });
    await money(order, financeA.id, "CASH_GIVEN", "25000", "2031-05-03");
    await money(order, financeA.id, "CASH_RETURNED", "25000", "2031-05-09");

    expect(blockOf(await getMoneyWithManagers(financeA.id, a.id), settled.id)).toBeUndefined();
  });

  it("a Head-owned Open order with cash given is listed under the Head (review of the plan, correction 1)", async () => {
    const { a, financeA, head } = await scene();
    const order = await insertOrder({ branchId: a.id, ownerId: head.id, status: "PURCHASING" });
    await money(order, financeA.id, "CASH_GIVEN", "15000", "2031-05-11");

    const block = blockOf(await getMoneyWithManagers(financeA.id, a.id), head.id);
    expect(block).toMatchObject({ held: 15_000n, ownerName: head.fullName, ownerIsActive: true });
  });

  it("a deactivated Manager who holds money is listed and marked inactive (decided item 7)", async () => {
    const { a, financeA } = await scene();
    const gone = await insertUser("MANAGER", { branches: [a.id] });
    const order = await insertOrder({ branchId: a.id, ownerId: gone.id, status: "PURCHASING" });
    await money(order, financeA.id, "CASH_GIVEN", "12000", "2031-05-11");
    await db.execute(sql`update users set is_active = false where id = ${gone.id}`);

    const block = blockOf(await getMoneyWithManagers(financeA.id, a.id), gone.id);
    expect(block).toMatchObject({ held: 12_000n, ownerIsActive: false });
  });
});

describePermissionMatrix("getMoneyWithManagers", {
  permission: "money.managers",
  run: ({ user, branchId }) => getMoneyWithManagers(user.id, branchId),
});

describe("getMoneyWithManagers with no branch chosen (11 Screens: Finance, Head)", () => {
  it("the Manager and the Principal are refused; Finance and the Head are not", async () => {
    const { a, manager, financeA, head } = await scene();
    const principal = await insertUser("PRINCIPAL", { branches: [a.id] });
    for (const user of [manager, principal]) {
      await expect(getMoneyWithManagers(user.id, null)).rejects.toBeInstanceOf(AuthorizationError);
    }
    await expect(getMoneyWithManagers(financeA.id, null)).resolves.toBeInstanceOf(Array);
    await expect(getMoneyWithManagers(head.id, null)).resolves.toBeInstanceOf(Array);
  });
});
