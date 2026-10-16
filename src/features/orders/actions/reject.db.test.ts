import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { orderExtras } from "@/server/db/schema";
import { runDraftsAction } from "@/server/drafts-action";
import { type OrdersActionDefinition, runOrdersAction } from "@/server/order-action";

import { refusalOf } from "../../../../tests/helpers/database-error";
import {
  REASON,
  eventsOf,
  moveScene,
  noticeCount,
  noticesOf,
  nothingSaved,
  ordersAt,
  tickedInput,
} from "../../../../tests/helpers/moves";
import {
  editDraft,
  insertExtraCostType,
  insertOrder,
  insertOrderExtra,
  orderRow,
  setOrderStatus,
} from "../../../../tests/helpers/orders";
import { approveOrders } from "./approve";
import { cancelOrders } from "./cancel";
import { deleteDraft, setDraftsNeededBy } from "./drafts";
import { rejectOrders } from "./reject";
import { sendBackOrders } from "./send-back";
import { submitDrafts } from "./submit";
import { submitAgainOrders } from "./submit-again";
import { takeBackOrders } from "./take-back";

// Reject (build plan 2.11): 06-approval-workflow.md, Allowed moves ("Any 'Waiting for' step |
// Reject | The approver of that step | Rejected | Reason"); rules 2 ("Reject is final"), 3, 8;
// 10 Notifications ("Sent back, rejected | Owner, Head"). Done when: "a rejected order refuses
// every write" (review of the plan, Must fix 2: the draft actions and the database guards too,
// each reached with nothing in front of it, D39). The permission rows are moves-matrix.db.test.ts.

function reject(userId: string, input: unknown) {
  return runOrdersAction(rejectOrders, userId, input);
}

describe("Reject (06 Allowed moves; rule 3)", () => {
  it("a 4-character reason is refused with nothing saved", async () => {
    const { branch, manager, principal } = await moveScene();
    const [order] = await ordersAt(branch.id, manager.id, "PENDING_PRINCIPAL");
    const notices = await noticeCount();
    const input = tickedInput([order!], { reason: "abcd" });
    expect(await reject(principal.id, input)).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { reason: "errors.field.tooShort" } },
    });
    await nothingSaved(input.clientKey, [order!.id], notices);
  });

  it.each([
    ["PENDING_HEAD", "head"],
    ["PENDING_PRINCIPAL", "principal"],
    ["PENDING_FINANCE", "finance"],
  ] as const)("at %s the %s rejects; the owner and the Head are told", async (status, who) => {
    const scene = await moveScene();
    const [order] = await ordersAt(scene.branch.id, scene.manager.id, status);
    const [untouched] = await ordersAt(scene.branch.id, scene.manager.id, status);
    expect(await reject(scene[who].id, tickedInput([order!]))).toMatchObject({
      ok: true,
      data: { orders: [{ id: order!.id, status: "REJECTED" }] },
    });
    expect(await orderRow(untouched!.id)).toMatchObject({ status, version: 1 });
    expect(await eventsOf(order!.id)).toEqual([
      { type: "REJECT", from: status, to: "REJECTED", comment: REASON, note: null },
    ]);
    expect(await noticesOf(scene.manager.id, "REQUEST_REJECTED")).toHaveLength(1);
    if (who !== "head") {
      expect(await noticesOf(scene.head.id, "REQUEST_REJECTED")).toHaveLength(1);
    } else {
      // The actor is never told of his own act.
      expect(await noticesOf(scene.head.id, "REQUEST_REJECTED")).toEqual([]);
    }
  });
});

describe("Done when: a rejected order refuses every write (06 rule 2: Rejected is final)", () => {
  /** A rejected order of the Manager with one extra cost, rejected through the action. */
  async function rejected() {
    const scene = await moveScene();
    const order = await insertOrder({
      branchId: scene.branch.id,
      ownerId: scene.manager.id,
      status: "RETURNED",
    });
    // The extra is added while the order is Sent back, when its guard allows it.
    const extra = await insertOrderExtra(order.id);
    await setOrderStatus(order.id, "PENDING_HEAD");
    expect(await reject(scene.head.id, tickedInput([order]))).toMatchObject({ ok: true });
    const row = (await orderRow(order.id))!;
    expect(row).toMatchObject({ status: "REJECTED" });
    return { ...scene, order: { id: order.id, version: row.version }, extra, row };
  }

  it("every move of the state machine is refused as wrong_status", async () => {
    const { order, manager, head } = await rejected();
    const moves: [OrdersActionDefinition<never>, string, Record<string, unknown>][] = [
      [submitDrafts as never, head.id, {}],
      [submitAgainOrders as never, manager.id, {}],
      [takeBackOrders as never, manager.id, {}],
      [approveOrders as never, head.id, {}],
      [sendBackOrders as never, head.id, { reason: REASON }],
      [rejectOrders as never, head.id, { reason: REASON }],
      [cancelOrders as never, head.id, { reason: REASON }],
      [cancelOrders as never, manager.id, { reason: REASON }],
    ];
    for (const [definition, userId, extra] of moves) {
      expect(
        await runOrdersAction(definition, userId, tickedInput([order], extra)),
        definition.name,
      ).toMatchObject({ ok: false, error: { code: "wrong_status" } });
    }
    expect(await orderRow(order.id)).toMatchObject({ status: "REJECTED", version: order.version });
  });

  it("the draft actions refuse it: edit, delete, needed-by of ticked drafts", async () => {
    const { order, manager, head } = await rejected();
    for (const userId of [manager.id, head.id]) {
      expect(
        await editDraft(userId, { id: order.id, version: order.version, quantity: "8" }),
      ).toMatchObject({ ok: false });
      expect(
        await runAction(deleteDraft, userId, { id: order.id, version: order.version }),
      ).toMatchObject({ ok: false });
      expect(
        await runDraftsAction(setDraftsNeededBy, userId, {
          orders: [{ id: order.id, version: order.version }],
          neededBy: "2031-06-01",
        }),
      ).toMatchObject({ ok: false });
    }
    const row = (await orderRow(order.id))!;
    expect(row).toMatchObject({ status: "REJECTED", version: order.version, plannedQty: "10.000" });
    expect(row.neededBy).toBe("2031-05-01");
  });

  it("the database refuses a direct change of the plan (orders_plan_frozen)", async () => {
    const { order } = await rejected();
    expect(
      await refusalOf(db.execute(sql`update orders set planned_qty = 8 where id = ${order.id}`)),
    ).toMatchObject({ code: "23514", constraint: "orders_plan_frozen" });
  });

  it("the database refuses a direct insert, update and delete of its extra costs (order_extras_plan_frozen)", async () => {
    const { order, extra } = await rejected();
    const frozen = { code: "23514", constraint: "order_extras_plan_frozen" };
    const type = await insertExtraCostType();
    expect(
      await refusalOf(
        db.insert(orderExtras).values({
          id: randomUUID(),
          orderId: order.id,
          extraCostTypeId: type.id,
          amount: 1000n,
          createdAt: new Date("2026-10-16T09:00:00Z"),
        }),
      ),
    ).toMatchObject(frozen);
    expect(
      await refusalOf(
        db.update(orderExtras).set({ amount: 1n }).where(eq(orderExtras.id, extra.id)),
      ),
    ).toMatchObject(frozen);
    expect(
      await refusalOf(db.delete(orderExtras).where(eq(orderExtras.id, extra.id))),
    ).toMatchObject(frozen);
  });
});
