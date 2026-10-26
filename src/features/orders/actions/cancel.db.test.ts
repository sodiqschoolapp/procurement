import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { notifications, orders } from "@/server/db/schema";
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
import { insertBranch } from "../../../../tests/helpers/branches";
import { insertOrder, inventedNumber, orderRow } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { cancelOrders } from "./cancel";
import { takeBackOrders } from "./take-back";

// Cancel (build plans 2.11 and 2.3b): 06-approval-workflow.md, Allowed moves ("Any 'Waiting for'
// step, Sent back, Draft with a number (taken back) | Cancel | Owner or Head | Cancelled |
// Reason"); rules 3, 8; 03 matrix "Add, edit, submit, cancel orders"; 10 Notifications "Cancelled
// by someone other than its owner | Owner" (D55 item 13, which replaces decided item 5 of 2.11:
// nobody was told). The permission rows are moves-matrix.db.test.ts.

function cancel(userId: string, input: unknown) {
  return runOrdersAction(cancelOrders, userId, input);
}

describe("Cancel by the owner or the Head (06 Allowed moves)", () => {
  it.each(["PENDING_HEAD", "PENDING_PRINCIPAL", "PENDING_FINANCE", "RETURNED"] as const)(
    "the owner cancels from %s, with the reason in History; nobody is told of their own cancel",
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

/** The notices of REQUEST_CANCELLED, with the branch each row keeps. */
async function cancelNotices(userIds: readonly string[]) {
  return db
    .select({
      userId: notifications.userId,
      branchId: notifications.branchId,
      params: notifications.params,
    })
    .from(notifications)
    .where(
      and(inArray(notifications.userId, [...userIds]), eq(notifications.type, "REQUEST_CANCELLED")),
    );
}

describe("Cancel of a Draft with a number (06 Allowed moves, Cancel row; D55 item 9; plan of 2.3b)", () => {
  it("the owner takes an order back and cancels it: the number stays, History has both moves", async () => {
    const { branch, manager } = await moveScene();
    const [order] = await ordersAt(branch.id, manager.id, "PENDING_HEAD");
    const took = await runOrdersAction(takeBackOrders, manager.id, tickedInput([order!], {}));
    expect(took).toMatchObject({
      ok: true,
      data: { orders: [{ id: order!.id, status: "DRAFT" }] },
    });
    const drafted = await orderRow(order!.id);

    expect(await cancel(manager.id, tickedInput([drafted!]))).toMatchObject({
      ok: true,
      data: { orders: [{ id: order!.id, status: "CANCELLED" }] },
    });
    expect(await orderRow(order!.id)).toMatchObject({ status: "CANCELLED", number: order!.number });
    expect(await eventsOf(order!.id)).toEqual([
      { type: "TAKE_BACK", from: "PENDING_HEAD", to: "DRAFT", comment: null, note: null },
      { type: "CANCEL", from: "DRAFT", to: "CANCELLED", comment: REASON, note: null },
    ]);
  });

  it("the Head cancels Bekzod's numbered draft; a colleague gets Not found", async () => {
    const { branch, manager, head } = await moveScene();
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    const draft = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "DRAFT",
      number: inventedNumber(),
    });
    const notices = await noticeCount();
    const refused = tickedInput([draft]);
    expect(await cancel(colleague.id, refused)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    await nothingSaved(refused.clientKey, [draft.id], notices);
    expect(await cancel(head.id, tickedInput([draft]))).toMatchObject({ ok: true });
    expect(await orderRow(draft.id)).toMatchObject({ status: "CANCELLED" });
  });

  it("a Draft that was never submitted is refused wrong_status and stays a Draft: it is deleted, not cancelled", async () => {
    const { branch, manager, head } = await moveScene();
    const draft = await insertOrder({ branchId: branch.id, ownerId: manager.id, status: "DRAFT" });
    for (const userId of [manager.id, head.id]) {
      const notices = await noticeCount();
      const input = tickedInput([draft]);
      expect(await cancel(userId, input)).toMatchObject({
        ok: false,
        error: { code: "wrong_status" },
      });
      await nothingSaved(input.clientKey, [draft.id], notices);
    }
    expect(await orderRow(draft.id)).toMatchObject({ status: "DRAFT", number: null });
  });

  // Until 2.5d-b a Cancel asks the price, the department and the needed-by date no longer (D67;
  // plan of 2.5d, decided items 4 and 6, Look first). The quantity is still asked by every status
  // but Draft.
  it("a numbered draft whose quantity was cleared is refused not_ready naming the quantity; filled again, it cancels (decided item 14)", async () => {
    const { branch, manager } = await moveScene();
    const draft = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "DRAFT",
      number: inventedNumber(),
    });
    // As the grid's updateDraft saves a cleared quantity cell on a Draft: no quantity, no total.
    await db
      .update(orders)
      .set({ plannedQty: null, plannedTotal: null })
      .where(eq(orders.id, draft.id));
    const notices = await noticeCount();
    const input = tickedInput([draft]);
    expect(await cancel(manager.id, input)).toMatchObject({
      ok: false,
      error: {
        code: "not_ready",
        orders: [
          { orderId: draft.id, code: "not_ready", fields: { quantity: "errors.field.required" } },
        ],
      },
    });
    await nothingSaved(input.clientKey, [draft.id], notices);
    expect(await orderRow(draft.id)).toMatchObject({ status: "DRAFT", version: draft.version });

    // The same draft with its quantity filled again: only the plan decided the refusal.
    await db
      .update(orders)
      .set({ plannedQty: "10.000", plannedTotal: 50_000n })
      .where(eq(orders.id, draft.id));
    expect(await cancel(manager.id, tickedInput([draft]))).toMatchObject({ ok: true });
    expect(await orderRow(draft.id)).toMatchObject({ status: "CANCELLED" });
  });

  it("a numbered draft whose price was cleared is refused not_ready naming the price until 2.5d-b; filled again, it cancels (decided items 4 and 14)", async () => {
    const { branch, manager } = await moveScene();
    const draft = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "DRAFT",
      number: inventedNumber(),
    });
    // As the grid's updateDraft saves a cleared price cell on a Draft: no price, no total.
    await db
      .update(orders)
      .set({ plannedPrice: null, plannedTotal: null })
      .where(eq(orders.id, draft.id));
    const notices = await noticeCount();
    const input = tickedInput([draft]);
    expect(await cancel(manager.id, input)).toMatchObject({
      ok: false,
      error: {
        code: "not_ready",
        orders: [
          { orderId: draft.id, code: "not_ready", fields: { price: "errors.field.required" } },
        ],
      },
    });
    await nothingSaved(input.clientKey, [draft.id], notices);
    expect(await orderRow(draft.id)).toMatchObject({ status: "DRAFT", version: draft.version });

    // The same draft with its price filled again: only the plan decided the refusal.
    await db
      .update(orders)
      .set({ plannedPrice: 5000n, plannedTotal: 50_000n })
      .where(eq(orders.id, draft.id));
    expect(await cancel(manager.id, tickedInput([draft]))).toMatchObject({ ok: true });
    expect(await orderRow(draft.id)).toMatchObject({ status: "CANCELLED" });
  });

  it("a numbered draft without a department or a date cancels, its price kept (decided items 4 and 6)", async () => {
    const { branch, manager } = await moveScene();
    const draft = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "DRAFT",
      number: inventedNumber(),
      departmentId: null,
      neededBy: null,
    });
    expect(await cancel(manager.id, tickedInput([draft]))).toMatchObject({ ok: true });
    expect(await orderRow(draft.id)).toMatchObject({ status: "CANCELLED" });
  });
});

describe("Who is told of a Cancel (10 Notifications: Cancelled by someone other than its owner | Owner; D55 item 13)", () => {
  it("the Head cancels orders of two owners in two branches: one notice per owner and branch, with that owner's count", async () => {
    const chl = await insertBranch();
    const yun = await insertBranch();
    const bekzod = await insertUser("MANAGER", { branches: [chl.id, yun.id] });
    const aziz = await insertUser("MANAGER", { branches: [chl.id] });
    const head = await insertUser("HEAD");
    const bekzodChl = await ordersAt(chl.id, bekzod.id, "PENDING_HEAD", 2);
    const azizChl = await ordersAt(chl.id, aziz.id, "RETURNED");
    const bekzodYun = await ordersAt(yun.id, bekzod.id, "PENDING_PRINCIPAL");
    const otherHead = await insertUser("HEAD");

    const result = await cancel(head.id, tickedInput([...bekzodChl, ...azizChl, ...bekzodYun]));
    expect(result).toMatchObject({ ok: true });

    const told = await cancelNotices([bekzod.id, aziz.id, head.id, otherHead.id]);
    const by = (userId: string) =>
      told
        .filter((row) => row.userId === userId)
        .map((row) => [row.branchId, (row.params as { count: number }).count])
        .sort();
    expect(by(bekzod.id)).toEqual(
      [
        [chl.id, 2],
        [yun.id, 1],
      ].sort(),
    );
    expect(by(aziz.id)).toEqual([[chl.id, 1]]);
    // Nobody else: not the actor, not another Head.
    expect(by(head.id)).toEqual([]);
    expect(by(otherHead.id)).toEqual([]);
    expect(told).toHaveLength(3);
  });

  it("an owner who cancels their own orders tells nobody, the Head included", async () => {
    const { branch, manager, head } = await moveScene();
    const mine = await ordersAt(branch.id, manager.id, "PENDING_HEAD", 2);
    expect(await cancel(manager.id, tickedInput(mine))).toMatchObject({ ok: true });
    expect(await cancelNotices([manager.id, head.id])).toEqual([]);
  });
});
