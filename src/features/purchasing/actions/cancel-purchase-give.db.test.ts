import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { reverseStockDocument } from "@/features/warehouse/actions/reverse";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { purchases } from "@/server/db/schema";
import { departmentReceived } from "@/server/department-received";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import {
  insertDepartment,
  insertItem,
  insertOrder,
  orderRow,
} from "../../../../tests/helpers/orders";
import { postDocument, receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { cancelPurchase, cancelTrip } from "./cancel-purchase";
import { recordPurchase } from "./record-purchase";

// Cancelling a record given straight to the department, build plan 5.4b (D56 finding 1; plan of
// 5.4b, decided items 1 to 5, Look first, with the review's corrections 1 and 2). Spec:
// 07-purchasing.md (Fixing a mistake 1: "Cancel trip" all or nothing; 2: blocked, the message
// names the two ways out); 09-warehouse.md (Issue to a department 3: a posted issue can be
// reversed; Other documents, Return); 06 rule 8. The record's issue is the ISSUE whose
// `client_key` is the record's id (5.4 decided item 7). Every fixture is asserted (D38).

const TODAY = "2031-05-10";
const REASON = "Typed the wrong quantity";

async function scene() {
  setClock(`${TODAY}T07:00:00Z`);
  const branch = await insertBranch();
  const owner = await insertUser("MANAGER", { branches: [branch.id] });
  const department = await insertDepartment(branch.id, { responsibleName: "Sinov Mas'ul" });
  const notebooks = await insertItem();
  return { branch, owner, department, notebooks };
}

type Scene = Awaited<ReturnType<typeof scene>>;

/** An Open order of notebooks (or `variantId`) for the scene's department, approved on 5 May. */
function openOrder(s: Scene, variantId = s.notebooks.variantId) {
  return insertOrder({
    branchId: s.branch.id,
    ownerId: s.owner.id,
    status: "PURCHASING",
    variantId,
    departmentId: s.department.id,
    plannedQty: "10",
    plannedPrice: 1_000n,
    paymentType: "CARD",
    submittedAt: new Date("2031-05-01T07:00:00Z"),
    approvedAt: new Date("2031-05-05T07:00:00Z"),
  });
}

type Order = Awaited<ReturnType<typeof openOrder>>;

async function versionOf(orderId: string) {
  return (await orderRow(orderId))!.version;
}

/** One trip of 10 per order by the real record action; asserts its success (D38). */
async function buy(s: Scene, lines: { order: Order; give: boolean }[]) {
  const result = await runOrdersAction(recordPurchase, s.owner.id, {
    clientKey: randomUUID(),
    orders: await Promise.all(
      lines.map(async ({ order }) => ({ id: order.id, version: await versionOf(order.id) })),
    ),
    purchasedOn: TODAY,
    paymentType: "CARD",
    supplierId: null,
    receiptFileIds: [],
    lines: lines.map(({ order, give }) => ({
      orderId: order.id,
      variantId: order.variantId,
      qty: "10",
      unitPrice: "1000",
      extras: [],
      comment: null,
      giveToRequester: give,
    })),
  });
  expect(result.ok).toBe(true);
  const rows = await db
    .select({ id: purchases.id, orderId: purchases.orderId, tripId: purchases.tripId })
    .from(purchases)
    .where(eq(purchases.branchId, s.branch.id));
  const recordOf = (order: Order) => rows.find((row) => row.orderId === order.id)!;
  return { recordOf, tripId: recordOf(lines[0]!.order).tripId };
}

/** The record's issue, made by the tick: the ISSUE whose client key is the record's id. */
async function issueOf(recordId: string) {
  const found = await db.execute<{ id: string; number: string; status: string }>(sql`
    select id, number, status from stock_documents
    where client_key = ${recordId} and type = 'ISSUE'`);
  expect(found.rows).toHaveLength(1);
  return found.rows[0]!;
}

function cancelRecord(s: Scene, order: Order, purchaseId: string) {
  return versionOf(order.id).then((version) =>
    runOrdersAction(cancelPurchase, s.owner.id, {
      clientKey: randomUUID(),
      orders: [{ id: order.id, version }],
      purchaseId,
      reason: REASON,
    }),
  );
}

async function stockOf(s: Scene, variantId = s.notebooks.variantId) {
  const found = await db.execute<{ qty: string }>(sql`
    select qty::text as qty from stock_balances
    where branch_id = ${s.branch.id} and variant_id = ${variantId}`);
  return found.rows[0]?.qty ?? null;
}

async function receivedBy(s: Scene) {
  const held = await departmentReceived(db, {
    branchId: s.branch.id,
    departmentId: s.department.id,
    variantIds: [s.notebooks.variantId],
  });
  return held.get(s.notebooks.variantId);
}

async function cancelledOf(recordId: string) {
  const [row] = await db
    .select({ isCancelled: purchases.isCancelled })
    .from(purchases)
    .where(eq(purchases.id, recordId));
  return row!.isCancelled;
}

async function reversalsOf(recordId: string) {
  const found = await db.execute<{ count: number }>(sql`
    select count(*)::int as count from stock_movements
    where purchase_id = ${recordId} and type = 'REVERSAL'`);
  return found.rows[0]!.count;
}

/** The refusal of a record whose issue is posted, naming that issue (decided items 3 and 5). */
function givenIssueRefusal(order: Order, number: string) {
  return {
    orderId: order.id,
    code: "not_ready",
    fields: { stock: "errors.field.givenIssuePosted" },
    values: { number },
  };
}

describe("A record given straight to the department cannot be cancelled while its issue is posted (07 Fixing a mistake 2; D56 finding 1)", () => {
  it("with 50 notebooks on the shelf, a ticked record of 10 is refused naming its issue: stock stays 50, the issue stays, the record stays", async () => {
    const s = await scene();
    await receive(s.branch.id, s.notebooks.variantId, "50", 1_000n, s.owner.id);
    const order = await openOrder(s);
    const { recordOf } = await buy(s, [{ order, give: true }]);
    const record = recordOf(order);
    const issue = await issueOf(record.id);
    expect(await stockOf(s)).toBe("50.000");
    expect(await receivedBy(s)).toBe("10.000");

    const refused = await cancelRecord(s, order, record.id);

    expect(refused).toMatchObject({
      ok: false,
      error: { code: "not_ready", orders: [givenIssueRefusal(order, issue.number)] },
    });
    expect(await stockOf(s)).toBe("50.000");
    expect((await issueOf(record.id)).status).toBe("POSTED");
    expect(await cancelledOf(record.id)).toBe(false);
    expect(await reversalsOf(record.id)).toBe(0);
    expect(await receivedBy(s)).toBe("10.000");
  });

  it("with nothing else on the shelf, the refusal names the issue, not the stock (decided item 2: whatever the stock)", async () => {
    const s = await scene();
    const order = await openOrder(s);
    const { recordOf } = await buy(s, [{ order, give: true }]);
    const record = recordOf(order);
    const issue = await issueOf(record.id);
    expect(await stockOf(s)).toBe("0.000");

    const refused = await cancelRecord(s, order, record.id);

    expect(refused).toMatchObject({
      ok: false,
      error: { code: "not_ready", orders: [givenIssueRefusal(order, issue.number)] },
    });
    expect(await cancelledOf(record.id)).toBe(false);
  });

  it("once its own issue is reversed the cancel goes through: stock 50, the department's received count back; a second record whose issue stays posted is still refused (09 Issue 3; D40)", async () => {
    const s = await scene();
    await receive(s.branch.id, s.notebooks.variantId, "50", 1_000n, s.owner.id);
    const other = await openOrder(s);
    const otherRecord = (await buy(s, [{ order: other, give: true }])).recordOf(other);
    const otherIssue = await issueOf(otherRecord.id);
    // The scene before the record under test: 50 on the shelf, 10 with the department.
    expect(await stockOf(s)).toBe("50.000");
    expect(await receivedBy(s)).toBe("10.000");

    const order = await openOrder(s);
    const record = (await buy(s, [{ order, give: true }])).recordOf(order);
    const issue = await issueOf(record.id);
    expect(await stockOf(s)).toBe("50.000");
    expect(await receivedBy(s)).toBe("20.000");

    const reversed = await runAction(reverseStockDocument, s.owner.id, {
      documentId: issue.id,
      reason: REASON,
    });
    expect(reversed.ok).toBe(true);
    expect(await stockOf(s)).toBe("60.000");

    expect((await cancelRecord(s, order, record.id)).ok).toBe(true);
    expect(await cancelledOf(record.id)).toBe(true);
    expect(await stockOf(s)).toBe("50.000");
    expect(await receivedBy(s)).toBe("10.000");

    expect(await cancelRecord(s, other, otherRecord.id)).toMatchObject({
      ok: false,
      error: { code: "not_ready", orders: [givenIssueRefusal(other, otherIssue.number)] },
    });
    expect(await cancelledOf(otherRecord.id)).toBe(false);
    expect((await issueOf(otherRecord.id)).status).toBe("POSTED");
    expect(await stockOf(s)).toBe("50.000");
  });

  it("a Return of the record's quantity does not unlock the cancel: still refused, stock and record unchanged (decided item 2, Look first; review correction 2)", async () => {
    const s = await scene();
    await receive(s.branch.id, s.notebooks.variantId, "50", 1_000n, s.owner.id);
    const order = await openOrder(s);
    const record = (await buy(s, [{ order, give: true }])).recordOf(order);
    const issue = await issueOf(record.id);
    await postDocument({
      type: "RETURN",
      branchId: s.branch.id,
      departmentId: s.department.id,
      createdBy: s.owner.id,
      lines: [{ variantId: s.notebooks.variantId, qty: "10" }],
    });
    expect(await stockOf(s)).toBe("60.000");
    expect(await receivedBy(s)).toBe("0.000");

    expect(await cancelRecord(s, order, record.id)).toMatchObject({
      ok: false,
      error: { code: "not_ready", orders: [givenIssueRefusal(order, issue.number)] },
    });
    expect(await stockOf(s)).toBe("60.000");
    expect(await cancelledOf(record.id)).toBe(false);
    expect(await reversalsOf(record.id)).toBe(0);
  });

  it("Cancel trip with one ticked record whose issue is posted cancels none, naming only that order (07 Fixing a mistake 1; 06 rule 8)", async () => {
    const s = await scene();
    const pens = await insertItem();
    const ticked = await openOrder(s);
    const kept = await openOrder(s, pens.variantId);
    const { recordOf, tripId } = await buy(s, [
      { order: ticked, give: true },
      { order: kept, give: false },
    ]);
    const issue = await issueOf(recordOf(ticked).id);
    expect(await stockOf(s, pens.variantId)).toBe("10.000");

    const refused = await runOrdersAction(cancelTrip, s.owner.id, {
      clientKey: randomUUID(),
      orders: [
        { id: ticked.id, version: await versionOf(ticked.id) },
        { id: kept.id, version: await versionOf(kept.id) },
      ],
      tripId,
      reason: REASON,
    });

    expect(refused).toMatchObject({
      ok: false,
      error: { code: "not_ready", orders: [givenIssueRefusal(ticked, issue.number)] },
    });
    expect(refused.ok ? [] : refused.error.orders).toHaveLength(1);
    expect(await cancelledOf(recordOf(ticked).id)).toBe(false);
    expect(await cancelledOf(recordOf(kept).id)).toBe(false);
    expect(await stockOf(s, pens.variantId)).toBe("10.000");
    expect(await reversalsOf(recordOf(kept).id)).toBe(0);
  });
});
