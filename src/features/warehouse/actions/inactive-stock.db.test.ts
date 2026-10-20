import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { runOrdersAction } from "@/server/order-action";

import { recordPurchase } from "../../purchasing/actions/record-purchase";
import { insertBranch } from "../../../../tests/helpers/branches";
import { insertProduct, insertSubtypes, insertUnit } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import {
  addDraft,
  insertDepartment,
  insertItem,
  insertOrder,
  orderRow,
} from "../../../../tests/helpers/orders";
import { receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { issueStock } from "./issue";
import { receiveTransfer } from "./receive-transfer";
import { sendTransfer } from "./transfer";
import { askWriteOff } from "./write-off";
import { decideWriteOff } from "./write-off-decision";

// Stock still held of an inactive entry (build plan 7.4b, item 1, Done when: "120 notebooks of a
// switched-off product are issued, written off and transferred, and cannot be ordered"). Spec:
// 04-catalogs.md rule 2: "An inactive product or subtype can still be issued, written off and
// transferred up to the stock the branch holds … It can no longer be ordered or bought"; plan of
// 7.4b, decided item 3 (Look first). The return of such an item is in return.db.test.ts. Every
// fixture is asserted (D38).

const AT = "2031-05-03T06:00:00Z";

let branch: { id: string; code: string };
let receiver: { id: string; code: string };
let manager: string;
let otherManager: string;
let head: string;
let department: string;

beforeEach(async () => {
  setClock(AT);
  branch = await insertBranch();
  receiver = await insertBranch();
  manager = (await insertUser("MANAGER", { branches: [branch.id] })).id;
  otherManager = (await insertUser("MANAGER", { branches: [receiver.id] })).id;
  head = (await insertUser("HEAD")).id;
  department = (await insertDepartment(branch.id)).id;
});

async function balanceOf(branchId: string, variantId: string) {
  const found = await db.execute<{ qty: string; avg_cost: string }>(sql`
    select qty::text as qty, avg_cost::text as avg_cost from stock_balances
    where branch_id = ${branchId} and variant_id = ${variantId}`);
  return found.rows[0];
}

function issue(variantId: string, qty: string) {
  return runAction(issueStock, manager, {
    clientKey: randomUUID(),
    branchId: branch.id,
    docDate: "2031-05-03",
    departmentId: department,
    receivedByName: "Sinov Qabulqiluvchi",
    comment: null,
    lines: [{ variantId, qty }],
  });
}

/** A write-off asked by the Manager and approved by the Head. */
async function writeOff(variantId: string, qty: string) {
  const asked = await runAction(askWriteOff, manager, {
    clientKey: randomUUID(),
    branchId: branch.id,
    docDate: "2031-05-03",
    reason: "DAMAGED",
    comment: "Suvda qoldi",
    lines: [{ variantId, qty }],
  });
  if (!asked.ok) return asked;
  return runAction(decideWriteOff, head, {
    documentId: asked.data.documentId,
    outcome: "APPROVE",
  });
}

/** A transfer sent by the Manager and received in full by the receiving branch's Manager. */
async function transfer(variantId: string, qty: string) {
  const sent = await runAction(sendTransfer, manager, {
    clientKey: randomUUID(),
    branchId: branch.id,
    toBranchId: receiver.id,
    docDate: "2031-05-03",
    receivedByName: null,
    comment: null,
    lines: [{ variantId, qty }],
  });
  if (!sent.ok) return sent;
  const line = await db.execute<{ id: string }>(sql`
    select id from stock_document_lines where document_id = ${sent.data.documentId}`);
  return runAction(receiveTransfer, otherManager, {
    documentId: sent.data.documentId,
    receivedByName: "Sinov Qabulqiluvchi",
    lines: [{ lineId: line.rows[0]!.id, receivedQty: qty }],
  });
}

describe("an inactive entry's stock still moves out (04 rule 2; plan of 7.4b, decided item 3)", () => {
  it("120 notebooks of a switched-off product: 50 issued, 20 written off, 30 transferred, and more than held is refused", async () => {
    const notebook = await insertItem({ referencePrice: 3000n });
    await receive(branch.id, notebook.variantId, "120", 3000n, manager);
    await db.execute(sql`update products set is_active = false where id = ${notebook.id}`);

    expect((await issue(notebook.variantId, "50")).ok).toBe(true);
    expect(await writeOff(notebook.variantId, "20")).toMatchObject({
      ok: true,
      data: { outcome: "APPROVE" },
    });
    expect((await transfer(notebook.variantId, "30")).ok).toBe(true);
    expect(await balanceOf(branch.id, notebook.variantId)).toEqual({
      qty: "20.000",
      avg_cost: "3000",
    });
    expect(await balanceOf(receiver.id, notebook.variantId)).toEqual({
      qty: "30.000",
      avg_cost: "3000",
    });

    // Up to the stock the branch holds: 21 of 20 is refused as short, with 20 available.
    const over = await issue(notebook.variantId, "21");
    expect(over).toMatchObject({
      ok: false,
      error: { fields: { "lines.0.qty": "errors.field.stockShort" } },
    });
    expect(over.ok ? null : over.error.available).toEqual({ "lines.0.qty": "20" });
    expect(await balanceOf(branch.id, notebook.variantId)).toEqual({
      qty: "20.000",
      avg_cost: "3000",
    });
  });

  it("a switched-off subtype of an active product moves out the same way", async () => {
    const product = await insertProduct({ unitId: (await insertUnit()).id });
    const [, blue] = await insertSubtypes(product.id, [{ name: "Qizil" }, { name: "Ko'k" }]);
    await receive(branch.id, blue!, "10", 2000n, manager);
    await db.execute(sql`update product_variants set is_active = false where id = ${blue!}`);

    expect((await issue(blue!, "4")).ok).toBe(true);
    expect((await writeOff(blue!, "3")).ok).toBe(true);
    expect((await transfer(blue!, "3")).ok).toBe(true);
    expect(await balanceOf(branch.id, blue!)).toEqual({ qty: "0.000", avg_cost: "0" });
  });

  it("nothing held: an inactive item is refused as short with 0 available", async () => {
    const notebook = await insertItem();
    await db.execute(sql`update products set is_active = false where id = ${notebook.id}`);
    const result = await issue(notebook.variantId, "1");
    expect(result).toMatchObject({
      ok: false,
      error: { fields: { "lines.0.qty": "errors.field.stockShort" } },
    });
  });
});

describe("an inactive entry can no longer be ordered or bought (04 rule 2)", () => {
  it("a draft of the switched-off product is refused", async () => {
    const notebook = await insertItem({ referencePrice: 3000n });
    await receive(branch.id, notebook.variantId, "120", 3000n, manager);
    await db.execute(sql`update products set is_active = false where id = ${notebook.id}`);

    const draft = await addDraft(manager, {
      branchId: branch.id,
      variantId: notebook.variantId,
      departmentId: department,
    });
    expect(draft).toMatchObject({
      ok: false,
      error: { fields: { variantId: "errors.field.inactive" } },
    });
  });

  it("a purchase record that buys a switched-off subtype in place of the ordered one is refused", async () => {
    const product = await insertProduct({ unitId: (await insertUnit()).id });
    const [red, blue] = await insertSubtypes(product.id, [{ name: "Qizil" }, { name: "Ko'k" }]);
    await db.execute(sql`update product_variants set is_active = false where id = ${blue!}`);
    const order = await insertOrder({
      branchId: branch.id,
      ownerId: manager,
      status: "PURCHASING",
      variantId: red!,
      plannedQty: "10",
      plannedPrice: 2_000n,
      paymentType: "CARD",
      submittedAt: new Date("2031-05-01T07:00:00Z"),
      approvedAt: new Date("2031-05-02T07:00:00Z"),
    });
    const result = await runOrdersAction(recordPurchase, manager, {
      clientKey: randomUUID(),
      orders: [{ id: order.id, version: (await orderRow(order.id))!.version }],
      purchasedOn: "2031-05-03",
      paymentType: "CARD",
      supplierId: null,
      receiptFileIds: [],
      lines: [
        {
          orderId: order.id,
          variantId: blue!,
          qty: "10",
          unitPrice: "2000",
          extras: [],
          comment: "Do'konda shunisi bor edi",
        },
      ],
    });
    expect(result.ok ? null : result.error.fields).toEqual({
      "lines.0.variantId": "errors.field.inactive",
    });
    expect(await balanceOf(branch.id, blue!)).toBeUndefined();
  });
});
