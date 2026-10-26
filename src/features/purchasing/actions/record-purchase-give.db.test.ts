import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getOrderPage } from "@/features/orders/queries/order-page";
import { db } from "@/server/db/client";
import { orderEvents, purchases } from "@/server/db/schema";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertDepartment, insertItem, insertOrder } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { getPurchaseForm } from "../queries/purchase-form";
import { recordPurchase } from "./record-purchase";

// "Give straight to requester" on a purchase record (build plan 5.4; plan of 5.4, decided items
// 1, 4 and 6). Spec: 07-purchasing.md (Purchase record: "Give straight to requester … Also
// creates an issue to the order's department"; What saving a record does 5; One trip, many
// orders 1: the tick is per order; 4: all or nothing); edge-cases/warehouse.md ("An item goes
// straight from the shop to a classroom"); Decided ahead, question 9 (hidden on a service);
// 03 Manager rights, ISSUE_STOCK. Every fixture is asserted (D38).

const TODAY = "2031-05-10";

async function opened(options: { type?: "GOODS" | "SERVICE"; responsibleName?: string } = {}) {
  setClock(`${TODAY}T07:00:00Z`);
  const branch = await insertBranch();
  const owner = await insertUser("MANAGER", { branches: [branch.id] });
  const department = await insertDepartment(branch.id, {
    responsibleName: options.responsibleName ?? "Sinov Mas'ul",
  });
  return { branch, owner, department, type: options.type };
}

type Scene = Awaited<ReturnType<typeof opened>>;

async function order(
  scene: Scene,
  submittedAt = new Date(`${TODAY}T05:00:00Z`),
  requesterName: string | null = null,
) {
  const item = await insertItem({ type: scene.type });
  return insertOrder({
    branchId: scene.branch.id,
    ownerId: scene.owner.id,
    status: "PURCHASING",
    variantId: item.variantId,
    departmentId: scene.department.id,
    requesterName,
    plannedQty: "10",
    plannedPrice: 5_000n,
    paymentType: "CARD",
    submittedAt,
    approvedAt: new Date("2031-05-05T07:00:00Z"),
  });
}

type Made = Pick<Awaited<ReturnType<typeof order>>, "id" | "version" | "variantId">;

function trip(scene: Scene, lines: { made: Made; give: boolean }[], userId = scene.owner.id) {
  return runOrdersAction(recordPurchase, userId, {
    clientKey: randomUUID(),
    orders: lines.map(({ made }) => ({ id: made.id, version: made.version })),
    purchasedOn: "2031-05-09",
    paymentType: "CARD",
    supplierId: null,
    receiptFileIds: [],
    lines: lines.map(({ made, give }) => ({
      orderId: made.id,
      variantId: made.variantId,
      qty: "10",
      unitPrice: "5000",
      extras: [],
      comment: null,
      giveToRequester: give,
    })),
  });
}

async function balanceOf(branchId: string, variantId: string) {
  const found = await db.execute<{ qty: string }>(sql`
    select qty::text as qty from stock_balances
    where branch_id = ${branchId} and variant_id = ${variantId}`);
  return found.rows[0]?.qty ?? null;
}

async function issuesOf(branchId: string) {
  const found = await db.execute<{
    id: string;
    number: string;
    department_id: string;
    received_by_name: string | null;
    doc_date: string;
    client_key: string;
    created_by: string;
    variant_id: string;
    qty: string;
  }>(sql`
    select d.id, d.number, d.department_id, d.received_by_name, d.doc_date::text as doc_date,
      d.client_key, d.created_by, l.variant_id, l.qty::text as qty
    from stock_documents d join stock_document_lines l on l.document_id = d.id
    where d.branch_id = ${branchId} and d.type = 'ISSUE' order by d.number`);
  return found.rows;
}

describe('recordPurchase with "Give straight to requester" (07 What saving a record does 5)', () => {
  it("receives and issues in one transaction: stock back where it was, the issue to the order's department, its history names it", async () => {
    const scene = await opened();
    const made = await order(scene);
    const result = await trip(scene, [{ made, give: true }]);
    expect(result.ok).toBe(true);

    expect(await balanceOf(scene.branch.id, made.variantId)).toBe("0.000");
    const [record] = await db.select().from(purchases).where(eq(purchases.orderId, made.id));
    const issues = await issuesOf(scene.branch.id);
    expect(issues).toEqual([
      {
        id: expect.any(String),
        number: `ISS-${scene.branch.code}-31-0001`,
        department_id: scene.department.id,
        // No requester on the order: the department's responsible person (decided item 4).
        received_by_name: "Sinov Mas'ul",
        doc_date: "2031-05-09",
        client_key: record!.id,
        created_by: scene.owner.id,
        variant_id: made.variantId,
        qty: "10.000",
      },
    ]);
    const movements = await db.execute<{ type: string; qty_delta: string }>(sql`
      select type, qty_delta::text as qty_delta from stock_movements
      where branch_id = ${scene.branch.id} and variant_id = ${made.variantId} order by seq`);
    expect(movements.rows).toEqual([
      { type: "RECEIPT", qty_delta: "10.000" },
      { type: "ISSUE", qty_delta: "-10.000" },
    ]);
    const [event] = await db
      .select({ payload: orderEvents.payload })
      .from(orderEvents)
      .where(sql`${orderEvents.orderId} = ${made.id} and ${orderEvents.type} = 'RECORD_PURCHASE'`);
    expect(event!.payload).toMatchObject({
      purchase: { id: record!.id },
      issue: { documentId: issues[0]!.id, number: issues[0]!.number },
    });
  });

  it("the order page's History reads the issue by its event: number and document, for the Principal of the branch too", async () => {
    const scene = await opened();
    const made = await order(scene);
    expect((await trip(scene, [{ made, give: true }])).ok).toBe(true);
    const [issue] = await issuesOf(scene.branch.id);
    const principal = await insertUser("PRINCIPAL", { branches: [scene.branch.id] });
    for (const reader of [scene.owner.id, principal.id]) {
      const page = await getOrderPage(reader, made.id);
      const event = page?.events.find((each) => each.type === "RECORD_PURCHASE");
      expect(event?.issue).toEqual({ documentId: issue!.id, number: issue!.number });
    }
  });

  it("the Head records a ticked trip, even on the order of a Manager with ISSUE_STOCK off; the issue is the Head's (03 matrix: Head any branch; rights never bind the Head)", async () => {
    const scene = await opened();
    await setManagerRight(scene.owner.id, "ISSUE_STOCK", false);
    const made = await order(scene);
    const head = await insertUser("HEAD");
    expect((await trip(scene, [{ made, give: true }], head.id)).ok).toBe(true);
    expect(await balanceOf(scene.branch.id, made.variantId)).toBe("0.000");
    expect((await issuesOf(scene.branch.id)).map((each) => each.created_by)).toEqual([head.id]);
  });

  it("takes the order's requester name before the department's responsible person (decided item 4)", async () => {
    const scene = await opened();
    const made = await order(scene, undefined, "Sinov So'rovchi");
    expect((await trip(scene, [{ made, give: true }])).ok).toBe(true);
    expect((await issuesOf(scene.branch.id)).map((each) => each.received_by_name)).toEqual([
      "Sinov So'rovchi",
    ]);
  });

  it("leaves the receiver empty when neither is named (decided item 4)", async () => {
    const scene = await opened();
    await db.execute(
      sql`update departments set responsible_name = null where id = ${scene.department.id}`,
    );
    const made = await order(scene);
    expect((await trip(scene, [{ made, give: true }])).ok).toBe(true);
    expect((await issuesOf(scene.branch.id)).map((each) => each.received_by_name)).toEqual([null]);
  });

  it("issues only the ticked order of a trip of two (07 One trip 1: the tick is per order)", async () => {
    const scene = await opened();
    const ticked = await order(scene, new Date(`${TODAY}T04:00:00Z`));
    const kept = await order(scene, new Date(`${TODAY}T05:00:00Z`));
    expect(
      (
        await trip(scene, [
          { made: ticked, give: true },
          { made: kept, give: false },
        ])
      ).ok,
    ).toBe(true);
    expect(await balanceOf(scene.branch.id, ticked.variantId)).toBe("0.000");
    expect(await balanceOf(scene.branch.id, kept.variantId)).toBe("10.000");
    expect((await issuesOf(scene.branch.id)).map((each) => each.variant_id)).toEqual([
      ticked.variantId,
    ]);
  });

  it("stores the tick on the record: true when ticked, false when not (07 Purchase record, Give straight to requester; 14 purchases; D56 finding 2)", async () => {
    const scene = await opened();
    const ticked = await order(scene, new Date(`${TODAY}T04:00:00Z`));
    const kept = await order(scene, new Date(`${TODAY}T05:00:00Z`));
    expect(
      (
        await trip(scene, [
          { made: ticked, give: true },
          { made: kept, give: false },
        ])
      ).ok,
    ).toBe(true);
    const stored = await db
      .select({ orderId: purchases.orderId, give: purchases.giveToRequester })
      .from(purchases)
      .where(eq(purchases.branchId, scene.branch.id));
    expect(stored.find((each) => each.orderId === ticked.id)?.give).toBe(true);
    expect(stored.find((each) => each.orderId === kept.id)?.give).toBe(false);
  });

  it("refuses the tick on a service, nothing saved (Decided ahead, question 9)", async () => {
    const scene = await opened({ type: "SERVICE" });
    const made = await order(scene);
    const result = await trip(scene, [{ made, give: true }]);
    expect(result.ok ? null : result.error.fields).toEqual({
      "lines.0.giveToRequester": "errors.field.notAllowed",
    });
    expect(await db.select().from(purchases).where(eq(purchases.orderId, made.id))).toEqual([]);
    // Without the tick the same service is recorded (A7).
    expect((await trip(scene, [{ made, give: false }])).ok).toBe(true);
  });

  it("refuses a ticked trip of a Manager with ISSUE_STOCK off, nothing saved; the same trip untick goes through (decided item 1, Look first)", async () => {
    const scene = await opened();
    await setManagerRight(scene.owner.id, "ISSUE_STOCK", false);
    const made = await order(scene);
    const refused = await trip(scene, [{ made, give: true }]);
    expect(refused).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await db.select().from(purchases).where(eq(purchases.orderId, made.id))).toEqual([]);
    expect(await balanceOf(scene.branch.id, made.variantId)).toBeNull();
    expect(await issuesOf(scene.branch.id)).toEqual([]);

    expect((await trip(scene, [{ made, give: false }])).ok).toBe(true);
    expect(await balanceOf(scene.branch.id, made.variantId)).toBe("10.000");
  });

  it("rolls the record back when the issue fails (07 What saving a record does: all or none)", async () => {
    const scene = await opened();
    const made = await order(scene);
    // The ISS counter of the branch at its largest value: the issue's number cannot be taken.
    await db.execute(sql`
      insert into number_counters (scope, branch_id, year, last_value, created_at)
      values ('ISS', ${scene.branch.id}, 2031, 2147483647, now())`);
    const result = await trip(scene, [{ made, give: true }]);
    expect(result).toMatchObject({ ok: false, error: { code: "unexpected" } });
    expect(await db.select().from(purchases).where(eq(purchases.orderId, made.id))).toEqual([]);
    expect(await balanceOf(scene.branch.id, made.variantId)).toBeNull();
  });
});

describe('"Give straight to requester" on an order without a department (05 Fields the Head sets 3; plan of 2.5d)', () => {
  it("is refused on the server and not offered by the form; the same purchase without the tick saves", async () => {
    const scene = await opened();
    const item = await insertItem();
    // Every other value that would let it through: goods, a Manager who may issue, Open.
    const made = await insertOrder({
      branchId: scene.branch.id,
      ownerId: scene.owner.id,
      status: "PURCHASING",
      variantId: item.variantId,
      departmentId: null,
      plannedQty: "10",
      plannedPrice: 5_000n,
      paymentType: "CARD",
      submittedAt: new Date(`${TODAY}T05:00:00Z`),
      approvedAt: new Date("2031-05-05T07:00:00Z"),
    });
    expect(await trip(scene, [{ made, give: true }])).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        fields: { "lines.0.giveToRequester": "errors.field.noDepartment" },
      },
    });
    expect(await db.select().from(purchases).where(eq(purchases.orderId, made.id))).toEqual([]);
    expect(await issuesOf(scene.branch.id)).toEqual([]);

    const form = await getPurchaseForm(scene.owner.id, [made.id]);
    expect(form?.orders.map((one) => one.canGiveToRequester)).toEqual([false]);

    expect(await trip(scene, [{ made, give: false }])).toMatchObject({ ok: true });
    expect(await balanceOf(scene.branch.id, made.variantId)).toBe("10.000");
  });
});
