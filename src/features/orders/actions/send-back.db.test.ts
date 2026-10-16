import { describe, expect, it } from "vitest";

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
import { editDraft, insertOrder, orderRow } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { sendBackOrders } from "./send-back";

// Send back (build plan 2.11): 06-approval-workflow.md, Allowed moves ("Any 'Waiting for' step |
// Send back | The approver of that step | Sent back for editing | Reason; optional note per
// order"); rules 2, 3, 8; 05 Drafts 5; 10 Notifications ("Sent back, rejected | Owner, Head");
// 14 order_events (note). The permission rows are moves-matrix.db.test.ts. Every passing case has
// the refused data beside it (D40).

function sendBack(userId: string, input: unknown) {
  return runOrdersAction(sendBackOrders, userId, input);
}

describe("The reason (06 rule 3: at least 5 characters, one for every order of the action)", () => {
  it("Done when: a 4-character reason is refused with nothing saved; 5 pass", async () => {
    const { branch, manager, head } = await moveScene();
    const [order] = await ordersAt(branch.id, manager.id, "PENDING_HEAD");
    const notices = await noticeCount();
    const short = tickedInput([order!], { reason: "  abcd  " });
    expect(await sendBack(head.id, short)).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { reason: "errors.field.tooShort" } },
    });
    await nothingSaved(short.clientKey, [order!.id], notices);
    expect(await orderRow(order!.id)).toMatchObject({ status: "PENDING_HEAD", version: 1 });

    expect(await sendBack(head.id, tickedInput([order!], { reason: "abcde" }))).toMatchObject({
      ok: true,
    });
    expect((await eventsOf(order!.id))[0]).toMatchObject({ type: "SEND_BACK", comment: "abcde" });
  });

  it("no reason at all is refused as required", async () => {
    const { branch, manager, head } = await moveScene();
    const [order] = await ordersAt(branch.id, manager.id, "PENDING_HEAD");
    expect(await sendBack(head.id, tickedInput([order!], {}))).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { reason: "errors.field.required" } },
    });
  });
});

describe("Each step's approver sends back to Sent back (06 Allowed moves)", () => {
  it.each([
    ["PENDING_HEAD", "head"],
    ["PENDING_PRINCIPAL", "principal"],
    ["PENDING_FINANCE", "finance"],
  ] as const)("at %s by the %s", async (status, who) => {
    const scene = await moveScene();
    const [order] = await ordersAt(scene.branch.id, scene.manager.id, status);
    // Beside it, an order of the same step nobody ticked: it must not move (D40).
    const [untouched] = await ordersAt(scene.branch.id, scene.manager.id, status);
    expect(await sendBack(scene[who].id, tickedInput([order!]))).toMatchObject({
      ok: true,
      data: { orders: [{ id: order!.id, status: "RETURNED" }] },
    });
    const states = await statusesOf([order!.id, untouched!.id]);
    expect(states.get(order!.id)).toMatchObject({ status: "RETURNED", version: 2 });
    expect(states.get(untouched!.id)).toMatchObject({ status, version: 1 });
    expect(await eventsOf(order!.id)).toEqual([
      { type: "SEND_BACK", from: status, to: "RETURNED", comment: REASON, note: null },
    ]);
  });
});

describe("The note per order (06 Allowed moves: optional note per order; 14 order_events.note)", () => {
  it("is stored on its own order's event, trimmed; an empty note is no note", async () => {
    const { branch, manager, head } = await moveScene();
    const [first, second, third] = await ordersAt(branch.id, manager.id, "PENDING_HEAD", 3);
    const input = tickedInput([first!, second!, third!], {
      reason: REASON,
      notes: { [first!.id]: "  Change 100 to 80  ", [second!.id]: "   " },
    });
    expect(await sendBack(head.id, input)).toMatchObject({ ok: true });
    expect((await eventsOf(first!.id))[0]!.note).toBe("Change 100 to 80");
    expect((await eventsOf(second!.id))[0]!.note).toBe(null);
    expect((await eventsOf(third!.id))[0]!.note).toBe(null);
  });

  it("a note longer than 500 characters is refused with nothing saved", async () => {
    const { branch, manager, head } = await moveScene();
    const [order] = await ordersAt(branch.id, manager.id, "PENDING_HEAD");
    const notices = await noticeCount();
    const input = tickedInput([order!], {
      reason: REASON,
      notes: { [order!.id]: "a".repeat(501) },
    });
    expect(await sendBack(head.id, input)).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    await nothingSaved(input.clientKey, [order!.id], notices);
  });
});

describe("All or nothing (06 rule 8; 03 rules 1 and 8; 15 S7)", () => {
  it("one order of another branch among the Principal's own refuses the whole action", async () => {
    const own = await moveScene();
    const other = await moveScene();
    const mine = await ordersAt(own.branch.id, own.manager.id, "PENDING_PRINCIPAL", 2);
    const [theirs] = await ordersAt(other.branch.id, other.manager.id, "PENDING_PRINCIPAL");
    const notices = await noticeCount();
    const input = tickedInput([...mine, theirs!]);
    expect(await sendBack(own.principal.id, input)).toMatchObject({
      ok: false,
      error: { code: "not_found", orders: [{ orderId: theirs!.id, code: "not_found" }] },
    });
    await nothingSaved(
      input.clientKey,
      [...mine, theirs!].map((order) => order.id),
      notices,
    );
  });

  it("one order changed a moment ago refuses the action and is named", async () => {
    const { branch, manager, head } = await moveScene();
    const [kept, moved] = await ordersAt(branch.id, manager.id, "PENDING_HEAD", 2);
    const input = tickedInput([kept!, { id: moved!.id, version: 1 }]);
    // The second order moved to v2 since the Head saw it.
    expect(
      await sendBack(head.id, tickedInput([{ id: moved!.id, version: 1 }], { reason: REASON })),
    ).toMatchObject({ ok: true });
    expect(await sendBack(head.id, input)).toMatchObject({
      ok: false,
      error: { code: "stale_version", orders: [{ orderId: moved!.id, code: "stale_version" }] },
    });
    expect(await orderRow(kept!.id)).toMatchObject({ status: "PENDING_HEAD", version: 1 });
  });

  it("an order at the next step is forbidden to the Head: the step's approver only", async () => {
    const { branch, manager, head } = await moveScene();
    const [order] = await ordersAt(branch.id, manager.id, "PENDING_PRINCIPAL");
    expect(await sendBack(head.id, tickedInput([order!]))).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
  });
});

describe("The owner and the Head are told, once per branch (10 Notifications)", () => {
  it("orders of two branches: one notice per branch to each owner and every Head, never the actor", async () => {
    setClock("2026-10-16T09:32:00Z");
    const first = await moveScene();
    const second = await insertBranch();
    const finance = await insertUser("FINANCE", { branches: [first.branch.id, second.id] });
    const otherOwner = await insertUser("MANAGER", { branches: [second.id] });
    const otherHead = await insertUser("HEAD");
    const [a1, a2] = await ordersAt(first.branch.id, first.manager.id, "PENDING_FINANCE", 2);
    const [b1] = await ordersAt(second.id, otherOwner.id, "PENDING_FINANCE");
    expect(await sendBack(finance.id, tickedInput([a1!, a2!, b1!]))).toMatchObject({ ok: true });

    const ownerA = await noticesOf(first.manager.id, "REQUEST_SENT_BACK");
    expect(ownerA).toHaveLength(1);
    expect(ownerA[0]).toMatchObject({ params: { branch: first.branch.code, count: 2 } });
    const ownerB = await noticesOf(otherOwner.id, "REQUEST_SENT_BACK");
    expect(ownerB).toHaveLength(1);
    expect(ownerB[0]).toMatchObject({ params: { branch: second.code, count: 1 } });
    for (const head of [first.head, otherHead]) {
      const got = await noticesOf(head.id, "REQUEST_SENT_BACK");
      expect(got.map((notice) => (notice.params as { branch: string }).branch).sort()).toEqual(
        [first.branch.code, second.code].sort(),
      );
    }
    // Nobody else: not the actor, not the Principal.
    expect(await noticesOf(finance.id, "REQUEST_SENT_BACK")).toEqual([]);
    expect(await noticesOf(first.principal.id, "REQUEST_SENT_BACK")).toEqual([]);
  });

  it("an owner who is a Head is told once (review of the plan, Should fix 3)", async () => {
    const { branch, principal } = await moveScene();
    const owner = await insertUser("HEAD");
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: owner.id,
      status: "PENDING_PRINCIPAL",
    });
    expect(await sendBack(principal.id, tickedInput([order]))).toMatchObject({ ok: true });
    expect(await noticesOf(owner.id, "REQUEST_SENT_BACK")).toHaveLength(1);
  });
});

describe("The returned order is edited by its owner (05 Drafts 5; 06 rule 2)", () => {
  it("the owner saves a change; the Head's send-back is the version it starts from", async () => {
    const { branch, manager, principal, head } = await moveScene();
    const [order] = await ordersAt(branch.id, manager.id, "PENDING_HEAD");
    expect(await sendBack(head.id, tickedInput([order!]))).toMatchObject({ ok: true });
    expect(await editDraft(manager.id, { id: order!.id, version: 2, quantity: "8" })).toMatchObject(
      { ok: true, data: { version: 3 } },
    );
    expect((await orderRow(order!.id))!.plannedQty).toBe("8.000");
    // The approver who sent it back cannot change it: approvers never edit (06 rule 1).
    expect(
      await editDraft(principal.id, { id: order!.id, version: 3, quantity: "7" }),
    ).toMatchObject({ ok: false });
  });
});
