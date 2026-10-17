import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { AuthorizationError } from "@/server/authorize";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertFileRow } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertMoneyAction, insertMoneyRow } from "../../../../tests/helpers/money";
import { insertOrder, inventedNumber } from "../../../../tests/helpers/orders";
import { insertPurchaseRow, insertTrip } from "../../../../tests/helpers/purchases";
import { insertUser } from "../../../../tests/helpers/users";
import { getSettlement } from "./settlement";

// The settlement screen's query (build plan 4.5; 08-money-and-settlement.md, Closing 2 with its
// table and the last paragraph; edge cases "No receipt photo", "Cash was given but nothing was
// bought", "The ticked orders in settlement belong to two Managers"; 03 Permission matrix:
// "Settle and close an order with differences"; plan of 4.5, decided items 4, 5, 12 and 13). Each
// order kept out has every other value that would let it in (.claude/rules/tests.md).

async function scene() {
  setClock("2031-05-10T07:00:00Z");
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const colleague = await insertUser("MANAGER", { branches: [branch.id] });
  const finance = await insertUser("FINANCE", { branches: [branch.id] });
  return { branch, manager, colleague, finance };
}

/** A settlement order with cash given and one record on a trip of `type`, its trip id. */
async function settled(
  branchId: string,
  ownerId: string,
  financeId: string,
  options: { type?: "CASH" | "TRANSFER" | "CARD"; status?: "SETTLEMENT" | "PURCHASING" } = {},
) {
  const type = options.type ?? "CASH";
  const order = await insertOrder({
    branchId,
    ownerId,
    status: options.status ?? "SETTLEMENT",
    paymentType: type,
    progress: "DONE",
  });
  const tripId = (await insertTrip(branchId, ownerId, randomUUID(), "2031-05-02", type)).rows[0]!
    .id;
  const record = await insertPurchaseRow({
    tripId,
    orderId: order.id,
    branchId,
    variantId: order.variantId,
    createdBy: ownerId,
    qty: "10",
    unitPrice: "4000",
  });
  expect(record.rows).toHaveLength(1);
  if (type === "CASH") {
    const action = (await insertMoneyAction({ managerId: ownerId, createdBy: financeId })).rows[0]!
      .id;
    await insertMoneyRow({ moneyActionId: action, orderId: order.id, amount: "50000" });
  }
  return { ...order, tripId, recordId: record.rows[0]!.id };
}

describe("the settlement screen's query (08 Closing 2)", () => {
  it("one block per Manager; the Cash figures and the prefilled Receive row (worked example: 'Manager returns')", async () => {
    const { branch, manager, colleague, finance } = await scene();
    const mine = await settled(branch.id, manager.id, finance.id);
    const theirs = await settled(branch.id, colleague.id, finance.id, { type: "CARD" });
    const answer = await getSettlement(finance.id, [mine.id, theirs.id]);
    expect(answer).not.toBeNull();
    expect(answer!.branchCode).toBe(branch.code);
    expect(answer!.today).toBe("2031-05-10");
    expect(answer!.managers.map((m) => m.id).sort()).toEqual([manager.id, colleague.id].sort());
    const cashOrder = answer!.managers.find((m) => m.id === manager.id)!.orders[0]!;
    expect(cashOrder.blocks.cash).toEqual({
      given: 50_000n,
      spent: 40_000n,
      returned: 0n,
      paidBack: 0n,
      count: 10_000n,
    });
    expect(cashOrder.prefill).toEqual({ orderId: mine.id, kind: "CASH_RETURNED", amount: 10_000n });
    expect(cashOrder.card).toBeNull();
    const cardOrder = answer!.managers.find((m) => m.id === colleague.id)!.orders[0]!;
    expect(cardOrder.blocks.card).toMatchObject({
      planned: 50_000n,
      charged: 40_000n,
      difference: 10_000n,
    });
    expect(cardOrder.card).toEqual({ confirmed: false });
    expect(cardOrder.prefill).toBeNull();
  });

  it("another branch's order, an Open order and an unknown id are dropped; nothing left is null", async () => {
    const { branch, manager, finance } = await scene();
    const other = await insertBranch();
    const elsewhere = await insertUser("MANAGER", { branches: [other.id] });
    const kept = await settled(branch.id, manager.id, finance.id);
    const walled = await settled(other.id, elsewhere.id, finance.id);
    const open = await settled(branch.id, manager.id, finance.id, { status: "PURCHASING" });
    const answer = await getSettlement(finance.id, [kept.id, walled.id, open.id, randomUUID()]);
    expect(answer!.managers.flatMap((m) => m.orders.map((o) => o.id))).toEqual([kept.id]);
    expect(await getSettlement(finance.id, [walled.id, open.id])).toBeNull();
    expect(await getSettlement(finance.id, ["not-an-id"])).toBeNull();
  });

  it("orders of two branches are null (decided item 4, Look first)", async () => {
    const { branch, manager } = await scene();
    const other = await insertBranch();
    const finance = await insertUser("FINANCE", { branches: [branch.id, other.id] });
    const there = await insertUser("MANAGER", { branches: [other.id] });
    const a = await settled(branch.id, manager.id, finance.id);
    const b = await settled(other.id, there.id, finance.id);
    expect(await getSettlement(finance.id, [a.id])).not.toBeNull();
    expect(await getSettlement(finance.id, [b.id])).not.toBeNull();
    expect(await getSettlement(finance.id, [a.id, b.id])).toBeNull();
  });

  it("only Finance may open it (03 Permission matrix: 'Settle and close an order with differences')", async () => {
    const { branch, manager, finance } = await scene();
    const order = await settled(branch.id, manager.id, finance.id);
    const head = await insertUser("HEAD");
    const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
    for (const user of [head, principal, manager]) {
      await expect(getSettlement(user.id, [order.id])).rejects.toBeInstanceOf(AuthorizationError);
    }
  });

  it("the cancelled records are counted with their ids; 'No receipt' shows for a live record whose trip has no file (08 Closing, last paragraph; edge case 'No receipt photo')", async () => {
    const { branch, manager, finance } = await scene();
    const order = await settled(branch.id, manager.id, finance.id);
    // A second, cancelled record on a trip without a file, and a receipt on the first trip.
    const tripId = (await insertTrip(branch.id, manager.id)).rows[0]!.id;
    const cancelled = await insertPurchaseRow({
      tripId,
      orderId: order.id,
      branchId: branch.id,
      variantId: order.variantId,
      createdBy: manager.id,
    });
    await db.execute(sql`update purchases set is_cancelled = true,
      cancel_reason = 'Invented reason', cancelled_by = ${manager.id},
      cancelled_at = '2031-05-03T05:00:00Z' where id = ${cancelled.rows[0]!.id}`);
    let found = (await getSettlement(finance.id, [order.id]))!.managers[0]!.orders[0]!;
    expect(found.cancelledRecords).toEqual([cancelled.rows[0]!.id]);
    expect(found.noReceipt).toBe(true);

    const file = await insertFileRow(manager.id);
    await db.execute(sql`insert into trip_files (trip_id, file_id, created_at)
      values (${order.tripId}, ${file.id}, '2031-05-02T05:00:00Z')`);
    found = (await getSettlement(finance.id, [order.id]))!.managers[0]!.orders[0]!;
    // The only trip without a file holds a cancelled record only.
    expect(found.noReceipt).toBe(false);
  });

  it("a transfer block reports its note rule and its confirmation (08 Closing 2, Bank transfer)", async () => {
    const { branch, manager, finance } = await scene();
    const order = await settled(branch.id, manager.id, finance.id, { type: "TRANSFER" });
    const action = (await insertMoneyAction({ managerId: manager.id, createdBy: finance.id }))
      .rows[0]!.id;
    await insertMoneyRow({
      moneyActionId: action,
      orderId: order.id,
      kind: "BANK_TRANSFER",
      amount: "45000",
    });
    const found = (await getSettlement(finance.id, [order.id]))!.managers[0]!.orders[0]!;
    expect(found.blocks.transfer).toEqual({
      planned: 50_000n,
      transferred: 45_000n,
      received: 40_000n,
    });
    expect(found.transfer).toEqual({
      confirmed: false,
      ticked: false,
      note: null,
      needsNote: true,
    });
    expect(found.blocks.cash).toBeNull();
  });

  it("a numbered Draft is dropped (the draft wall; .claude/rules/tests.md)", async () => {
    const { branch, manager, finance } = await scene();
    // Every other value lets it in: the same branch and a number (a taken-back order keeps it).
    const draft = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "DRAFT",
      number: inventedNumber(),
    });
    const kept = await settled(branch.id, manager.id, finance.id);
    const answer = await getSettlement(finance.id, [draft.id, kept.id]);
    expect(answer!.managers.flatMap((m) => m.orders.map((o) => o.id))).toEqual([kept.id]);
    expect(await getSettlement(finance.id, [draft.id])).toBeNull();
  });
});
