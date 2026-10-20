import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { recordPurchase } from "@/features/purchasing/actions/record-purchase";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { runOrdersAction } from "@/server/order-action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { heldWhile } from "../../../../tests/helpers/held-while";
import { insertDepartment, insertItem, insertOrder } from "../../../../tests/helpers/orders";
import { postDocument, receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { returnStock } from "./return";
import { reverseStockDocument } from "./reverse";

// A reverse at the same moment as another write (15-quality-and-acceptance.md, Test layers:
// "Actions run two at a time to prove the locks work"; plan of 5.7, decided item 3, as the review
// of the plan corrected it; progress 5.6, "For 5.7"). Both real actions start while a third
// transaction holds the row the first waits on; the asserts follow from which committed first.

const DAY = "2031-05-05";

async function scene() {
  setClock(`${DAY}T07:00:00Z`);
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const department = await insertDepartment(branch.id);
  const notebook = (await insertItem()).variantId;
  await receive(branch.id, notebook, "5", 5_000n, manager.id);
  const issue = await postDocument({
    type: "ISSUE",
    branchId: branch.id,
    departmentId: department.id,
    createdBy: manager.id,
    lines: [{ variantId: notebook, qty: "5" }],
  });
  return { branch, manager, department, notebook, issue };
}

async function balance(branchId: string, variantId: string) {
  const found = await db.execute<{ qty: string }>(sql`
    select qty::text as qty from stock_balances
    where branch_id = ${branchId} and variant_id = ${variantId}`);
  return found.rows[0]!.qty;
}

describe("a reverse at the same moment as another write", () => {
  it("a reverse of the issue, then a return of the same department: the return waits on the department and counts the reverse (decided item 3)", async () => {
    const s = await scene();
    const reverse = () =>
      runAction(reverseStockDocument, s.manager.id, {
        documentId: s.issue.documentId,
        reason: "Sinov sababi",
      });
    const giveBack = () =>
      runAction(returnStock, s.manager.id, {
        clientKey: randomUUID(),
        branchId: s.branch.id,
        docDate: DAY,
        departmentId: s.department.id,
        comment: null,
        lines: [{ variantId: s.notebook, qty: "3" }],
      });
    const [reversed, returned] = await heldWhile(
      "select 1 from departments where id = $1 for update",
      [s.department.id],
      [reverse, giveBack],
    );
    expect(reversed).toMatchObject({ ok: true });
    // The department holds nothing once the issue is reversed: 3 is over it, and no comment.
    expect(returned).toEqual({
      ok: false,
      error: {
        code: "invalid_input",
        messageKey: "errors.invalidInput",
        fields: {
          "lines.0.qty": "errors.field.overReturn",
          comment: "errors.field.overReturnComment",
        },
        available: { "lines.0.qty": "0.000" },
      },
    });
    expect(await balance(s.branch.id, s.notebook)).toBe("5.000");
  });

  it("two reverses of one document: the first reverses, the second finds it Reversed (wrong_status)", async () => {
    const s = await scene();
    const head = await insertUser("HEAD");
    const reverse = (userId: string) => () =>
      runAction(reverseStockDocument, userId, {
        documentId: s.issue.documentId,
        reason: "Sinov sababi",
      });
    const [one, two] = await heldWhile(
      "select 1 from stock_documents where id = $1 for update",
      [s.issue.documentId],
      [reverse(s.manager.id), reverse(head.id)],
    );
    expect(one).toMatchObject({ ok: true });
    expect(two).toMatchObject({ ok: false, error: { code: "wrong_status" } });
    expect(await balance(s.branch.id, s.notebook)).toBe("5.000");
    const reversals = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from stock_movements where type = 'REVERSAL'
        and branch_id = ${s.branch.id}`);
    expect(reversals.rows[0]!.n).toBe(1);
  });
});

describe("a reverse of an issue after a return, at the same moment (09 Issue to a department 3; plan of 5.7b, decided item 2, Look first)", () => {
  const REASON = "Sinov sababi";
  const holdBalance =
    "select 1 from stock_balances where branch_id = $1 and variant_id = $2 for update";

  async function issued(s: Awaited<ReturnType<typeof scene>>, qty: string) {
    return postDocument({
      type: "ISSUE",
      branchId: s.branch.id,
      departmentId: s.department.id,
      createdBy: s.manager.id,
      lines: [{ variantId: s.notebook, qty }],
    });
  }

  it("two reverses of two issues of one department, 8 held: the second waits on the department, reads 3 and is refused", async () => {
    // The scene's issue of 5, a second of 5, a return of 2: the department holds 8. A third
    // transaction holds the balance, so the first reverse has read 8 and passed its check before
    // it waits; the second waits on the department (with it FOR SHARE, as in 5.7, the second also
    // read 8 and both went through: the department at -2, stock 2 too high).
    const s = await scene();
    await receive(s.branch.id, s.notebook, "10", 5_000n, s.manager.id);
    const second = await issued(s, "5");
    await postDocument({
      type: "RETURN",
      branchId: s.branch.id,
      departmentId: s.department.id,
      createdBy: s.manager.id,
      lines: [{ variantId: s.notebook, qty: "2" }],
    });
    expect(await balance(s.branch.id, s.notebook)).toBe("7.000");
    const lines = await db.execute<{ id: string }>(
      sql`select id from stock_document_lines where document_id = ${second.documentId}`,
    );
    const field = `lines.${lines.rows[0]!.id}.qty`;

    const reverse = (documentId: string) => () =>
      runAction(reverseStockDocument, s.manager.id, { documentId, reason: REASON });
    const [one, two] = await heldWhile(
      holdBalance,
      [s.branch.id, s.notebook],
      [reverse(s.issue.documentId), reverse(second.documentId)],
    );
    expect(one).toMatchObject({ ok: true });
    expect(two).toEqual({
      ok: false,
      error: {
        code: "invalid_input",
        messageKey: "errors.invalidInput",
        fields: { [field]: "errors.field.reverseOverHeld" },
        available: { [field]: "3.000" },
      },
    });
    expect(await balance(s.branch.id, s.notebook)).toBe("12.000");
  });

  it("a return first, then the issue's reverse: the reverse waits on the department and is refused on what the return left", async () => {
    // The scene's issue of 5; a return of 2 holds the department FOR UPDATE and waits on the
    // balance; the reverse waits on the department, then reads 3 held, under its 5.
    const s = await scene();
    const giveBack = () =>
      runAction(returnStock, s.manager.id, {
        clientKey: randomUUID(),
        branchId: s.branch.id,
        docDate: DAY,
        departmentId: s.department.id,
        comment: null,
        lines: [{ variantId: s.notebook, qty: "2" }],
      });
    const reverse = () =>
      runAction(reverseStockDocument, s.manager.id, {
        documentId: s.issue.documentId,
        reason: REASON,
      });
    const [returned, reversed] = await heldWhile(
      holdBalance,
      [s.branch.id, s.notebook],
      [giveBack, reverse],
    );
    expect(returned).toMatchObject({ ok: true });
    const lines = await db.execute<{ id: string }>(
      sql`select id from stock_document_lines where document_id = ${s.issue.documentId}`,
    );
    const field = `lines.${lines.rows[0]!.id}.qty`;
    expect(reversed).toEqual({
      ok: false,
      error: {
        code: "invalid_input",
        messageKey: "errors.invalidInput",
        fields: { [field]: "errors.field.reverseOverHeld" },
        available: { [field]: "3.000" },
      },
    });
    expect(await balance(s.branch.id, s.notebook)).toBe("2.000");
  });

  it('a reverse of an issue and a "Give straight to requester" purchase of the same department and item: both go through, no deadlock', async () => {
    // A third transaction holds the issue number counter: the purchase has its receipt on the
    // balance and waits to number its issue; the reverse holds the department and waits on the
    // balance. The purchase's issue then needs only the department's FOR KEY SHARE, which FOR NO
    // KEY UPDATE lets through (FOR UPDATE would deadlock, 40P01).
    const s = await scene();
    const order = await insertOrder({
      branchId: s.branch.id,
      ownerId: s.manager.id,
      status: "PURCHASING",
      variantId: s.notebook,
      departmentId: s.department.id,
      plannedQty: "10",
      plannedPrice: 5_000n,
      paymentType: "CARD",
      submittedAt: new Date(`${DAY}T05:00:00Z`),
      approvedAt: new Date(`${DAY}T06:00:00Z`),
    });
    const buy = () =>
      runOrdersAction(recordPurchase, s.manager.id, {
        clientKey: randomUUID(),
        orders: [{ id: order.id, version: order.version }],
        purchasedOn: DAY,
        paymentType: "CARD",
        supplierId: null,
        receiptFileIds: [],
        lines: [
          {
            orderId: order.id,
            variantId: s.notebook,
            qty: "10",
            unitPrice: "5000",
            extras: [],
            comment: null,
            giveToRequester: true,
          },
        ],
      });
    const reverse = () =>
      runAction(reverseStockDocument, s.manager.id, {
        documentId: s.issue.documentId,
        reason: REASON,
      });
    const [bought, reversed] = await heldWhile(
      "select 1 from number_counters where scope = 'ISS' and branch_id = $1 for update",
      [s.branch.id],
      [buy, reverse],
    );
    expect(bought).toMatchObject({ ok: true });
    expect(reversed).toMatchObject({ ok: true });
    // 5 issued (0), 10 bought and given (0), the first issue reversed (5).
    expect(await balance(s.branch.id, s.notebook)).toBe("5.000");
  });
});
