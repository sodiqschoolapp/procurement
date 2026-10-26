import { randomUUID } from "node:crypto";

import { asc, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { orderActions, orderEvents, orders, products } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { advanceClock, setClock } from "../../../../tests/helpers/clock";
import { insertDepartment, insertItem, insertOrder } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { listDrafts } from "../queries/drafts";
import { updateDraft } from "./drafts";
import { submitDrafts, submitReadyDrafts } from "./submit";

// Submit with nothing ticked, build plan 2.5c (Done when; S23) and the plan's Tests:
// 05-order-request-form.md (Drafts 4, 5; Checks at submit: "At most 200 orders in one submit …
// the first 200 in the order they were added"; "A draft that fails a check is not sent and stays
// in the sheet; the ready ones are sent. A draft that changed since the screen showed it refuses
// the whole submit"), 06-approval-workflow.md rule 8 and its one exception,
// edge-cases/requests-and-approval.md ("A product is deactivated while it sits in a draft"),
// developer-rules.md rule 8. The permission rows are drafts-matrix.db.test.ts. Every passing case
// has the data the action must leave beside it (D40).

type Shown = { id: string; version: number };

const sent = (drafts: readonly Shown[], clientKey: string = randomUUID()) => ({
  clientKey,
  orders: drafts.map(({ id, version }) => ({ id, version })),
});

const submitReady = (userId: string, input: unknown) =>
  runOrdersAction(submitReadyDrafts, userId, input);

async function scene() {
  setClock("2026-10-26T05:00:00Z");
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const head = await insertUser("HEAD");
  return { branch, manager, head };
}

/** A draft of an owner, a second after the last (05 Order number 5: numbers in creation order). */
async function draft(
  branchId: string,
  ownerId: string,
  row: Parameters<typeof insertOrder>[0] | object = {},
) {
  const made = await insertOrder({ branchId, ownerId, ...row });
  advanceClock({ seconds: 1 });
  return made;
}

/** A draft with no price yet (05 field 11 empty). */
async function withoutPrice(orderId: string) {
  await db
    .update(orders)
    .set({ plannedPrice: null, plannedTotal: null })
    .where(eq(orders.id, orderId));
}

async function stateOf(ids: readonly string[]) {
  return db
    .select({
      id: orders.id,
      number: orders.number,
      status: orders.status,
      version: orders.version,
      priority: orders.priority,
    })
    .from(orders)
    .where(inArray(orders.id, [...ids]))
    .orderBy(asc(orders.createdAt));
}

async function eventsOf(ids: readonly string[]) {
  return db
    .select()
    .from(orderEvents)
    .where(inArray(orderEvents.orderId, [...ids]));
}

function okOf<T>(result: { ok: boolean }): T {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
}

type Answer = {
  actionId: string;
  orders: { id: string; status: string }[];
  left?: { orderId: string; code: string; fields?: Record<string, string> }[];
  heldBack?: number;
};

describe("S23: the order sheet (15 S23; 05 Drafts 4, 5, 6)", () => {
  it("sends the ready drafts with the next numbers; the markers without a price and the sent-back order stay; once priced, the markers go with the next number", async () => {
    const { branch, manager } = await scene();
    const maths = await insertDepartment(branch.id, { name: "Maths" });
    const notebooks = await draft(branch.id, manager.id, {
      departmentId: maths.id,
      neededBy: "2026-11-05",
      plannedQty: "100.000",
    });
    const pens = await draft(branch.id, manager.id, {
      departmentId: maths.id,
      neededBy: "2026-11-05",
      plannedQty: "20.000",
    });
    const markers = await draft(branch.id, manager.id, {
      departmentId: maths.id,
      neededBy: "2026-11-05",
      plannedQty: "5.000",
    });
    await withoutPrice(markers.id);
    const sentBack = await draft(branch.id, manager.id, {
      status: "RETURNED",
      number: `${branch.code}-25-0091`,
    });
    // The pens get "Urgent" under "More": the same save as the sheet's (05 field 14).
    okOf(
      await runAction(updateDraft, manager.id, {
        id: pens.id,
        version: pens.version,
        priority: "URGENT",
        urgentReason: "Exams on Monday",
      }),
    );

    // The submit set the sheet loads holds the three own drafts only, oldest first (05 Drafts 4).
    const page = await listDrafts(manager.id);
    expect(page.submitSet.map((one) => one.id)).toEqual([notebooks.id, pens.id, markers.id]);
    expect(page.submitSet[2]!.refusals).toEqual({ price: "required" });
    expect(page.rows.map((row) => row.id)).toContain(sentBack.id);

    const answer = okOf<Answer>(await submitReady(manager.id, sent(page.submitSet)));
    expect(answer.orders.map((order) => order.id).sort()).toEqual([notebooks.id, pens.id].sort());
    expect(answer.left).toEqual([
      { orderId: markers.id, code: "not_ready", fields: { price: "errors.field.required" } },
    ]);
    expect(answer.heldBack).toBe(0);

    const [a, b, c, d] = await stateOf([notebooks.id, pens.id, markers.id, sentBack.id]);
    expect(a).toMatchObject({ number: `${branch.code}-26-0001`, status: "PENDING_HEAD" });
    expect(b).toMatchObject({
      number: `${branch.code}-26-0002`,
      status: "PENDING_HEAD",
      priority: "URGENT",
    });
    // The markers are untouched: the same version, no number, no event (06 rule 8 exception).
    expect(c).toMatchObject({ number: null, status: "DRAFT", version: markers.version });
    expect(await eventsOf([markers.id])).toEqual([]);
    // The sent-back order stays, not submitted again (05 Drafts 4: only when ticked).
    expect(d).toMatchObject({ status: "RETURNED", version: sentBack.version });
    expect(await eventsOf([sentBack.id])).toEqual([]);

    // Once the price is typed, Submit sends the markers with the next number.
    okOf(
      await runAction(updateDraft, manager.id, {
        id: markers.id,
        version: markers.version,
        price: "8000",
      }),
    );
    const again = await listDrafts(manager.id);
    expect(again.submitSet.map((one) => one.id)).toEqual([markers.id]);
    okOf(await submitReady(manager.id, sent(again.submitSet)));
    expect((await stateOf([markers.id]))[0]).toMatchObject({
      number: `${branch.code}-26-0003`,
      status: "PENDING_HEAD",
    });
  });
});

describe("Submit with nothing ticked (05 Drafts 4; Checks at submit; 06 rule 8)", () => {
  it("one draft without a price: the others are sent and that one is left, marked on its price", async () => {
    const { branch, manager } = await scene();
    const first = await draft(branch.id, manager.id);
    const noPrice = await draft(branch.id, manager.id);
    const last = await draft(branch.id, manager.id);
    await withoutPrice(noPrice.id);

    const answer = okOf<Answer>(
      await submitReady(manager.id, sent((await listDrafts(manager.id)).submitSet)),
    );
    expect(answer.orders.map((order) => order.id).sort()).toEqual([first.id, last.id].sort());
    expect(answer.left).toEqual([
      { orderId: noPrice.id, code: "not_ready", fields: { price: "errors.field.required" } },
    ]);
    const [action] = await db
      .select({ orderCount: orderActions.orderCount })
      .from(orderActions)
      .where(eq(orderActions.id, answer.actionId));
    expect(action!.orderCount).toBe(2);
  });

  it("ticked drafts with one failing send nothing (06 rule 8): the ticked Submit stays all or nothing", async () => {
    const { branch, manager } = await scene();
    const ready = await draft(branch.id, manager.id);
    const noPrice = await draft(branch.id, manager.id);
    await withoutPrice(noPrice.id);
    const refused = await runOrdersAction(submitDrafts, manager.id, sent([ready, noPrice]));
    expect(refused).toMatchObject({
      ok: false,
      error: { code: "not_ready", orders: [{ orderId: noPrice.id }] },
    });
    expect((await stateOf([ready.id]))[0]).toMatchObject({ status: "DRAFT", number: null });
  });

  it("201 ready drafts send 200, then 1; a not-ready draft made before them takes no place and stays", async () => {
    const { branch, manager } = await scene();
    const notReady = await draft(branch.id, manager.id);
    await withoutPrice(notReady.id);
    const ready = [];
    for (let at = 0; at < 201; at += 1) ready.push(await draft(branch.id, manager.id));

    const set = (await listDrafts(manager.id)).submitSet;
    expect(set).toHaveLength(202);
    const answer = okOf<Answer>(await submitReady(manager.id, sent(set)));
    expect(answer.orders).toHaveLength(200);
    expect(new Set(answer.orders.map((order) => order.id))).toEqual(
      new Set(ready.slice(0, 200).map((order) => order.id)),
    );
    expect(answer.heldBack).toBe(1);
    expect(answer.left!.map((order) => order.orderId)).toEqual([notReady.id]);
    // The 201st and the not-ready one keep their version and have no event; the action counts 200.
    const [held] = await stateOf([ready[200]!.id]);
    expect(held).toMatchObject({ status: "DRAFT", number: null, version: ready[200]!.version });
    expect(await eventsOf([ready[200]!.id, notReady.id])).toEqual([]);
    const [action] = await db
      .select({ orderCount: orderActions.orderCount })
      .from(orderActions)
      .where(eq(orderActions.id, answer.actionId));
    expect(action!.orderCount).toBe(200);

    const next = (await listDrafts(manager.id)).submitSet;
    expect(next.map((one) => one.id)).toEqual([notReady.id, ready[200]!.id]);
    const then = okOf<Answer>(await submitReady(manager.id, sent(next)));
    expect(then.orders.map((order) => order.id)).toEqual([ready[200]!.id]);
    expect((await stateOf([ready[200]!.id]))[0]!.number).toBe(`${branch.code}-26-0201`);
  });

  it("a draft another tab changed after the screen loaded refuses the whole submit and names it", async () => {
    const { branch, manager } = await scene();
    const ready = await draft(branch.id, manager.id);
    const changed = await draft(branch.id, manager.id);
    const set = (await listDrafts(manager.id)).submitSet;
    okOf(
      await runAction(updateDraft, manager.id, {
        id: changed.id,
        version: changed.version,
        quantity: "7",
      }),
    );
    expect(await submitReady(manager.id, sent(set))).toMatchObject({
      ok: false,
      error: { code: "stale_version", orders: [{ orderId: changed.id, code: "stale_version" }] },
    });
    expect((await stateOf([ready.id]))[0]).toMatchObject({ status: "DRAFT", number: null });
  });

  it("a draft added in another tab after the screen loaded is not sent", async () => {
    const { branch, manager } = await scene();
    const shown = await draft(branch.id, manager.id);
    const set = (await listDrafts(manager.id)).submitSet;
    const later = await draft(branch.id, manager.id);
    const answer = okOf<Answer>(await submitReady(manager.id, sent(set)));
    expect(answer.orders.map((order) => order.id)).toEqual([shown.id]);
    expect((await stateOf([later.id]))[0]).toMatchObject({
      status: "DRAFT",
      number: null,
      version: later.version,
    });
  });

  it("a sent-back and a taken-back order are not in the set, and either sent refuses the whole (05 Drafts 4, 5)", async () => {
    const { branch, manager } = await scene();
    const ready = await draft(branch.id, manager.id);
    const sentBack = await draft(branch.id, manager.id, {
      status: "RETURNED",
      number: `${branch.code}-25-0091`,
    });
    const takenBack = await draft(branch.id, manager.id, { number: `${branch.code}-25-0092` });
    const set = (await listDrafts(manager.id)).submitSet;
    expect(set.map((one) => one.id)).toEqual([ready.id]);

    expect(await submitReady(manager.id, sent([ready, takenBack]))).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: takenBack.id, code: "wrong_status" }] },
    });
    expect(await submitReady(manager.id, sent([ready, sentBack]))).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: sentBack.id, code: "wrong_status" }] },
    });
    expect(await stateOf([ready.id, sentBack.id, takenBack.id])).toEqual([
      expect.objectContaining({ status: "DRAFT", number: null }),
      expect.objectContaining({ status: "RETURNED", version: sentBack.version }),
      expect.objectContaining({ status: "DRAFT", version: takenBack.version }),
    ]);
  });

  it("the Head's Submit with nothing ticked sends none of a Manager's drafts", async () => {
    const { branch, manager, head } = await scene();
    const managers = await draft(branch.id, manager.id);
    const heads = await draft(branch.id, head.id);
    // In the "all owners" view the sheet shows the Manager's draft; the set holds the Head's only.
    const page = await listDrafts(head.id, { owners: "all" });
    expect(page.rows.map((row) => row.id)).toContain(managers.id);
    expect(page.submitSet.map((one) => one.id)).toEqual([heads.id]);

    const answer = okOf<Answer>(await submitReady(head.id, sent(page.submitSet)));
    expect(answer.orders.map((order) => order.id)).toEqual([heads.id]);
    // The Manager's draft sent by a forged screen refuses the whole (decided item 2).
    const more = await draft(branch.id, head.id);
    expect(await submitReady(head.id, sent([more, managers]))).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: managers.id, code: "forbidden" }] },
    });
    expect(await stateOf([managers.id, more.id])).toEqual([
      expect.objectContaining({ status: "DRAFT", number: null }),
      expect.objectContaining({ status: "DRAFT", number: null }),
    ]);
  });

  it("a draft whose product was deactivated is left, marked; the other ready drafts are sent (edge case)", async () => {
    const { branch, manager } = await scene();
    const item = await insertItem();
    const ready = await draft(branch.id, manager.id);
    const gone = await draft(branch.id, manager.id, { variantId: item.variantId });
    const set = (await listDrafts(manager.id)).submitSet;
    await db.update(products).set({ isActive: false }).where(eq(products.id, item.id));

    const answer = okOf<Answer>(await submitReady(manager.id, sent(set)));
    expect(answer.orders.map((order) => order.id)).toEqual([ready.id]);
    expect(answer.left).toEqual([
      { orderId: gone.id, code: "not_ready", fields: { variantId: "errors.field.inactive" } },
    ]);
  });

  it("with no draft ready the whole is refused not_ready, each named, nothing written", async () => {
    const { branch, manager } = await scene();
    const one = await draft(branch.id, manager.id);
    const two = await draft(branch.id, manager.id, { neededBy: "2026-10-25" });
    await withoutPrice(one.id);
    const input = sent([one, two]);
    expect(await submitReady(manager.id, input)).toMatchObject({
      ok: false,
      error: {
        code: "not_ready",
        orders: [
          { orderId: one.id, fields: { price: "errors.field.required" } },
          { orderId: two.id, fields: { neededBy: "errors.field.inPast" } },
        ],
      },
    });
    expect(
      await db.select().from(orderActions).where(eq(orderActions.clientKey, input.clientKey)),
    ).toEqual([]);
  });

  it("the same client key twice answers the first result: the same submitted and stayed drafts (developer-rules rule 8)", async () => {
    const { branch, manager } = await scene();
    const ready = await draft(branch.id, manager.id);
    const noPrice = await draft(branch.id, manager.id);
    await withoutPrice(noPrice.id);
    const input = sent((await listDrafts(manager.id)).submitSet);

    const first = okOf<Answer>(await submitReady(manager.id, input));
    const second = okOf<Answer>(await submitReady(manager.id, input));
    expect(second).toEqual(first);
    expect(second.left!.map((order) => order.orderId)).toEqual([noPrice.id]);
    expect(await eventsOf([ready.id])).toHaveLength(1);
    expect(
      await db.select().from(orderActions).where(eq(orderActions.clientKey, input.clientKey)),
    ).toHaveLength(1);
  });

  it("another branch's draft in the set is Not found and nothing is saved (03 rule 1)", async () => {
    const { branch, manager } = await scene();
    const other = await insertBranch();
    const mine = await draft(branch.id, manager.id);
    const theirs = await draft(
      other.id,
      (await insertUser("MANAGER", { branches: [other.id] })).id,
    );
    expect(await submitReady(manager.id, sent([mine, theirs]))).toMatchObject({
      ok: false,
      error: { code: "not_found", orders: [{ orderId: theirs.id, code: "not_found" }] },
    });
    expect((await stateOf([mine.id]))[0]).toMatchObject({ status: "DRAFT", number: null });
  });

  it("1 001 drafts sent are refused by the input check (decided item 1: at most 1 000)", async () => {
    const { manager } = await scene();
    const input = {
      clientKey: randomUUID(),
      orders: Array.from({ length: 1001 }, () => ({ id: randomUUID(), version: 1 })),
    };
    expect(await submitReady(manager.id, input)).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
  });
});
