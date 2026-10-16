import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { orderEvents, orderRevisions } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { setClock } from "../../../../tests/helpers/clock";
import {
  eventsOf,
  moveScene,
  noticeCount,
  ordersAt,
  tickedInput,
} from "../../../../tests/helpers/moves";
import { addDraft, editDraft, orderRow } from "../../../../tests/helpers/orders";
import { sendBackOrders } from "./send-back";
import { submitDrafts } from "./submit";
import { submitAgainOrders } from "./submit-again";
import { takeBackOrders } from "./take-back";

// Take back (build plan 2.11): 06-approval-workflow.md, Allowed moves ("Waiting for Head | Take
// back | Owner | Draft | Only before the Head decides. The number is kept."); 05 Drafts 5;
// decisions 2.3 items 1 and 5; plan of 2.11, decided items 1 and 2 (Look first). The permission
// rows are moves-matrix.db.test.ts.

function takeBack(userId: string, input: unknown) {
  return runOrdersAction(takeBackOrders, userId, input);
}

function submit(userId: string, input: unknown) {
  return runOrdersAction(submitDrafts, userId, input);
}

describe("Take back (06 Allowed moves)", () => {
  it("the owner takes back at Waiting for Head: Draft with its number and revision; nobody is told", async () => {
    const { branch, manager } = await moveScene();
    const [order] = await ordersAt(branch.id, manager.id, "PENDING_HEAD");
    const notices = await noticeCount();
    expect(await takeBack(manager.id, tickedInput([order!], {}))).toMatchObject({
      ok: true,
      data: { orders: [{ id: order!.id, status: "DRAFT" }] },
    });
    expect(await orderRow(order!.id)).toMatchObject({
      status: "DRAFT",
      number: order!.number,
      revision: 1,
      version: 2,
    });
    expect(await eventsOf(order!.id)).toEqual([
      { type: "TAKE_BACK", from: "PENDING_HEAD", to: "DRAFT", comment: null, note: null },
    ]);
    expect(await noticeCount()).toBe(notices);
  });

  it("only before the Head decides: at Waiting for Principal it is wrong_status", async () => {
    const { branch, manager } = await moveScene();
    const [order] = await ordersAt(branch.id, manager.id, "PENDING_PRINCIPAL");
    expect(await takeBack(manager.id, tickedInput([order!], {}))).toMatchObject({
      ok: false,
      error: { code: "wrong_status" },
    });
  });

  it("the Head on a Manager's order is forbidden: the owner's move (decisions 2.3 item 5)", async () => {
    const { branch, manager, head } = await moveScene();
    const [order] = await ordersAt(branch.id, manager.id, "PENDING_HEAD");
    expect(await takeBack(head.id, tickedInput([order!], {}))).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
  });
});

describe("Submit after a Take back (decided items 1 and 2, Look first; 05 Drafts 5)", () => {
  it("keeps the number, revision 1 and the first submit time; its full copy is submission 2", async () => {
    setClock("2026-10-16T05:00:00Z");
    const { branch, manager } = await moveScene();
    const [order] = await ordersAt(branch.id, manager.id, "PENDING_HEAD");
    const first = (await orderRow(order!.id))!;
    // The order's first full copy, as the first Submit wrote it.
    await db.insert(orderRevisions).values({
      orderId: order!.id,
      revision: 1,
      submission: 1,
      snapshot: { quantity: "10.000" },
      createdAt: first.submittedAt!,
    });

    setClock("2026-10-16T06:00:00Z");
    expect(await takeBack(manager.id, tickedInput([order!], {}))).toMatchObject({ ok: true });
    expect(await editDraft(manager.id, { id: order!.id, version: 2, quantity: "9" })).toMatchObject(
      {
        ok: true,
      },
    );
    // A new draft of the same subtype and department beside it: they never merge (05 Drafts 5).
    const added = await addDraft(manager.id, {
      branchId: branch.id,
      variantId: order!.variantId,
      departmentId: order!.departmentId,
    });
    expect(added).toMatchObject({ ok: true, data: { merged: false } });
    expect((added as { data: { id: string } }).data.id).not.toBe(order!.id);
    expect(await orderRow(order!.id)).toMatchObject({ plannedQty: "9.000", version: 3 });
    setClock("2026-10-16T07:00:00Z");
    expect(
      await submit(manager.id, tickedInput([{ id: order!.id, version: 3 }], {})),
    ).toMatchObject({ ok: true, data: { orders: [{ id: order!.id, status: "PENDING_HEAD" }] } });
    const after = (await orderRow(order!.id))!;
    expect(after).toMatchObject({ number: first.number, revision: 1, status: "PENDING_HEAD" });
    expect(after.submittedAt).toEqual(first.submittedAt);
    const copies = await db
      .select({ submission: orderRevisions.submission, snapshot: orderRevisions.snapshot })
      .from(orderRevisions)
      .where(and(eq(orderRevisions.orderId, order!.id), eq(orderRevisions.revision, 1)))
      .orderBy(orderRevisions.submission);
    expect(copies.map((copy) => copy.submission)).toEqual([1, 2]);
    expect(copies[1]!.snapshot).toMatchObject({ quantity: "9.000", number: first.number });
  });
});

describe("A taken-back order never skips the Head step (06 rule 4; 03 rule 6; permission review of 2.11, Must fix 1)", () => {
  it("a Head-created order sent back, submitted again and taken back goes to Waiting for Head at its Submit", async () => {
    const { branch, principal, head } = await moveScene();
    // The Head's own order submitted once: it skipped the Head step (03 rule 6).
    const [order] = await ordersAt(branch.id, head.id, "PENDING_PRINCIPAL");
    setClock("2026-10-16T05:00:00Z");
    expect(
      await runOrdersAction(sendBackOrders, principal.id, tickedInput([order!])),
    ).toMatchObject({ ok: true });
    setClock("2026-10-16T06:00:00Z");
    expect(
      await runOrdersAction(
        submitAgainOrders,
        head.id,
        tickedInput([{ id: order!.id, version: 2 }], {}),
      ),
    ).toMatchObject({ ok: true, data: { orders: [{ status: "PENDING_HEAD" }] } });
    setClock("2026-10-16T07:00:00Z");
    expect(await takeBack(head.id, tickedInput([{ id: order!.id, version: 3 }], {}))).toMatchObject(
      {
        ok: true,
      },
    );
    setClock("2026-10-16T08:00:00Z");
    expect(await submit(head.id, tickedInput([{ id: order!.id, version: 4 }], {}))).toMatchObject({
      ok: true,
      data: { orders: [{ id: order!.id, status: "PENDING_HEAD" }] },
    });
    const [last] = await db
      .select({ payload: orderEvents.payload })
      .from(orderEvents)
      .where(and(eq(orderEvents.orderId, order!.id), eq(orderEvents.type, "SUBMIT")));
    expect(last!.payload).toBe(null);
  });
});
