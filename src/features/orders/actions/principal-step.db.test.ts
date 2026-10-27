import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getManagerHome } from "@/features/home/queries/manager-home";
import { getPrincipalHome } from "@/features/home/queries/principal-home";
import { getOrderPage } from "@/features/orders/queries/order-page";
import { NO_FILTERS } from "@/features/orders/list-filters";
import { listOrderGroups } from "@/features/orders/queries/order-list";
import { db } from "@/server/db/client";
import { analyticsSteps, notifications } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { refreshNow } from "../../../../tests/helpers/analytics";
import { setClock } from "../../../../tests/helpers/clock";
import {
  DAY,
  buy,
  expectOk,
  setFinanceStep,
  stepScene,
  ticked,
} from "../../../../tests/helpers/finance-step";
import { noticesOf } from "../../../../tests/helpers/moves";
import { insertOrder, setOrderStatus } from "../../../../tests/helpers/orders";
import {
  atHead,
  headApproves,
  headDraft,
  marksNow,
  setPrincipalStep,
} from "../../../../tests/helpers/principal-step";
import { insertUser } from "../../../../tests/helpers/users";
import { approveOrders } from "./approve";
import { closeSkippedOrders } from "./close-skipped";
import { sendBackOrders } from "./send-back";
import { submitDrafts, submitReadyDrafts } from "./submit";
import { submitAgainOrders } from "./submit-again";

// The orders of the Principal step switch (06-approval-workflow.md, Allowed moves: Submit and the
// Head's Approve; rule 4; Principal step switched off 1 to 3 and 6; 03 rule 6; 07 Purchase record,
// Date bought; 10 Notifications, "Head approved"; Analytics, Approval speed; 11 Order page layout
// 3; plan of 4.10d). Every order goes from Draft through the real actions (D38); each passing case
// has the refused or unchanged one beside it (D40). Every test puts both steps back on. The switch
// itself: src/features/settings/actions/switch-principal-step.db.test.ts; S25:
// principal-step.s25.db.test.ts.

describe("the Head's approval with the step off (06 Principal step switched off 1; 10 Notifications)", () => {
  it("one action over orders of two branches sends both to Finance, marked, and tells each branch's Finance, not its Principal; an order of a third branch it does not touch keeps its status and mark", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const a = await stepScene();
    const b = await stepScene(a.head);
    const c = await stepScene(a.head);
    const first = await atHead(a);
    const second = await atHead(b);
    const untouched = await atHead(c);

    await setPrincipalStep(false);
    await headApproves(a, [first.id, second.id]);
    await setPrincipalStep(true);

    const now = await marksNow([first.id, second.id, untouched.id]);
    for (const id of [first.id, second.id]) {
      expect(now.get(id)).toMatchObject({
        status: "PENDING_FINANCE",
        skippedPrincipal: true,
        skippedFinance: false,
        approvedAt: null,
      });
    }
    expect(now.get(untouched.id)).toMatchObject({
      status: "PENDING_HEAD",
      skippedPrincipal: false,
    });
    for (const scene of [a, b]) {
      expect(await noticesOf(scene.finance.id, "REQUEST_HEAD_APPROVED")).toHaveLength(1);
      expect(await noticesOf(scene.principal.id, "REQUEST_HEAD_APPROVED")).toEqual([]);
    }
    expect(await noticesOf(c.finance.id, "REQUEST_HEAD_APPROVED")).toEqual([]);
    for (const id of [first.id, second.id, untouched.id]) await setOrderStatus(id, "REJECTED");
  });

  it("with the step on the Head's approval waits for the Principal, unmarked, and tells the Principal (D40)", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const order = await atHead(s);
    await headApproves(s, [order.id]);
    expect((await marksNow([order.id])).get(order.id)).toMatchObject({
      status: "PENDING_PRINCIPAL",
      skippedPrincipal: false,
    });
    expect(await noticesOf(s.principal.id, "REQUEST_HEAD_APPROVED")).toHaveLength(1);
    expect(await noticesOf(s.finance.id, "REQUEST_HEAD_APPROVED")).toEqual([]);
    await setOrderStatus(order.id, "REJECTED");
  });
});

describe("both steps off (06 Principal step switched off 3; Finance step switched off 1 to 3; D69)", () => {
  it("the Head's approval opens orders of two branches with both marks and approved_at, and tells their owners and the other Heads, never Finance", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const a = await stepScene();
    const b = await stepScene(a.head);
    const otherHead = await insertUser("HEAD");
    const first = await atHead(a);
    const second = await atHead(b);

    await setPrincipalStep(false);
    await setFinanceStep(false);
    await headApproves(a, [first.id, second.id]);
    await setFinanceStep(true);
    await setPrincipalStep(true);

    const now = await marksNow([first.id, second.id]);
    for (const id of [first.id, second.id]) {
      expect(now.get(id)).toMatchObject({
        status: "PURCHASING",
        skippedPrincipal: true,
        skippedFinance: true,
        approvedAt: new Date(`${DAY}T07:00:00Z`),
      });
    }
    // One notice per branch: each owner theirs, the other Head both; the acting Head none.
    for (const scene of [a, b]) {
      expect(await noticesOf(scene.manager.id, "REQUEST_HEAD_APPROVED")).toHaveLength(1);
      expect(await noticesOf(scene.finance.id, "REQUEST_HEAD_APPROVED")).toEqual([]);
      expect(await noticesOf(scene.principal.id, "REQUEST_HEAD_APPROVED")).toEqual([]);
    }
    expect(await noticesOf(otherHead.id, "REQUEST_HEAD_APPROVED")).toHaveLength(2);
    expect(await noticesOf(a.head.id, "REQUEST_HEAD_APPROVED")).toEqual([]);
  });

  it("an order the Head opened has no cash count and its owner closes it without settlement; a day before the Head's approval is refused naming the Head (07 Date bought)", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const order = await atHead(s);
    await setPrincipalStep(false);
    await setFinanceStep(false);
    await headApproves(s, [order.id]);
    await setFinanceStep(true);
    await setPrincipalStep(true);
    const planned = { id: order.id, variantId: order.variantId };

    expect(await buy(s, [{ order: planned }], "CASH", "2031-03-31")).toMatchObject({
      ok: false,
      error: { fields: { purchasedOn: "errors.field.beforeHeadApproval" } },
    });
    expectOk(
      await buy(s, [{ order: planned, unitPrice: "6500", comment: "Narx oshgan" }], "CASH", DAY),
    );
    expect((await getManagerHome(s.manager.id, s.branch.id)).cash).toEqual({
      held: 0n,
      owed: 0n,
      orders: 0,
    });
    expectOk(await runOrdersAction(closeSkippedOrders, s.manager.id, await ticked([order.id])));
    expect((await marksNow([order.id])).get(order.id)).toMatchObject({ status: "CLOSED" });
  });

  it("with both steps off a Head-created order opens on Submit, Created by Head, with no cash count; a Manager's draft in the same Submit goes to the Head, unmarked (03 rule 6; D40; Done when)", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const own = await headDraft(s);
    const managers = await managersDraft(s);

    await setPrincipalStep(false);
    await setFinanceStep(false);
    expectOk(await runOrdersAction(submitDrafts, s.head.id, await ticked([own.id, managers.id])));
    await setFinanceStep(true);
    await setPrincipalStep(true);

    const now = await marksNow([own.id, managers.id]);
    expect(now.get(own.id)).toMatchObject({
      status: "PURCHASING",
      skippedPrincipal: true,
      skippedFinance: true,
      approvedAt: new Date(`${DAY}T07:00:00Z`),
    });
    expect(now.get(managers.id)).toMatchObject({
      status: "PENDING_HEAD",
      skippedPrincipal: false,
      skippedFinance: false,
      approvedAt: null,
    });
    const page = (await getOrderPage(s.head.id, own.id))!;
    expect(page.events.find((event) => event.type === "SUBMIT")).toMatchObject({
      from: "DRAFT",
      to: "PURCHASING",
      headStepAuto: true,
    });
    expect(page.canRecordMoney).toBe(false);
    // The owner (the Head) and the Manager hear of it; nobody at a skipped step.
    expect(await noticesOf(s.finance.id, "REQUEST_HEAD_APPROVED")).toEqual([]);
    expect(await noticesOf(s.principal.id, "REQUEST_HEAD_APPROVED")).toEqual([]);
    await setOrderStatus(managers.id, "REJECTED");
  });
});

/** A draft the scene's Manager owns, never submitted, that the Head ticks beside its own. */
async function managersDraft(s: Awaited<ReturnType<typeof stepScene>>) {
  const draft = await insertOrder({ branchId: s.branch.id, ownerId: s.manager.id });
  return { id: draft.id };
}

describe("the notices of a Head-created Submit, two branches in one action (10 Notifications, 'Head approved'; .claude/rules/tests.md; permission review of 4.10d, Must fix 1)", () => {
  async function headApprovedOf(userId: string) {
    return db
      .select({ branchId: notifications.branchId, params: notifications.params })
      .from(notifications)
      .where(
        and(eq(notifications.userId, userId), eq(notifications.type, "REQUEST_HEAD_APPROVED")),
      );
  }

  it("with the Principal step off, each branch's Finance is told of its own order only; no Principal is told", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const a = await stepScene();
    const b = await stepScene(a.head);
    const first = await headDraft(a);
    const second = await headDraft(b);

    await setPrincipalStep(false);
    expectOk(await runOrdersAction(submitDrafts, a.head.id, await ticked([first.id, second.id])));
    await setPrincipalStep(true);

    for (const [scene, other] of [
      [a, b],
      [b, a],
    ] as const) {
      expect(await headApprovedOf(scene.finance.id)).toEqual([
        {
          branchId: scene.branch.id,
          params: expect.objectContaining({ branch: scene.branch.code, count: 1 }),
        },
      ]);
      expect(
        (await headApprovedOf(scene.finance.id)).some((row) => row.branchId === other.branch.id),
      ).toBe(false);
      expect(await headApprovedOf(scene.principal.id)).toEqual([]);
    }
    for (const id of [first.id, second.id]) await setOrderStatus(id, "REJECTED");
  });

  it("with both steps off, the other Head is told once per branch; no Finance or Principal is told", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const a = await stepScene();
    const b = await stepScene(a.head);
    const otherHead = await insertUser("HEAD");
    const first = await headDraft(a);
    const second = await headDraft(b);

    await setPrincipalStep(false);
    await setFinanceStep(false);
    expectOk(await runOrdersAction(submitDrafts, a.head.id, await ticked([first.id, second.id])));
    await setFinanceStep(true);
    await setPrincipalStep(true);

    const told = await headApprovedOf(otherHead.id);
    expect(told.map((row) => row.branchId).toSorted()).toEqual(
      [a.branch.id, b.branch.id].toSorted(),
    );
    for (const row of told) expect(row.params).toMatchObject({ count: 1 });
    for (const scene of [a, b]) {
      expect(await headApprovedOf(scene.finance.id)).toEqual([]);
      expect(await headApprovedOf(scene.principal.id)).toEqual([]);
    }
    // The acting Head, who owns both, is never told of its own action.
    expect(await headApprovedOf(a.head.id)).toEqual([]);
  });

  it("Submit with nothing ticked (05 Drafts 4) sends the Head's own ready draft past the Principal too, marked (permission review of 4.10d, Should fix 1)", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const draft = await headDraft(s);
    await setPrincipalStep(false);
    expectOk(await runOrdersAction(submitReadyDrafts, s.head.id, await ticked([draft.id])));
    await setPrincipalStep(true);
    expect((await marksNow([draft.id])).get(draft.id)).toMatchObject({
      status: "PENDING_FINANCE",
      skippedPrincipal: true,
    });
    await setOrderStatus(draft.id, "REJECTED");
  });
});

describe("each round decides again (06 Principal step switched off 2; rule 4; Done when)", () => {
  it("sent back from Finance and approved again by the Head with the step on, the order waits for the Principal and loses the mark", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const order = await atHead(s);
    await setPrincipalStep(false);
    await headApproves(s, [order.id]);
    expect((await marksNow([order.id])).get(order.id)).toMatchObject({ skippedPrincipal: true });

    expectOk(
      await runOrdersAction(
        sendBackOrders,
        s.finance.id,
        await ticked([order.id], { reason: "Narxni tekshiring" }),
      ),
    );
    await setPrincipalStep(true);
    setClock(`${DAY}T08:00:00Z`);
    expectOk(await runOrdersAction(submitAgainOrders, s.manager.id, await ticked([order.id])));
    // Waiting for Head again, the mark is kept until the Head decides (decided item 3).
    expect((await marksNow([order.id])).get(order.id)).toMatchObject({
      status: "PENDING_HEAD",
      skippedPrincipal: true,
    });
    await headApproves(s, [order.id]);
    expect((await marksNow([order.id])).get(order.id)).toMatchObject({
      status: "PENDING_PRINCIPAL",
      skippedPrincipal: false,
    });
    const page = (await getOrderPage(s.head.id, order.id))!;
    expect(page.steps.find((view) => view.step === "PRINCIPAL")?.state).toBe("current");
    await setOrderStatus(order.id, "REJECTED");
  });

  it("a marked order sent back and submitted again with the step off goes to the Head and keeps its mark (06 rule 4)", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const order = await atHead(s);
    await setPrincipalStep(false);
    await headApproves(s, [order.id]);
    expectOk(
      await runOrdersAction(
        sendBackOrders,
        s.finance.id,
        await ticked([order.id], { reason: "Narxni tekshiring" }),
      ),
    );
    setClock(`${DAY}T08:00:00Z`);
    expectOk(await runOrdersAction(submitAgainOrders, s.manager.id, await ticked([order.id])));
    expect((await marksNow([order.id])).get(order.id)).toMatchObject({
      status: "PENDING_HEAD",
      skippedPrincipal: true,
    });
    await setPrincipalStep(true);
    await setOrderStatus(order.id, "REJECTED");
  });
});

describe("the Principal stays (06 Principal step switched off 6; 02 A5)", () => {
  it("the branch's Principal sees a skipped order on its page and in the list, with no action, and has nothing waiting; with the step on the Head cannot approve at the Principal's step", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const skipped = await atHead(s);
    await setPrincipalStep(false);
    await headApproves(s, [skipped.id]);
    await setPrincipalStep(true);

    const page = (await getOrderPage(s.principal.id, skipped.id))!;
    expect(page.skippedPrincipal).toBe(true);
    expect(page.actions).toEqual([]);
    const listed = await listOrderGroups(s.principal.id, { ...NO_FILTERS, branch: s.branch.id });
    expect(listed.groups.flatMap((group) => group.orders.map((order) => order.id))).toContain(
      skipped.id,
    );
    expect((await getPrincipalHome(s.principal.id, s.branch.id)).waiting.count).toBe(0);

    const waiting = await atHead(s);
    await headApproves(s, [waiting.id]);
    expect(
      await runOrdersAction(approveOrders, s.head.id, await ticked([waiting.id])),
    ).toMatchObject({ ok: false, error: { code: "forbidden" } });
    for (const id of [skipped.id, waiting.id]) await setOrderStatus(id, "REJECTED");
  });
});

describe("the order page and the approval speed of a skipped order (11 Order page layout 3; 06 rule 11; 10 Analytics, Approval speed)", () => {
  it("the Principal step reads Skipped and the Head's approval is the move that skipped it; the stays are Head and Finance only", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const s = await stepScene();
    const order = await atHead(s);
    await setPrincipalStep(false);
    setClock(`${DAY}T09:00:00Z`);
    await headApproves(s, [order.id]);
    await setPrincipalStep(true);

    const page = (await getOrderPage(s.finance.id, order.id))!;
    expect(page.steps.find((view) => view.step === "PRINCIPAL")).toEqual({
      step: "PRINCIPAL",
      state: "skipped",
      by: null,
    });
    const approval = page.events.find((event) => event.type === "APPROVE");
    expect(approval).toMatchObject({ from: "PENDING_HEAD", to: "PENDING_FINANCE" });

    await refreshNow();
    const stays = await db
      .select({ step: analyticsSteps.step, seconds: analyticsSteps.seconds })
      .from(analyticsSteps)
      .where(inArray(analyticsSteps.orderId, [order.id]));
    expect(stays.toSorted((x, y) => x.step.localeCompare(y.step))).toEqual([
      { step: "PENDING_FINANCE", seconds: null },
      { step: "PENDING_HEAD", seconds: 7_200n },
    ]);
    await setOrderStatus(order.id, "REJECTED");
  });
});
