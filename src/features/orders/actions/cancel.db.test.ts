import { describe, expect, it } from "vitest";

import { runOrdersAction } from "@/server/order-action";

import {
  REASON,
  eventsOf,
  moveScene,
  noticeCount,
  nothingSaved,
  ordersAt,
  tickedInput,
} from "../../../../tests/helpers/moves";
import { orderRow } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { cancelOrders } from "./cancel";

// Cancel (build plan 2.11): 06-approval-workflow.md, Allowed moves ("Any 'Waiting for' step, Sent
// back | Cancel | Owner or Head | Cancelled | Reason"); rules 3, 8; 03 matrix "Add, edit, submit,
// cancel orders"; plan of 2.11, decided item 5 (nobody is told). The permission rows are
// moves-matrix.db.test.ts.

function cancel(userId: string, input: unknown) {
  return runOrdersAction(cancelOrders, userId, input);
}

describe("Cancel by the owner or the Head (06 Allowed moves)", () => {
  it.each(["PENDING_HEAD", "PENDING_PRINCIPAL", "PENDING_FINANCE", "RETURNED"] as const)(
    "the owner cancels from %s, with the reason in History; nobody is told",
    async (status) => {
      const { branch, manager } = await moveScene();
      const [order] = await ordersAt(branch.id, manager.id, status);
      const notices = await noticeCount();
      expect(await cancel(manager.id, tickedInput([order!]))).toMatchObject({
        ok: true,
        data: { orders: [{ id: order!.id, status: "CANCELLED" }] },
      });
      expect(await eventsOf(order!.id)).toEqual([
        { type: "CANCEL", from: status, to: "CANCELLED", comment: REASON, note: null },
      ]);
      expect(await noticeCount()).toBe(notices);
    },
  );

  it("the Head cancels a Manager's order of any branch", async () => {
    const { branch, manager, head } = await moveScene();
    const [order] = await ordersAt(branch.id, manager.id, "PENDING_FINANCE");
    expect(await cancel(head.id, tickedInput([order!]))).toMatchObject({ ok: true });
  });

  it("an Open order is refused as wrong_status: cancel ends before approval finishes", async () => {
    const { branch, manager, head } = await moveScene();
    const [open] = await ordersAt(branch.id, manager.id, "PURCHASING");
    for (const userId of [manager.id, head.id]) {
      expect(await cancel(userId, tickedInput([open!]))).toMatchObject({
        ok: false,
        error: { code: "wrong_status" },
      });
    }
  });

  it("another Manager's order, the Principal and Finance are forbidden; nothing is saved", async () => {
    const { branch, manager, principal, finance } = await moveScene();
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    const [order] = await ordersAt(branch.id, manager.id, "PENDING_PRINCIPAL");
    const notices = await noticeCount();
    for (const userId of [colleague.id, principal.id, finance.id]) {
      const input = tickedInput([order!]);
      expect(await cancel(userId, input)).toMatchObject({
        ok: false,
        error: { code: "forbidden" },
      });
      await nothingSaved(input.clientKey, [order!.id], notices);
    }
  });

  it("a 4-character reason is refused (06 rule 3)", async () => {
    const { branch, manager } = await moveScene();
    const [order] = await ordersAt(branch.id, manager.id, "PENDING_HEAD");
    expect(await cancel(manager.id, tickedInput([order!], { reason: "abcd" }))).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { reason: "errors.field.tooShort" } },
    });
    expect(await orderRow(order!.id)).toMatchObject({ status: "PENDING_HEAD", version: 1 });
  });
});
