import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { recordPurchase } from "@/features/purchasing/actions/record-purchase";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { departmentReceived } from "@/server/department-received";
import { runOrdersAction } from "@/server/order-action";
import { createDocument } from "@/server/stock-documents";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertDepartment, insertItem, insertOrder } from "../../../../tests/helpers/orders";
import { postDocument, receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { reverseStockDocument } from "./reverse";

// Reverse a document (build plan 5.7; plan of 5.7, Tests). Spec: 09-warehouse.md (Movement
// types, last paragraph: "A wrong document is fixed with 'Reverse', which writes the opposite
// movement and needs a reason"; Issue to a department 3: "A posted issue can be reversed by its
// creator or the Head. The original is then marked 'Reversed'"; the intro: "Stock can never go
// below zero"); Decided ahead, question 19; 03-roles-and-permissions.md, Manager right
// RETURN_REVERSE; edge-cases/warehouse.md ("A wrong issue was posted"). Every fixture is asserted
// (D38); the rows that must not change stand beside the ones that do (D40).

const AT = "2031-05-03T06:00:00Z";
const REASON = "Noto'g'ri bo'limga berilgan";

let branch: { id: string; code: string };
let manager: string;
let colleague: string;
let head: string;
let department: string;

beforeEach(async () => {
  setClock(AT);
  branch = await insertBranch();
  manager = (await insertUser("MANAGER", { branches: [branch.id] })).id;
  colleague = (await insertUser("MANAGER", { branches: [branch.id] })).id;
  head = (await insertUser("HEAD")).id;
  department = (await insertDepartment(branch.id)).id;
});

async function goods(): Promise<string> {
  return (await insertItem()).variantId;
}

async function balanceOf(variantId: string) {
  const found = await db.execute<{ qty: string; avg_cost: string }>(sql`
    select qty::text as qty, avg_cost::text as avg_cost from stock_balances
    where branch_id = ${branch.id} and variant_id = ${variantId}`);
  return found.rows[0];
}

async function documentOf(documentId: string) {
  const found = await db.execute<{
    status: string;
    reversed_by: string | null;
    reversed_at: string | null;
    reverse_reason: string | null;
  }>(sql`
    select status, reversed_by, reversed_at::timestamptz as reversed_at, reverse_reason
    from stock_documents
    where id = ${documentId}`);
  return found.rows[0]!;
}

async function reversalsOf(documentId: string) {
  const found = await db.execute<{
    variant_id: string;
    qty_delta: string;
    unit_cost: string;
    reverses: string;
    original_line: string;
    line: string;
  }>(sql`
    select m.variant_id, m.qty_delta::text as qty_delta, m.unit_cost::text as unit_cost,
      m.reverses_movement_id as reverses, o.document_line_id as original_line,
      m.document_line_id as line
    from stock_movements m
    join stock_movements o on o.id = m.reverses_movement_id
    join stock_document_lines l on l.id = m.document_line_id
    where l.document_id = ${documentId} and m.type = 'REVERSAL'
    order by m.seq`);
  return found.rows;
}

function reverse(documentId: string, by: string, reason = REASON) {
  return runAction(reverseStockDocument, by, { documentId, reason });
}

async function issued(lines: { variantId: string; qty: string }[], createdBy = manager) {
  return postDocument({
    type: "ISSUE",
    branchId: branch.id,
    departmentId: department,
    createdBy,
    lines,
  });
}

/** A POSTED direct entry by the Head at 2 000 so'm a unit. */
async function enteredDirectly(variantId: string, qty: string) {
  return db.transaction((tx) =>
    createDocument(tx, {
      type: "DIRECT_ENTRY",
      branchId: branch.id,
      docDate: "2031-05-03",
      status: "POSTED",
      reason: "EXISTING_STOCK",
      clientKey: randomUUID(),
      createdBy: head,
      lines: [{ variantId, qty, unitCost: 2000n }],
    }),
  );
}

describe("reverseStockDocument (09 Movement types, last paragraph; Issue to a department 3)", () => {
  it("reversing an issue brings the stock back, one REVERSAL per line at its own cost, and marks it Reversed with who, when and why (Done when 1)", async () => {
    const pens = await goods();
    const paper = await goods();
    await receive(branch.id, pens, "10", 1000n, manager);
    await receive(branch.id, paper, "6", 700n, manager);
    const wrong = await issued([
      { variantId: pens, qty: "4" },
      { variantId: paper, qty: "2" },
    ]);
    // An issue of the same department that stays: its stock must not come back (D40).
    const kept = await issued([{ variantId: pens, qty: "1" }]);
    expect((await balanceOf(pens))!.qty).toBe("5.000");
    expect((await balanceOf(paper))!.qty).toBe("4.000");

    const result = await reverse(wrong.documentId, manager);
    expect(result).toEqual({
      ok: true,
      data: { documentId: wrong.documentId, number: wrong.number },
    });

    expect(await balanceOf(pens)).toEqual({ qty: "9.000", avg_cost: "1000" });
    expect(await balanceOf(paper)).toEqual({ qty: "6.000", avg_cost: "700" });
    const reversals = await reversalsOf(wrong.documentId);
    expect(reversals).toHaveLength(2);
    expect(reversals.map((row) => [row.variant_id, row.qty_delta, row.unit_cost])).toEqual(
      expect.arrayContaining([
        [pens, "4.000", "1000"],
        [paper, "2.000", "700"],
      ]),
    );
    // Each on the line of the movement it undoes.
    for (const row of reversals) expect(row.line).toBe(row.original_line);
    expect(await documentOf(wrong.documentId)).toEqual({
      status: "REVERSED",
      reversed_by: manager,
      reversed_at: "2031-05-03 06:00:00+00",
      reverse_reason: REASON,
    });
    expect((await documentOf(kept.documentId)).status).toBe("POSTED");
    expect(await reversalsOf(kept.documentId)).toEqual([]);
  });

  it("a reverse of a return whose items were issued again, which would push stock below zero, is refused on its line with what is left; nothing saved (Done when 2)", async () => {
    const pens = await goods();
    const paper = await goods();
    await receive(branch.id, pens, "5", 1000n, manager);
    await receive(branch.id, paper, "5", 700n, manager);
    await issued([
      { variantId: pens, qty: "5" },
      { variantId: paper, qty: "2" },
    ]);
    const back = await postDocument({
      type: "RETURN",
      branchId: branch.id,
      departmentId: department,
      createdBy: manager,
      lines: [
        { variantId: pens, qty: "3" },
        { variantId: paper, qty: "2" },
      ],
    });
    // Two of the three pens went out again: 1 left, the return's 3 cannot leave. Paper could.
    await issued([{ variantId: pens, qty: "2" }]);
    expect((await balanceOf(pens))!.qty).toBe("1.000");
    expect((await balanceOf(paper))!.qty).toBe("5.000");

    const result = await reverse(back.documentId, manager);
    const pensLine = back.lineIds[0]!;
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "invalid_input",
        fields: { [`lines.${pensLine}.qty`]: "errors.field.reverseStockShort" },
        available: { [`lines.${pensLine}.qty`]: "1" },
      }),
    });
    expect((await balanceOf(pens))!.qty).toBe("1.000");
    expect((await balanceOf(paper))!.qty).toBe("5.000");
    expect(await reversalsOf(back.documentId)).toEqual([]);
    expect((await documentOf(back.documentId)).status).toBe("POSTED");
  });

  it("a Manager with RETURN_REVERSE off is refused on their own issue; nothing saved (Done when 3; 03 Manager rights)", async () => {
    const pens = await goods();
    await receive(branch.id, pens, "5", 1000n, manager);
    const made = await issued([{ variantId: pens, qty: "2" }]);
    await setManagerRight(manager, "RETURN_REVERSE", false);

    const result = await reverse(made.documentId, manager);
    expect(result.ok ? null : result.error.code).toBe("forbidden");
    expect((await documentOf(made.documentId)).status).toBe("POSTED");
    expect((await balanceOf(pens))!.qty).toBe("3.000");
  });

  it("another Manager of the branch is refused; the Head reverses the Manager's issue (09 Issue 3: its creator or the Head)", async () => {
    const pens = await goods();
    await receive(branch.id, pens, "5", 1000n, manager);
    const made = await issued([{ variantId: pens, qty: "2" }]);

    const refused = await reverse(made.documentId, colleague);
    expect(refused.ok ? null : refused.error.code).toBe("forbidden");
    expect((await documentOf(made.documentId)).status).toBe("POSTED");

    expect((await reverse(made.documentId, head)).ok).toBe(true);
    expect(await documentOf(made.documentId)).toMatchObject({
      status: "REVERSED",
      reversed_by: head,
    });
    expect((await balanceOf(pens))!.qty).toBe("5.000");
  });

  it("a second reverse is wrong_status; a reason of 4 characters, or none, is refused on `reason` (09: 'needs a reason'; 06 rule 3)", async () => {
    const pens = await goods();
    await receive(branch.id, pens, "5", 1000n, manager);
    const made = await issued([{ variantId: pens, qty: "2" }]);

    const short = await reverse(made.documentId, manager, "  abcd ");
    expect(short).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "invalid_input",
        fields: { reason: "errors.field.tooShort" },
      }),
    });
    const none = await reverse(made.documentId, manager, "   ");
    expect(none.ok ? null : none.error.fields).toEqual({ reason: "errors.field.required" });
    expect((await documentOf(made.documentId)).status).toBe("POSTED");

    expect((await reverse(made.documentId, manager, " abcde ")).ok).toBe(true);
    expect((await documentOf(made.documentId)).reverse_reason).toBe("abcde");
    const again = await reverse(made.documentId, manager);
    expect(again.ok ? null : again.error.code).toBe("wrong_status");
    expect(await reversalsOf(made.documentId)).toHaveLength(1);
    expect((await balanceOf(pens))!.qty).toBe("5.000");
  });

  it("the Head reverses a direct entry: the stock goes back, it is Reversed, and one audit row is written (09 Direct entry 3; question 19; plan of 5.8, decided item 3)", async () => {
    const pens = await goods();
    await receive(branch.id, pens, "2", 1000n, head);
    const entry = await enteredDirectly(pens, "3");
    expect(await balanceOf(pens)).toEqual({ qty: "5.000", avg_cost: "1600" });

    const result = await reverse(entry.documentId, head);
    expect(result).toEqual({
      ok: true,
      data: { documentId: entry.documentId, number: entry.number },
    });
    expect(await balanceOf(pens)).toEqual({ qty: "2.000", avg_cost: "1000" });
    expect(await documentOf(entry.documentId)).toMatchObject({
      status: "REVERSED",
      reversed_by: head,
      reverse_reason: REASON,
    });
    const audits = await db.execute<{ action: string; actor_id: string; after: unknown }>(sql`
      select action, actor_id, after from audit_log
      where entity_id = ${entry.documentId} and action = 'direct_entry.reverse'`);
    expect(audits.rows).toEqual([
      {
        action: "direct_entry.reverse",
        actor_id: head,
        after: { number: entry.number, status: "REVERSED", reason: REASON },
      },
    ]);
  });

  it("a direct entry whose items were issued meanwhile is not reversed below zero; nothing saved", async () => {
    const pens = await goods();
    const entry = await enteredDirectly(pens, "3");
    await issued([{ variantId: pens, qty: "2" }]);
    expect((await balanceOf(pens))!.qty).toBe("1.000");
    const result = await reverse(entry.documentId, head);
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect((await documentOf(entry.documentId)).status).toBe("POSTED");
    expect((await balanceOf(pens))!.qty).toBe("1.000");
    expect(await reversalsOf(entry.documentId)).toEqual([]);
  });

  it("a Manager of the branch with RETURN_REVERSE on is refused on a direct entry: forbidden, nothing saved (question 19: the Head only)", async () => {
    const pens = await goods();
    const entry = await enteredDirectly(pens, "3");
    const result = await reverse(entry.documentId, manager);
    expect(result.ok ? null : result.error.code).toBe("forbidden");
    expect((await documentOf(entry.documentId)).status).toBe("POSTED");
    expect((await balanceOf(pens))!.qty).toBe("3.000");
    // The same Manager reverses an issue of their own beside it: the right is on.
    const own = await issued([{ variantId: pens, qty: "1" }]);
    expect(await reverse(own.documentId, manager)).toMatchObject({ ok: true });
  });

  it("a Manager of another branch is Not found on a direct entry, nothing saved (03 rule 1)", async () => {
    const pens = await goods();
    const entry = await enteredDirectly(pens, "3");
    const away = await insertBranch();
    const stranger = (await insertUser("MANAGER", { branches: [away.id] })).id;
    const result = await reverse(entry.documentId, stranger);
    expect(result.ok ? null : result.error.code).toBe("not_found");
    expect((await documentOf(entry.documentId)).status).toBe("POSTED");
    expect((await balanceOf(pens))!.qty).toBe("3.000");
  });

  it("reversing an issue writes no audit row (plan of 5.7, decided item 5)", async () => {
    const pens = await goods();
    await receive(branch.id, pens, "3", 1000n, head);
    const own = await issued([{ variantId: pens, qty: "1" }]);
    expect(await reverse(own.documentId, manager)).toMatchObject({ ok: true });
    const audits = await db.execute(
      sql`select 1 from audit_log where entity_id = ${own.documentId}`,
    );
    expect(audits.rows).toEqual([]);
  });

  it("an unknown document is Not found", async () => {
    const result = await reverse(randomUUID(), head);
    expect(result.ok ? null : result.error.code).toBe("not_found");
  });

  it("reversing a return lowers the stock and gives the department back what it held (departmentReceived nets it)", async () => {
    const pens = await goods();
    await receive(branch.id, pens, "10", 1000n, manager);
    await issued([{ variantId: pens, qty: "6" }]);
    const back = await postDocument({
      type: "RETURN",
      branchId: branch.id,
      departmentId: department,
      createdBy: manager,
      lines: [{ variantId: pens, qty: "4" }],
    });
    const held = () =>
      departmentReceived(db, { branchId: branch.id, departmentId: department, variantIds: [pens] });
    expect((await held()).get(pens)).toBe("2.000");

    expect((await reverse(back.documentId, manager)).ok).toBe(true);
    expect((await held()).get(pens)).toBe("6.000");
    expect((await balanceOf(pens))!.qty).toBe("4.000");
    expect((await documentOf(back.documentId)).status).toBe("REVERSED");
  });

  it("an issue partly returned still reverses, its reason the comment: stock and the department's amount follow (review of the plan, correction 1)", async () => {
    // The review's own example: stock 100, issue 10 (90), the department returns 4 (94); the
    // issue was wrong, so the true stock is 104.
    const pens = await goods();
    await receive(branch.id, pens, "100", 1000n, manager);
    const wrong = await issued([{ variantId: pens, qty: "10" }]);
    await postDocument({
      type: "RETURN",
      branchId: branch.id,
      departmentId: department,
      createdBy: manager,
      lines: [{ variantId: pens, qty: "4" }],
    });
    expect((await balanceOf(pens))!.qty).toBe("94.000");

    expect((await reverse(wrong.documentId, manager)).ok).toBe(true);
    expect((await balanceOf(pens))!.qty).toBe("104.000");
    const held = await departmentReceived(db, {
      branchId: branch.id,
      departmentId: department,
      variantIds: [pens],
    });
    expect(held.get(pens)).toBe("-4.000");
  });
});

describe('a "Give straight to requester" issue (07 What saving a record does 5)', () => {
  it("reverses like any issue: its items come into stock and the purchase stays", async () => {
    const item = await insertItem();
    const made = await insertOrder({
      branchId: branch.id,
      ownerId: manager,
      status: "PURCHASING",
      variantId: item.variantId,
      departmentId: department,
      plannedQty: "10",
      plannedPrice: 5_000n,
      paymentType: "CARD",
      submittedAt: new Date("2031-05-02T05:00:00Z"),
      approvedAt: new Date("2031-05-02T07:00:00Z"),
    });
    const recorded = await runOrdersAction(recordPurchase, manager, {
      clientKey: randomUUID(),
      orders: [{ id: made.id, version: made.version }],
      purchasedOn: "2031-05-03",
      paymentType: "CARD",
      supplierId: null,
      receiptFileIds: [],
      lines: [
        {
          orderId: made.id,
          variantId: made.variantId,
          qty: "10",
          unitPrice: "5000",
          extras: [],
          comment: null,
          giveToRequester: true,
        },
      ],
    });
    expect(recorded.ok).toBe(true);
    expect((await balanceOf(item.variantId))!.qty).toBe("0.000");
    const found = await db.execute<{ id: string }>(sql`
      select id from stock_documents where branch_id = ${branch.id} and type = 'ISSUE'`);
    expect(found.rows).toHaveLength(1);

    expect((await reverse(found.rows[0]!.id, manager)).ok).toBe(true);
    expect((await balanceOf(item.variantId))!.qty).toBe("10.000");
    const kept = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from purchases where order_id = ${made.id} and cancelled_at is null`);
    expect(kept.rows[0]!.n).toBe(1);
  });
});
