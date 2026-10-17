import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { blockConfirmed } from "@/domain/money-ledger";
import type { RequestStatus } from "@/domain/request-status";
import { db } from "@/server/db/client";
import { orderEvents, orderSettlements } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertMoneyAction, insertMoneyRow } from "../../../../tests/helpers/money";
import { insertOrder } from "../../../../tests/helpers/orders";
import { insertPurchaseRow, insertTrip } from "../../../../tests/helpers/purchases";
import { insertUser } from "../../../../tests/helpers/users";
import { settlementFactsOf } from "../settlement-facts";
import { confirmSettlement } from "./confirm-settlement";
import { recordMoney } from "./record-money";

// "Confirmed" of the Bank transfer and Corporate card blocks (build plan 4.5, Done when: "a
// transfer mismatch without a note cannot be confirmed"; 08-money-and-settlement.md, Closing 2;
// A11; plan of 4.5, decided items 9 to 11, and the review's Must fix 1). Every passing case has
// the refused data beside it (D40); every fixture is asserted (D38).

async function scene() {
  setClock("2031-05-10T07:00:00Z");
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const finance = await insertUser("FINANCE", { branches: [branch.id] });
  return { branch, manager, finance };
}

/**
 * An order planned 10 × 50 000 by `type`, bought 10 × `unitPrice` on a trip of that type,
 * Waiting for settlement, with `transferred` in Bank transfer rows.
 */
async function paidOrder(
  s: Awaited<ReturnType<typeof scene>>,
  type: "TRANSFER" | "CARD" | "CASH",
  unitPrice: string,
  transferred: string | null,
  status: RequestStatus = "SETTLEMENT",
) {
  const order = await insertOrder({
    branchId: s.branch.id,
    ownerId: s.manager.id,
    status,
    plannedQty: "10",
    plannedPrice: 50_000n,
    paymentType: type,
    progress: "DONE",
  });
  const trip = (await insertTrip(s.branch.id, s.manager.id, randomUUID(), "2031-05-02", type))
    .rows[0]!.id;
  const record = await insertPurchaseRow({
    tripId: trip,
    orderId: order.id,
    branchId: s.branch.id,
    variantId: order.variantId,
    createdBy: s.manager.id,
    qty: "10",
    unitPrice,
  });
  expect(record.rows).toHaveLength(1);
  if (transferred !== null) {
    const action = (await insertMoneyAction({ managerId: s.manager.id, createdBy: s.finance.id }))
      .rows[0]!.id;
    await insertMoneyRow({
      moneyActionId: action,
      orderId: order.id,
      kind: "BANK_TRANSFER",
      amount: transferred,
    });
  }
  return order;
}

function input(
  ticked: readonly { id: string; version: number }[],
  block: "TRANSFER" | "CARD",
  confirmed: boolean,
  notes?: Record<string, string>,
) {
  return {
    clientKey: randomUUID(),
    orders: ticked.map(({ id, version }) => ({ id, version })),
    block,
    confirmed,
    ...(notes ? { notes } : {}),
  };
}

function confirm(userId: string, value: unknown) {
  return runOrdersAction(confirmSettlement, userId, value);
}

async function stored(orderId: string) {
  const [row] = await db
    .select()
    .from(orderSettlements)
    .where(eq(orderSettlements.orderId, orderId));
  return row ?? null;
}

describe("Confirmed per order (08 Closing 2, Bank transfer and Corporate card)", () => {
  it("a transfer mismatch without a note cannot be confirmed; with a note it can (Done when)", async () => {
    const s = await scene();
    // Transferred 500 000; goods received 10 × 48 000 = 480 000.
    const order = await paidOrder(s, "TRANSFER", "48000", "500000");
    const bare = await confirm(s.finance.id, input([order], "TRANSFER", true));
    expect(bare).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { note: "errors.field.noteRequired" } },
    });
    expect(await stored(order.id)).toBeNull();
    // A note of spaces is no note.
    const blank = await confirm(
      s.finance.id,
      input([order], "TRANSFER", true, { [order.id]: "  " }),
    );
    expect(blank).toMatchObject({ ok: false, error: { code: "invalid_input" } });

    const noted = await confirm(
      s.finance.id,
      input([order], "TRANSFER", true, { [order.id]: " The supplier owes a refund of 20 000 " }),
    );
    expect(noted).toMatchObject({ ok: true });
    expect(await stored(order.id)).toMatchObject({
      transferConfirmedBy: s.finance.id,
      transferConfirmedAt: new Date("2031-05-10T07:00:00Z"),
      transferNote: "The supplier owes a refund of 20 000",
      cardConfirmedBy: null,
    });
    const [event] = await db
      .select({ payload: orderEvents.payload })
      .from(orderEvents)
      .where(and(eq(orderEvents.orderId, order.id), eq(orderEvents.type, "CONFIRM_SETTLEMENT")));
    expect(event!.payload).toMatchObject({
      settlement: {
        block: "TRANSFER",
        confirmed: true,
        note: "The supplier owes a refund of 20 000",
      },
    });
  });

  it("a transfer whose amounts match is confirmed without a note (decided item 11)", async () => {
    const s = await scene();
    const order = await paidOrder(s, "TRANSFER", "50000", "500000");
    expect(await confirm(s.finance.id, input([order], "TRANSFER", true))).toMatchObject({
      ok: true,
    });
    expect(await stored(order.id)).toMatchObject({ transferNote: null });
    expect((await stored(order.id))!.transferConfirmedAt).not.toBeNull();
  });

  it("a confirmed matching transfer, then another Bank transfer recorded: the block reads not confirmed (review of the plan, Must fix 1; decided item 9, Look first)", async () => {
    const s = await scene();
    const order = await paidOrder(s, "TRANSFER", "50000", "500000");
    const first = await confirm(s.finance.id, input([order], "TRANSFER", true));
    expect(first).toMatchObject({ ok: true });
    let facts = (await settlementFactsOf(db, [order.id])).get(order.id)!;
    expect(blockConfirmed("TRANSFER", facts.blocks, facts.stored)).toBe(true);

    const more = await runOrdersAction(recordMoney, s.finance.id, {
      clientKey: randomUUID(),
      orders: [{ id: order.id, version: order.version + 1 }],
      kind: "BANK_TRANSFER",
      occurredOn: "2031-05-10",
      comment: "Invented second transfer",
      amounts: { [order.id]: "10000" },
    });
    expect(more).toMatchObject({ ok: true });
    facts = (await settlementFactsOf(db, [order.id])).get(order.id)!;
    expect(facts.blocks.transfer).toMatchObject({ transferred: 510_000n, received: 500_000n });
    expect(blockConfirmed("TRANSFER", facts.blocks, facts.stored)).toBe(false);
  });

  it("the card block is confirmed and unticked; unticking clears by and at (decided item 10)", async () => {
    const s = await scene();
    const order = await paidOrder(s, "CARD", "46000", null);
    expect(await confirm(s.finance.id, input([order], "CARD", true))).toMatchObject({ ok: true });
    expect((await stored(order.id))!.cardConfirmedBy).toBe(s.finance.id);
    const untick = await confirm(
      s.finance.id,
      input([{ id: order.id, version: order.version + 1 }], "CARD", false),
    );
    expect(untick).toMatchObject({ ok: true });
    expect(await stored(order.id)).toMatchObject({ cardConfirmedBy: null, cardConfirmedAt: null });
  });

  it("an order without the block is refused not_ready, and nothing is written (08: a block for each type used)", async () => {
    const s = await scene();
    const cash = await paidOrder(s, "CASH", "50000", null);
    const card = await paidOrder(s, "CARD", "50000", null);
    const answer = await confirm(s.finance.id, input([cash, card], "CARD", true));
    expect(answer).toMatchObject({
      ok: false,
      error: {
        code: "not_ready",
        orders: [
          { orderId: cash.id, code: "not_ready", fields: { block: "errors.field.noBlock" } },
        ],
      },
    });
    expect(await stored(card.id)).toBeNull();
  });

  it("an order that is not Waiting for settlement is refused wrong_status (settlementAllows())", async () => {
    const s = await scene();
    const order = await paidOrder(s, "CARD", "50000", null, "PURCHASING");
    expect(await confirm(s.finance.id, input([order], "CARD", true))).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: order.id, code: "wrong_status" }] },
    });
    expect(await stored(order.id)).toBeNull();
  });

  it("a note on the card block is refused (08: the note belongs to the transfer)", async () => {
    const s = await scene();
    const order = await paidOrder(s, "CARD", "50000", null);
    expect(
      await confirm(s.finance.id, input([order], "CARD", true, { [order.id]: "Invented" })),
    ).toMatchObject({ ok: false, error: { code: "invalid_input" } });
  });
});
