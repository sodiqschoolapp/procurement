import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { orderRevisions, stockBalances } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import {
  eventsOf,
  moveScene,
  noticesOf,
  ordersAt,
  tickedInput,
} from "../../../../tests/helpers/moves";
import { editDraft, insertOrder, orderRow } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { getOrderPage } from "../queries/order-page";
import { approveOrders } from "./approve";
import { sendBackOrders } from "./send-back";
import { submitDrafts } from "./submit";
import { submitAgainOrders } from "./submit-again";

// Submit again (build plans 2.11 and 2.3b): 06-approval-workflow.md, Allowed moves ("Sent back for
// editing | Submit again | Owner or Head | Waiting for Head | Revision number goes up by 1"; the
// Head since D55 item 12); rules 4 ("A corrected
// order goes back to the Head. Earlier approvals stay in the history but no longer count"), 8;
// 02 A4; 05 Order number 4; Checks at submit; 10 Notifications ("Orders submitted or submitted
// again | Head"); plan of 2.11, decided item 4 (Look first). The permission rows are
// moves-matrix.db.test.ts.

function run<Input>(
  definition: Parameters<typeof runOrdersAction>[0],
  userId: string,
  input: Input,
) {
  return runOrdersAction(definition, userId, input);
}

/** An order the Head approved and the Principal sent back, its owner's quantity changed to 8. */
async function sentBackByPrincipal() {
  const scene = await moveScene();
  const [order] = await ordersAt(scene.branch.id, scene.manager.id, "PENDING_HEAD");
  setClock("2026-10-16T05:00:00Z");
  expect(await run(approveOrders, scene.head.id, tickedInput([order!], {}))).toMatchObject({
    ok: true,
  });
  setClock("2026-10-16T06:00:00Z");
  expect(
    await run(sendBackOrders, scene.principal.id, tickedInput([{ id: order!.id, version: 2 }])),
  ).toMatchObject({ ok: true });
  expect(
    await editDraft(scene.manager.id, { id: order!.id, version: 3, quantity: "8" }),
  ).toMatchObject({ ok: true });
  return { ...scene, order: { ...order!, version: 4 } };
}

describe("Done when: a re-submitted order is at Waiting for Head with revision 2 and the same number (06 rule 4; A4)", () => {
  it("after the Principal sent it back: Waiting for Head, rev 2, same number, total and copy follow the edit", async () => {
    const { order, manager } = await sentBackByPrincipal();
    setClock("2026-10-16T07:00:00Z");
    expect(await run(submitAgainOrders, manager.id, tickedInput([order], {}))).toMatchObject({
      ok: true,
      data: { orders: [{ id: order.id, status: "PENDING_HEAD" }] },
    });
    const row = (await orderRow(order.id))!;
    expect(row).toMatchObject({
      status: "PENDING_HEAD",
      revision: 2,
      number: order.number,
      plannedQty: "8.000",
      // 8 × 5 000 so'm: the total of the edited plan (decided item 4, Look first).
      plannedTotal: 40_000n,
    });
    const [copy] = await db
      .select({ submission: orderRevisions.submission, snapshot: orderRevisions.snapshot })
      .from(orderRevisions)
      .where(and(eq(orderRevisions.orderId, order.id), eq(orderRevisions.revision, 2)));
    expect(copy).toMatchObject({
      submission: 1,
      snapshot: { quantity: "8.000", plannedTotal: "40000", number: order.number },
    });
  });

  it.each(["PENDING_HEAD", "PENDING_FINANCE"] as const)(
    "after a send-back at %s too",
    async (status) => {
      const scene = await moveScene();
      const [order] = await ordersAt(scene.branch.id, scene.manager.id, status);
      const by = status === "PENDING_HEAD" ? scene.head : scene.finance;
      expect(await run(sendBackOrders, by.id, tickedInput([order!]))).toMatchObject({ ok: true });
      expect(
        await run(
          submitAgainOrders,
          scene.manager.id,
          tickedInput([{ id: order!.id, version: 2 }], {}),
        ),
      ).toMatchObject({ ok: true });
      expect(await orderRow(order!.id)).toMatchObject({
        status: "PENDING_HEAD",
        revision: 2,
        number: order!.number,
      });
    },
  );

  it("earlier approvals stay in History and no longer count: the stepper stands at Head again", async () => {
    const { order, manager, head } = await sentBackByPrincipal();
    setClock("2026-10-16T07:00:00Z");
    expect(await run(submitAgainOrders, manager.id, tickedInput([order], {}))).toMatchObject({
      ok: true,
    });
    expect((await eventsOf(order.id)).map((event) => event.type)).toEqual([
      "APPROVE",
      "SEND_BACK",
      "SUBMIT_AGAIN",
    ]);
    const page = (await getOrderPage(head.id, order.id))!;
    expect(page.steps.find((step) => step.step === "HEAD")).toMatchObject({ state: "current" });
    expect(page.steps.find((step) => step.step === "PRINCIPAL")).toMatchObject({ state: "todo" });
  });

  it("stock at submit is the stock of this submit (decided item 4, Look first); submitted_at stays the first", async () => {
    const { order, manager, branch } = await sentBackByPrincipal();
    const before = (await orderRow(order.id))!;
    const at = new Date("2026-10-16T06:30:00Z");
    await db.insert(stockBalances).values({
      branchId: branch.id,
      variantId: order.variantId,
      qty: "3.000",
      createdAt: at,
      updatedAt: at,
    });
    expect(await run(submitAgainOrders, manager.id, tickedInput([order], {}))).toMatchObject({
      ok: true,
    });
    const after = (await orderRow(order.id))!;
    expect(after.stockAtSubmit).toBe("3.000");
    expect(after.submittedAt).toEqual(before.submittedAt);
  });
});

describe("The checks at submit (05 Checks at submit; 06 rule 8)", () => {
  it("a failing check refuses the whole action with not_ready and its cells; nothing moves", async () => {
    const { branch, manager, head } = await moveScene();
    const [good] = await ordersAt(branch.id, manager.id, "RETURNED");
    const late = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "RETURNED",
      neededBy: "2026-10-01",
    });
    setClock("2026-10-16T05:00:00Z");
    expect(await run(submitAgainOrders, manager.id, tickedInput([good!, late], {}))).toMatchObject({
      ok: false,
      error: {
        code: "not_ready",
        orders: [{ orderId: late.id, code: "not_ready", fields: { neededBy: expect.any(String) } }],
      },
    });
    expect(await orderRow(good!.id)).toMatchObject({ status: "RETURNED", revision: 1 });
    expect(await noticesOf(head.id, "REQUEST_SUBMITTED")).toEqual([]);
  });
});

describe("The Heads are told, one notice per branch (10 Notifications)", () => {
  it("orders of two branches: each active Head gets one notice per branch, the actor none", async () => {
    const { branch, manager, head } = await moveScene();
    const second = await insertBranch();
    const owner = await insertUser("HEAD");
    const [a] = await ordersAt(branch.id, owner.id, "RETURNED");
    const [b] = await ordersAt(second.id, owner.id, "RETURNED");
    expect(await run(submitAgainOrders, owner.id, tickedInput([a!, b!], {}))).toMatchObject({
      ok: true,
    });
    const got = await noticesOf(head.id, "REQUEST_SUBMITTED");
    expect(got.map((notice) => (notice.params as { branch: string }).branch).sort()).toEqual(
      [branch.code, second.code].sort(),
    );
    expect(await noticesOf(owner.id, "REQUEST_SUBMITTED")).toEqual([]);
    expect(await noticesOf(manager.id, "REQUEST_SUBMITTED")).toEqual([]);
  });
});

describe("The Head submits again a Manager's sent-back order (06 Submit again: Owner or Head; D55 item 12; plan of 2.3b)", () => {
  it("Done when: Bekzod's sent-back order, submitted again by the Head, waits for the Head with revision 2", async () => {
    const { order, manager: bekzod, head } = await sentBackByPrincipal();
    const otherHead = await insertUser("HEAD");
    setClock("2026-10-16T07:00:00Z");
    expect(await run(submitAgainOrders, head.id, tickedInput([order], {}))).toMatchObject({
      ok: true,
      data: { orders: [{ id: order.id, status: "PENDING_HEAD" }] },
    });
    expect(await orderRow(order.id)).toMatchObject({
      status: "PENDING_HEAD",
      revision: 2,
      number: order.number,
      ownerId: bekzod.id,
    });
    // The Head step is not skipped: the Head approves it again, as any re-submitted order.
    const page = (await getOrderPage(head.id, order.id))!;
    expect(page.steps.find((step) => step.step === "HEAD")).toMatchObject({ state: "current" });
    expect(page.actions).toContain("APPROVE");
    // "Orders submitted or submitted again | Head": the other Heads, not the actor, not the owner
    // (plan of 2.3b, decided item 10).
    expect(await noticesOf(otherHead.id, "REQUEST_SUBMITTED")).toHaveLength(1);
    expect(await noticesOf(head.id, "REQUEST_SUBMITTED")).toEqual([]);
    expect(await noticesOf(bekzod.id, "REQUEST_SUBMITTED")).toEqual([]);
  });

  it("a Head-created order: the first Submit skips the Head step, Submit again after a send-back does not (server-actions rule: a shortcut holds on the first pass only)", async () => {
    const { branch, head, principal } = await moveScene();
    const draft = await insertOrder({ branchId: branch.id, ownerId: head.id, status: "DRAFT" });
    setClock("2026-10-16T05:00:00Z");
    expect(await run(submitDrafts, head.id, tickedInput([draft], {}))).toMatchObject({
      ok: true,
      data: { orders: [{ id: draft.id, status: "PENDING_PRINCIPAL" }] },
    });
    setClock("2026-10-16T06:00:00Z");
    const sent = (await orderRow(draft.id))!;
    expect(await run(sendBackOrders, principal.id, tickedInput([sent]))).toMatchObject({
      ok: true,
    });
    setClock("2026-10-16T07:00:00Z");
    const back = (await orderRow(draft.id))!;
    expect(await run(submitAgainOrders, head.id, tickedInput([back], {}))).toMatchObject({
      ok: true,
      data: { orders: [{ id: draft.id, status: "PENDING_HEAD" }] },
    });
    expect(await orderRow(draft.id)).toMatchObject({ status: "PENDING_HEAD", revision: 2 });
  });

  it("another Manager of the branch may not submit again Bekzod's order; nothing moves", async () => {
    const { order, branch } = await sentBackByPrincipal();
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    expect(await run(submitAgainOrders, colleague.id, tickedInput([order], {}))).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
    expect(await orderRow(order.id)).toMatchObject({ status: "RETURNED", revision: 1 });
  });
});
