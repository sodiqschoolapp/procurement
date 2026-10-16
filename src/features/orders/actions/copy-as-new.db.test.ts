import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { draftTotal } from "@/domain/drafts";
import type { RequestStatus } from "@/domain/request-status";
import { runAction } from "@/server/action";
import { now } from "@/server/clock";
import { runCopyAction } from "@/server/copy-action";
import { db } from "@/server/db/client";
import {
  branches,
  companies,
  orderActions,
  orderDraftAdds,
  orderEvents,
  orderExtras,
  orders,
  products,
  userBranches,
} from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { insertCompany } from "../../../../tests/helpers/catalog";
import {
  REASON,
  eventsOf,
  moveScene,
  ordersAt,
  tickedInput,
} from "../../../../tests/helpers/moves";
import {
  insertExtraCostType,
  insertItem,
  insertOrder,
  inventedNumber,
  orderRow,
  setOrderStatus,
} from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { listDrafts } from "../queries/drafts";
import { copyOrdersAsNew } from "./copy-as-new";
import { updateDraft } from "./drafts";
import { rejectOrders } from "./reject";
import { submitDrafts } from "./submit";

// Copy as new, build plan 2.13: 05-order-request-form.md (Ticking and filters: "Any order,
// including a rejected one, can be copied into a new draft; several ticked orders can be copied
// at once"; Drafts 2 and 5), 15-quality-and-acceptance.md S6 ("Status Rejected, read-only. 'Copy
// as new' creates a draft"), edge-cases/requests-and-approval.md ("A product is deactivated while
// it sits in a draft"), developer-rules.md rules 4 and 8, 06 rule 8; plan of 2.13, decided items
// 1 to 7 and the review's corrections. The permission rows are in actions-matrix.db.test.ts.

type Ticked = { id: string; version: number };

function copyInput(ticked: readonly Ticked[]) {
  return {
    orders: ticked.map(({ id, version }) => ({ id, version, clientKey: randomUUID() })),
  };
}

function copy(userId: string, input: unknown) {
  return runCopyAction(copyOrdersAsNew, userId, input);
}

function okOf<T>(result: { ok: boolean }): T {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
}

type Made = { orders: { id: string; made: { id: string; merged: boolean; quantity?: string } }[] };

/** The never-submitted drafts of an owner. */
async function draftsOf(ownerId: string) {
  return db
    .select()
    .from(orders)
    .where(and(eq(orders.ownerId, ownerId), eq(orders.status, "DRAFT")));
}

async function extrasOf(orderId: string) {
  return db
    .select({ type: orderExtras.extraCostTypeId, amount: orderExtras.amount })
    .from(orderExtras)
    .where(eq(orderExtras.orderId, orderId))
    .orderBy(orderExtras.createdAt, orderExtras.id);
}

/**
 * Gives an order plan fields and extra costs while it is Sent back, the last status whose plan may
 * change (`orders_plan_frozen`), then moves it to `status` straight in the table.
 */
async function withPlan(
  orderId: string,
  status: RequestStatus,
  plan: { set?: Partial<typeof orders.$inferInsert>; extras?: bigint[] },
) {
  await setOrderStatus(orderId, "RETURNED");
  if (plan.set) await db.update(orders).set(plan.set).where(eq(orders.id, orderId));
  for (const amount of plan.extras ?? []) {
    await db.insert(orderExtras).values({
      orderId,
      extraCostTypeId: (await insertExtraCostType()).id,
      amount,
      createdAt: now(),
    });
  }
  await setOrderStatus(orderId, status);
}

/** The ticked form of an order as it stands now. */
async function tickedOf(id: string): Promise<Ticked> {
  const row = await orderRow(id);
  return { id, version: row!.version };
}

describe("S6: a rejected order is copied as new (15 S6; 05 Ticking and filters)", () => {
  it("the Principal rejects; the owner copies it into a draft with the same plan; the rejected order is untouched", async () => {
    const scene = await moveScene();
    // The product has a default company; the order has none, and its copy keeps none (review
    // correction 2).
    const company = await insertCompany();
    const item = await insertItem({ referencePrice: 6_500n, defaultCompanyId: company.id });
    const extraType = await insertExtraCostType();
    const order = await insertOrder({
      branchId: scene.branch.id,
      ownerId: scene.manager.id,
      status: "PENDING_PRINCIPAL",
      variantId: item.variantId,
      plannedQty: "10.000",
      plannedPrice: 5_000n,
      paymentType: "TRANSFER",
      priority: "URGENT",
      urgentReason: "Invented urgent reason",
      neededBy: "2031-05-01",
    });
    await setOrderStatus(order.id, "RETURNED");
    await db
      .update(orders)
      .set({ requesterName: "Invented Requester", comment: "Invented comment" })
      .where(eq(orders.id, order.id));
    await db.insert(orderExtras).values({
      orderId: order.id,
      extraCostTypeId: extraType.id,
      amount: 3_000n,
      createdAt: now(),
    });
    await setOrderStatus(order.id, "PENDING_PRINCIPAL");

    const rejected = await runOrdersAction(rejectOrders, scene.principal.id, tickedInput([order]));
    expect(rejected).toMatchObject({ ok: true, data: { orders: [{ status: "REJECTED" }] } });
    const before = await orderRow(order.id);
    expect(before).toMatchObject({ status: "REJECTED" });
    // Read-only: an edit is refused (06 rule 2).
    expect(
      await runAction(updateDraft, scene.manager.id, {
        id: order.id,
        version: before!.version,
        quantity: "5",
      }),
    ).toMatchObject({ ok: false });

    const made = okOf<Made>(await copy(scene.manager.id, copyInput([await tickedOf(order.id)])));
    expect(made.orders).toEqual([
      { id: order.id, made: { id: expect.any(String), merged: false, version: 1 } },
    ]);
    const draft = await orderRow(made.orders[0]!.made.id);
    expect(draft).toMatchObject({
      status: "DRAFT",
      number: null,
      revision: 1,
      branchId: scene.branch.id,
      ownerId: scene.manager.id,
      createdBy: scene.manager.id,
      variantId: item.variantId,
      departmentId: order.departmentId,
      companyId: null,
      requesterName: "Invented Requester",
      neededBy: "2031-05-01",
      plannedQty: "10.000",
      plannedPrice: 5_000n,
      paymentType: "TRANSFER",
      priority: "URGENT",
      urgentReason: "Invented urgent reason",
      comment: "Invented comment",
      referencePhotoFileId: null,
      submittedAt: null,
      stockAtSubmit: null,
    });
    // planned_total is draftTotal() of the new row, never copied (decided item 3, Look first).
    expect(draft!.plannedTotal).toBe(
      draftTotal({ quantity: "10", price: 5_000n, extras: [3_000n], paymentType: "TRANSFER" }),
    );
    expect(await extrasOf(draft!.id)).toEqual([{ type: extraType.id, amount: 3_000n }]);

    // The rejected order: same status, version and history; no action row was written.
    expect(await orderRow(order.id)).toEqual(before);
    expect(await eventsOf(order.id)).toEqual([
      { type: "REJECT", from: "PENDING_PRINCIPAL", to: "REJECTED", comment: REASON, note: null },
    ]);
    expect(await db.select().from(orderEvents).where(eq(orderEvents.orderId, draft!.id))).toEqual(
      [],
    );
  });
});

describe("Several ticked orders and the draft merge (05 Drafts 2 and 5; decided items 2 and 3, Look first)", () => {
  it("orders of two subtypes make two drafts", async () => {
    const { branch, manager } = await moveScene();
    const [a, b] = await ordersAt(branch.id, manager.id, "PENDING_HEAD", 2);
    const made = okOf<Made>(await copy(manager.id, copyInput([a!, b!])));
    expect(made.orders.map((order) => order.made.merged)).toEqual([false, false]);
    expect(await draftsOf(manager.id)).toHaveLength(2);
  });

  it("two ticked orders of one trio make one draft: the first sent sets the plan, the second adds its quantity", async () => {
    const { branch, manager } = await moveScene();
    const item = await insertItem();
    const first = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "CLOSED",
      variantId: item.variantId,
      plannedQty: "10.000",
      plannedPrice: 5_000n,
      paymentType: "TRANSFER",
    });
    await withPlan(first.id, "CLOSED", { extras: [3_000n] });
    const second = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "REJECTED",
      variantId: item.variantId,
      departmentId: first.departmentId,
      plannedQty: "4.000",
      plannedPrice: 7_000n,
      paymentType: "CASH",
    });
    // Sent against the lock's order by id: the order sent decides.
    const sent = first.id > second.id ? [first, second] : [second, first];
    const [lead, follower] = sent;
    const made = okOf<Made>(await copy(manager.id, copyInput(sent)));
    expect(made.orders.map((order) => order.id)).toEqual([lead!.id, follower!.id]);
    expect(made.orders[0]!.made).toMatchObject({ merged: false });
    expect(made.orders[1]!.made).toMatchObject({
      id: made.orders[0]!.made.id,
      merged: true,
      quantity: "14",
    });

    const [draft] = await draftsOf(manager.id);
    const leadPrice = lead === first ? 5_000n : 7_000n;
    const leadType = lead === first ? "TRANSFER" : "CASH";
    const leadExtras = lead === first ? [3_000n] : [];
    expect(draft).toMatchObject({
      plannedQty: "14.000",
      plannedPrice: leadPrice,
      paymentType: leadType,
    });
    expect((await extrasOf(draft!.id)).map((extra) => extra.amount)).toEqual(leadExtras);
    expect(draft!.plannedTotal).toBe(
      draftTotal({ quantity: "14", price: leadPrice, extras: leadExtras, paymentType: leadType }),
    );
  });

  it("the copier's never-submitted draft of the trio rises; its price, extras and payment type stay", async () => {
    const { branch, manager } = await moveScene();
    const item = await insertItem();
    const own = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "DRAFT",
      variantId: item.variantId,
      plannedQty: "5.000",
      plannedPrice: 6_000n,
      paymentType: "CASH",
    });
    const source = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PENDING_FINANCE",
      variantId: item.variantId,
      departmentId: own.departmentId,
      plannedQty: "10.000",
      plannedPrice: 5_000n,
      paymentType: "CARD",
    });
    await withPlan(source.id, "PENDING_FINANCE", { extras: [3_000n] });
    const input = copyInput([source]);
    const made = okOf<Made>(await copy(manager.id, input));
    expect(made.orders[0]!.made).toMatchObject({ id: own.id, merged: true, quantity: "15" });
    const raised = await orderRow(own.id);
    expect(raised).toMatchObject({
      plannedQty: "15.000",
      plannedPrice: 6_000n,
      paymentType: "CASH",
      version: 2,
    });
    expect(raised!.plannedTotal).toBe(
      draftTotal({ quantity: "15", price: 6_000n, extras: [], paymentType: "CASH" }),
    );
    expect(await extrasOf(own.id)).toEqual([]);
    expect(await draftsOf(manager.id)).toHaveLength(1);
    expect(
      await db
        .select({ key: orderDraftAdds.clientKey })
        .from(orderDraftAdds)
        .where(eq(orderDraftAdds.orderId, own.id)),
    ).toEqual([{ key: input.orders[0]!.clientKey }]);
  });

  it("a sent-back order and a taken-back numbered draft of the trio are never merged into (05 Drafts 5)", async () => {
    const { branch, manager } = await moveScene();
    const item = await insertItem();
    const returned = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "RETURNED",
      variantId: item.variantId,
    });
    const takenBack = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "DRAFT",
      number: "TST-26-9901",
      variantId: item.variantId,
      departmentId: returned.departmentId,
    });
    const source = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "REJECTED",
      variantId: item.variantId,
      departmentId: returned.departmentId,
    });
    const made = okOf<Made>(await copy(manager.id, copyInput([source])));
    expect(made.orders[0]!.made).toMatchObject({ merged: false });
    expect(made.orders[0]!.made.id).not.toBe(takenBack.id);
    expect(await orderRow(returned.id)).toMatchObject({ plannedQty: "10.000", version: 1 });
    expect(await orderRow(takenBack.id)).toMatchObject({ plannedQty: "10.000", version: 1 });
  });

  it("the Head copies a Manager's order and another owner's Draft: the drafts are the Head's, in the order's branch", async () => {
    const { branch, manager, head } = await moveScene();
    const [waiting] = await ordersAt(branch.id, manager.id, "PENDING_HEAD");
    const [draft] = await ordersAt(branch.id, manager.id, "DRAFT");
    const made = okOf<Made>(await copy(head.id, copyInput([waiting!, draft!])));
    const rows = await db
      .select({ ownerId: orders.ownerId, branchId: orders.branchId })
      .from(orders)
      .where(
        inArray(
          orders.id,
          made.orders.map((order) => order.made.id),
        ),
      );
    expect(rows).toEqual([
      { ownerId: head.id, branchId: branch.id },
      { ownerId: head.id, branchId: branch.id },
    ]);
  });
});

describe("A Manager copies a colleague's order of the own branch (03 matrix: branch scope; decided item 1)", () => {
  it("the copy is the Manager's own draft", async () => {
    const { branch, manager } = await moveScene();
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    const [theirs] = await ordersAt(branch.id, colleague.id, "REJECTED");
    const made = okOf<Made>(await copy(manager.id, copyInput([theirs!])));
    expect(await orderRow(made.orders[0]!.made.id)).toMatchObject({
      ownerId: manager.id,
      status: "DRAFT",
    });
    expect(await orderRow(theirs!.id)).toMatchObject({ ownerId: colleague.id, status: "REJECTED" });
  });
});

describe("A copy is safe to repeat (developer-rules.md rule 8; decided item 4, Look first)", () => {
  it("the same keys twice give the first answer and make nothing new", async () => {
    const { branch, manager } = await moveScene();
    const [a, b] = await ordersAt(branch.id, manager.id, "REJECTED", 2);
    const input = copyInput([a!, b!]);
    const first = okOf<Made>(await copy(manager.id, input));
    expect(await copy(manager.id, input)).toEqual({ ok: true, data: first });
    expect(await draftsOf(manager.id)).toHaveLength(2);
  });

  it("a merged copy repeated answers the stored add", async () => {
    const { branch, manager } = await moveScene();
    const [source] = await ordersAt(branch.id, manager.id, "REJECTED");
    await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "DRAFT",
      variantId: source!.variantId,
      departmentId: source!.departmentId,
    });
    const input = copyInput([source!]);
    const first = okOf<Made>(await copy(manager.id, input));
    expect(first.orders[0]!.made).toMatchObject({ merged: true, quantity: "20" });
    expect(await copy(manager.id, input)).toEqual({ ok: true, data: first });
    expect((await draftsOf(manager.id))[0]).toMatchObject({ plannedQty: "20.000" });
  });

  it("another user sending the same keys gets Not found", async () => {
    const { branch, manager } = await moveScene();
    const other = await insertUser("MANAGER", { branches: [branch.id] });
    const [a] = await ordersAt(branch.id, manager.id, "REJECTED");
    const input = copyInput([a!]);
    okOf(await copy(manager.id, input));
    expect(await copy(other.id, input)).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await draftsOf(other.id)).toEqual([]);
  });

  it("the same keys with an order id of another branch are Not found, and nothing is written (permission review, Must fix 1)", async () => {
    const { branch, manager } = await moveScene();
    const [a] = await ordersAt(branch.id, manager.id, "REJECTED");
    const input = copyInput([a!]);
    okOf(await copy(manager.id, input));
    const other = await insertBranch();
    const otherOwner = await insertUser("MANAGER", { branches: [other.id] });
    const [foreign] = await ordersAt(other.id, otherOwner.id, "REJECTED");
    const forged = { orders: [{ ...input.orders[0]!, id: foreign!.id }] };
    expect(await copy(manager.id, forged)).toMatchObject({
      ok: false,
      error: { code: "not_found", orders: [{ orderId: foreign!.id, code: "not_found" }] },
    });
    expect(
      await copy(manager.id, { orders: [{ ...input.orders[0]!, id: randomUUID() }] }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await draftsOf(manager.id)).toHaveLength(1);
  });

  it("a repeat after the maker left the branch, or after CREATE_REQUESTS was switched off, is Not found (decided item 4)", async () => {
    const { branch, manager } = await moveScene();
    const second = await insertBranch();
    await db.insert(userBranches).values({
      userId: manager.id,
      branchId: second.id,
      userRole: "MANAGER",
      userIsActive: true,
      createdAt: now(),
    });
    const [a] = await ordersAt(branch.id, manager.id, "REJECTED");
    const input = copyInput([a!]);
    okOf(await copy(manager.id, input));

    await setManagerRight(manager.id, "CREATE_REQUESTS", false);
    expect(await copy(manager.id, input)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    await setManagerRight(manager.id, "CREATE_REQUESTS", true);
    expect(await copy(manager.id, input)).toMatchObject({ ok: true });

    await db
      .delete(userBranches)
      .where(and(eq(userBranches.userId, manager.id), eq(userBranches.branchId, branch.id)));
    expect(await copy(manager.id, input)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await draftsOf(manager.id)).toHaveLength(1);
  });

  it("some keys known and some new is a conflict, and nothing is saved", async () => {
    const { branch, manager } = await moveScene();
    const [a, b] = await ordersAt(branch.id, manager.id, "REJECTED", 2);
    const input = copyInput([a!]);
    okOf(await copy(manager.id, input));
    const mixed = { orders: [...input.orders, ...copyInput([b!]).orders] };
    expect(await copy(manager.id, mixed)).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(await draftsOf(manager.id)).toHaveLength(1);
  });

  it("an order or a key sent twice, and 201 orders, are refused by the input check (06 rule 8)", async () => {
    const { branch, manager } = await moveScene();
    const [a, b] = await ordersAt(branch.id, manager.id, "REJECTED", 2);
    const key = randomUUID();
    const twiceId = {
      orders: [
        { id: a!.id, version: 1, clientKey: randomUUID() },
        { id: a!.id, version: 1, clientKey: randomUUID() },
      ],
    };
    const twiceKey = {
      orders: [
        { id: a!.id, version: 1, clientKey: key },
        { id: b!.id, version: 1, clientKey: key },
      ],
    };
    const tooMany = {
      orders: Array.from({ length: 201 }, () => ({
        id: randomUUID(),
        version: 1,
        clientKey: randomUUID(),
      })),
    };
    for (const input of [twiceId, twiceKey, tooMany]) {
      expect(await copy(manager.id, input)).toMatchObject({
        ok: false,
        error: { code: "invalid_input" },
      });
    }
    expect(await draftsOf(manager.id)).toEqual([]);
  });
});

describe("All or nothing (06 rule 8; developer-rules.md rule 4)", () => {
  /** A good ticked order of the Manager, beside the failing one. */
  async function good() {
    const scene = await moveScene();
    const [order] = await ordersAt(scene.branch.id, scene.manager.id, "REJECTED");
    return { ...scene, order: order! };
  }

  async function refusedWith(userId: string, ticked: Ticked[], failing: string, code: string) {
    const result = await copy(userId, copyInput(ticked));
    expect(result).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: failing, code }] },
    });
    expect(await draftsOf(userId)).toEqual([]);
  }

  it("an order of another branch hidden among the user's own is Not found", async () => {
    const { manager, order } = await good();
    const other = await insertBranch();
    const otherOwner = await insertUser("MANAGER", { branches: [other.id] });
    const [foreign] = await ordersAt(other.id, otherOwner.id, "REJECTED");
    await refusedWith(manager.id, [order, foreign!], foreign!.id, "not_found");
  });

  it("another user's Draft is behind the draft wall for a Manager", async () => {
    const { branch, manager, order } = await good();
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    const [theirs] = await ordersAt(branch.id, colleague.id, "DRAFT");
    await refusedWith(manager.id, [order, theirs!], theirs!.id, "not_found");
  });

  it("a colleague's taken-back Draft, which keeps its number, is behind the draft wall too", async () => {
    const { branch, manager, order } = await good();
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    const [taken] = await ordersAt(branch.id, colleague.id, "DRAFT");
    await db.update(orders).set({ number: inventedNumber() }).where(eq(orders.id, taken!.id));
    await refusedWith(manager.id, [order, taken!], taken!.id, "not_found");
  });

  it("the Principal of the branch is refused beside a good order (03: no drafts for the Principal)", async () => {
    const { principal, order } = await good();
    const result = await copy(principal.id, copyInput([order]));
    expect(result).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: order.id, code: "forbidden" }] },
    });
    expect(await draftsOf(principal.id)).toEqual([]);
  });

  it("a stale version names the order", async () => {
    const { manager, order, branch } = await good();
    const [changed] = await ordersAt(branch.id, manager.id, "REJECTED");
    await refusedWith(
      manager.id,
      [order, { ...changed!, version: 2 }],
      changed!.id,
      "stale_version",
    );
  });

  it("an order of an inactive branch is not ready (no draft is added there)", async () => {
    const { head, order } = await good();
    const closing = await insertBranch();
    const owner = await insertUser("MANAGER", { branches: [closing.id] });
    const [old] = await ordersAt(closing.id, owner.id, "CLOSED");
    await db.update(branches).set({ isActive: false }).where(eq(branches.id, closing.id));
    await refusedWith(head.id, [order, old!], old!.id, "not_ready");
  });

  it("an order whose merge passes numeric(14,3) is named by the write, and nothing is saved (review Must fix 3)", async () => {
    const { branch, manager, order } = await good();
    const [source] = await ordersAt(branch.id, manager.id, "REJECTED");
    const huge = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "DRAFT",
      variantId: source!.variantId,
      departmentId: source!.departmentId,
      plannedQty: "99999999999.000",
      plannedPrice: 1n,
    });
    const result = await copy(manager.id, copyInput([order, source!]));
    expect(result).toMatchObject({
      ok: false,
      error: { code: "not_ready", orders: [{ orderId: source!.id, code: "not_ready" }] },
    });
    expect(await draftsOf(manager.id)).toEqual([expect.objectContaining({ id: huge.id })]);
    expect(await orderRow(huge.id)).toMatchObject({ plannedQty: "99999999999.000", version: 1 });
  });

  it("a draft that names no subtype yet has nothing to copy", async () => {
    const { manager, order, branch } = await good();
    const [empty] = await ordersAt(branch.id, manager.id, "DRAFT");
    await db.update(orders).set({ variantId: null }).where(eq(orders.id, empty!.id));
    const result = await copy(manager.id, copyInput([order, empty!]));
    expect(result).toMatchObject({
      ok: false,
      error: { orders: [{ orderId: empty!.id, code: "not_ready" }] },
    });
    expect(await draftsOf(manager.id)).toEqual([expect.objectContaining({ id: empty!.id })]);
  });

  it("no action row and no event is written by a copy", async () => {
    const { manager, order } = await good();
    okOf(await copy(manager.id, copyInput([order])));
    expect(
      await db.select().from(orderActions).where(eq(orderActions.actorId, manager.id)),
    ).toEqual([]);
  });
});

describe("A deactivated entry is copied and the draft is marked (edge case 'A product is deactivated while it sits in a draft'; decided item 6)", () => {
  it("a deactivated product and company: the copy is made, the grid marks it, Submit refuses it", async () => {
    const { branch, manager } = await moveScene();
    const company = await insertCompany();
    const item = await insertItem();
    const [source] = [
      await insertOrder({
        branchId: branch.id,
        ownerId: manager.id,
        status: "REJECTED",
        variantId: item.variantId,
      }),
    ];
    await withPlan(source!.id, "REJECTED", { set: { companyId: company.id } });
    await db.update(products).set({ isActive: false }).where(eq(products.id, item.id));
    await db.update(companies).set({ isActive: false }).where(eq(companies.id, company.id));

    const made = okOf<Made>(await copy(manager.id, copyInput([source!])));
    const id = made.orders[0]!.made.id;
    expect(await orderRow(id)).toMatchObject({ companyId: company.id, variantId: item.variantId });
    const row = (await listDrafts(manager.id)).rows.find((draft) => draft.id === id);
    expect(row?.inactive).toEqual(expect.arrayContaining(["variantId", "companyId"]));

    const submitted = await runOrdersAction(submitDrafts, manager.id, {
      clientKey: randomUUID(),
      orders: [{ id, version: 1 }],
    });
    expect(submitted).toMatchObject({ ok: false });
    expect(await orderRow(id)).toMatchObject({ status: "DRAFT", number: null });
  });
});
