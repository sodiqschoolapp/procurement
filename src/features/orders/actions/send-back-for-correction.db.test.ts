import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { orderSettlements } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

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
import { insertUser } from "../../../../tests/helpers/users";
import { sendBackForCorrectionOrders } from "./send-back-for-correction";

// Send back for correction (build plan 4.5): 06-approval-workflow.md, Allowed moves ("Waiting
// for settlement | Send back for correction | Finance | Open | Reason"); rules 3 and 8; 08
// Closing 4; edge case "Finance finds an error during settlement"; 10 Notifications ("Sent back,
// rejected | Owner, Head"); developer-rules.md rule 9; plan of 4.5, decided items 6 and 7 (Look
// first) and the review's correction 2. Every passing case has the refused data beside it (D40).

function sendBack(userId: string, input: unknown) {
  return runOrdersAction(sendBackForCorrectionOrders, userId, input);
}

async function confirmedRow(orderId: string, by: string) {
  const at = new Date("2031-05-09T07:00:00Z");
  await db.insert(orderSettlements).values({
    orderId,
    transferConfirmedBy: by,
    transferConfirmedAt: at,
    transferNote: "Invented note",
    cardConfirmedBy: by,
    cardConfirmedAt: at,
    overspendAckBy: by,
    overspendAckAt: at,
    overspendAckComment: "Invented acknowledgment",
    createdAt: at,
  });
}

describe("Send back for correction (06 Allowed moves; 08 Closing 4)", () => {
  it("Finance sends a settlement order back to Open with the reason; its confirmations are cleared (decided item 6, Look first)", async () => {
    setClock("2031-05-10T07:00:00Z");
    const { branch, manager, finance, head } = await moveScene();
    const [order] = await ordersAt(branch.id, manager.id, "SETTLEMENT");
    const [untouched] = await ordersAt(branch.id, manager.id, "SETTLEMENT");
    await confirmedRow(order!.id, finance.id);
    await confirmedRow(untouched!.id, finance.id);

    expect(await sendBack(finance.id, tickedInput([order!]))).toMatchObject({
      ok: true,
      data: { orders: [{ id: order!.id, status: "PURCHASING" }] },
    });
    const states = await statusesOf([order!.id, untouched!.id]);
    expect(states.get(order!.id)).toMatchObject({ status: "PURCHASING", version: 2 });
    expect(states.get(untouched!.id)).toMatchObject({ status: "SETTLEMENT", version: 1 });
    expect(await eventsOf(order!.id)).toEqual([
      {
        type: "SEND_BACK_FOR_CORRECTION",
        from: "SETTLEMENT",
        to: "PURCHASING",
        comment: REASON,
        note: null,
      },
    ]);
    const [cleared] = await db
      .select()
      .from(orderSettlements)
      .where(eq(orderSettlements.orderId, order!.id));
    expect(cleared).toMatchObject({
      transferConfirmedBy: null,
      transferConfirmedAt: null,
      transferNote: null,
      cardConfirmedBy: null,
      cardConfirmedAt: null,
      overspendAckBy: null,
      overspendAckAt: null,
      overspendAckComment: null,
    });
    const [kept] = await db
      .select()
      .from(orderSettlements)
      .where(eq(orderSettlements.orderId, untouched!.id));
    expect(kept!.transferConfirmedBy).toBe(finance.id);

    // The owner and the Head are told, with this move's own text (decided item 7, Look first).
    for (const told of [manager, head]) {
      const notices = await noticesOf(told.id, "REQUEST_SENT_BACK_FOR_CORRECTION");
      expect(
        notices.filter((n) => (n.params as { branch: string }).branch === branch.code),
      ).toEqual([{ params: expect.objectContaining({ count: 1, branch: branch.code }) }]);
    }
  });

  it("orders of two branches: one notice per branch to each owner and the Head (10 Notifications)", async () => {
    setClock("2031-05-10T07:00:00Z");
    const first = await insertBranch();
    const second = await insertBranch();
    const finance = await insertUser("FINANCE", { branches: [first.id, second.id] });
    const a = await insertUser("MANAGER", { branches: [first.id] });
    const b = await insertUser("MANAGER", { branches: [second.id] });
    const head = await insertUser("HEAD");
    const [one] = await ordersAt(first.id, a.id, "SETTLEMENT");
    const [two] = await ordersAt(second.id, b.id, "SETTLEMENT");
    expect(await sendBack(finance.id, tickedInput([one!, two!]))).toMatchObject({ ok: true });
    const headNotices = (await noticesOf(head.id, "REQUEST_SENT_BACK_FOR_CORRECTION")).filter((n) =>
      [first.code, second.code].includes((n.params as { branch: string }).branch),
    );
    expect(headNotices).toHaveLength(2);
    expect(await noticesOf(a.id, "REQUEST_SENT_BACK_FOR_CORRECTION")).toEqual([
      { params: expect.objectContaining({ branch: first.code, count: 1 }) },
    ]);
    expect(await noticesOf(b.id, "REQUEST_SENT_BACK_FOR_CORRECTION")).toEqual([
      { params: expect.objectContaining({ branch: second.code, count: 1 }) },
    ]);
  });

  it("no reason is refused as required, with nothing saved (06 rule 3)", async () => {
    const { branch, manager, finance } = await moveScene();
    const [order] = await ordersAt(branch.id, manager.id, "SETTLEMENT");
    const notices = await noticeCount();
    const sent = tickedInput([order!], {});
    expect(await sendBack(finance.id, sent)).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { reason: "errors.field.required" } },
    });
    await nothingSaved(sent.clientKey, [order!.id], notices);
  });

  it("an Open order is refused wrong_status (06 Allowed moves: from Waiting for settlement only)", async () => {
    const { branch, manager, finance } = await moveScene();
    const [order] = await ordersAt(branch.id, manager.id, "PURCHASING");
    expect(await sendBack(finance.id, tickedInput([order!]))).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: order!.id, code: "wrong_status" }] },
    });
  });

  it("the Head, the Manager and Finance of another branch are refused; an old version is refused (03 Permission matrix; rule 9; review of the plan, correction 2)", async () => {
    const { branch, manager, finance, head } = await moveScene();
    const [order] = await ordersAt(branch.id, manager.id, "SETTLEMENT");
    const notices = await noticeCount();
    const other = await insertBranch();
    const elsewhere = await insertUser("FINANCE", { branches: [other.id] });
    for (const user of [head, manager]) {
      const sent = tickedInput([order!]);
      expect(await sendBack(user.id, sent)).toMatchObject({
        ok: false,
        error: { orders: [{ orderId: order!.id, code: "forbidden" }] },
      });
      await nothingSaved(sent.clientKey, [order!.id], notices);
    }
    const walled = tickedInput([order!]);
    expect(await sendBack(elsewhere.id, walled)).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: order!.id, code: "not_found" }] },
    });
    await nothingSaved(walled.clientKey, [order!.id], notices);

    const stale = tickedInput([{ id: order!.id, version: order!.version + 1 }]);
    expect(await sendBack(finance.id, stale)).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: order!.id, code: "stale_version" }] },
    });
    await nothingSaved(stale.clientKey, [order!.id], notices);
    // The right Finance user at the right version passes (D40).
    expect(await sendBack(finance.id, tickedInput([order!]))).toMatchObject({ ok: true });
  });
});
