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
import { askWriteOff } from "./write-off";
import { decideWriteOff } from "./write-off-decision";

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

});

describe("reversing an issue after a return (09 Issue to a department 3: refused past what the department still holds; D57; plan of 5.7b)", () => {
  async function returned(variantId: string, qty: string) {
    return postDocument({
      type: "RETURN",
      branchId: branch.id,
      departmentId: department,
      createdBy: manager,
      lines: [{ variantId, qty }],
    });
  }

  async function lineOf(documentId: string) {
    const found = await db.execute<{ id: string }>(
      sql`select id from stock_document_lines where document_id = ${documentId}`,
    );
    return found.rows[0]!.id;
  }

  it("10 notebooks issued to Maths and 4 returned: the issue's reverse is refused on its line with the 6 held, nothing moves; once the return is reversed, the issue reverses and stock is back to before the issue (Done when)", async () => {
    const notebooks = await goods();
    await receive(branch.id, notebooks, "50", 1000n, manager);
    const issue = await issued([{ variantId: notebooks, qty: "10" }]);
    const back = await returned(notebooks, "4");
    expect(await balanceOf(notebooks)).toEqual({ qty: "44.000", avg_cost: "1000" });

    const field = `lines.${await lineOf(issue.documentId)}.qty`;
    const refused = await reverse(issue.documentId, manager);
    expect(refused).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        fields: { [field]: "errors.field.reverseOverHeld" },
        available: { [field]: "6.000" },
      },
    });
    expect(await balanceOf(notebooks)).toEqual({ qty: "44.000", avg_cost: "1000" });
    expect((await documentOf(issue.documentId)).status).toBe("POSTED");
    expect(await reversalsOf(issue.documentId)).toEqual([]);

    expect((await reverse(back.documentId, manager)).ok).toBe(true);
    expect((await balanceOf(notebooks))!.qty).toBe("40.000");
    expect((await reverse(issue.documentId, manager)).ok).toBe(true);
    expect(await balanceOf(notebooks)).toEqual({ qty: "50.000", avg_cost: "1000" });
    const held = await departmentReceived(db, {
      branchId: branch.id,
      departmentId: department,
      variantIds: [notebooks],
    });
    expect(held.get(notebooks)).toBe("0.000");
  });

  it("an issue whose whole quantity the department still holds reverses: equal is not over (09 Issue 3)", async () => {
    // Another issue of the same department and item makes it hold 10 after a return of 4, so the
    // first issue's 10 is not over (D40: a return of 4 stands beside it).
    const pens = await goods();
    await receive(branch.id, pens, "30", 1000n, manager);
    const first = await issued([{ variantId: pens, qty: "10" }]);
    await issued([{ variantId: pens, qty: "4" }]);
    await returned(pens, "4");
    expect((await balanceOf(pens))!.qty).toBe("20.000");

    expect((await reverse(first.documentId, manager)).ok).toBe(true);
    expect((await balanceOf(pens))!.qty).toBe("30.000");
  });

  it("one line over refuses the whole reverse: the line the department returned nothing of stays too (CLAUDE.md rule 3)", async () => {
    const pens = await goods();
    const paper = await goods();
    await receive(branch.id, pens, "20", 1000n, manager);
    await receive(branch.id, paper, "20", 700n, manager);
    const issue = await issued([
      { variantId: pens, qty: "5" },
      { variantId: paper, qty: "3" },
    ]);
    await returned(pens, "1");

    const refused = await reverse(issue.documentId, manager);
    expect(refused).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    if (refused.ok) throw new Error("refused");
    expect(Object.values(refused.error.fields ?? {})).toEqual(["errors.field.reverseOverHeld"]);
    expect((await balanceOf(pens))!.qty).toBe("16.000");
    expect((await balanceOf(paper))!.qty).toBe("17.000");
    expect(await reversalsOf(issue.documentId)).toEqual([]);
  });

  it("the Head is refused the same way (09 Issue 3 names no one who may reverse past it)", async () => {
    const pens = await goods();
    await receive(branch.id, pens, "20", 1000n, manager);
    const issue = await issued([{ variantId: pens, qty: "5" }]);
    await returned(pens, "2");
    expect(await reverse(issue.documentId, head)).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    expect((await balanceOf(pens))!.qty).toBe("17.000");
  });

  it("a return over what the department holds still reverses: the rule is the issue's (09 Other documents, Return keeps its warning)", async () => {
    // The department returned 6 of 6, then 2 more with a comment (holds -2): reversing the first
    // return lowers the stock and is not refused, though 6 is more than the -2 held.
    const pens = await goods();
    await receive(branch.id, pens, "20", 1000n, manager);
    await issued([{ variantId: pens, qty: "6" }]);
    const first = await returned(pens, "6");
    await returned(pens, "2");
    expect((await balanceOf(pens))!.qty).toBe("22.000");

    expect((await reverse(first.documentId, manager)).ok).toBe(true);
    expect((await balanceOf(pens))!.qty).toBe("16.000");
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

describe("reverseStockDocument of a write-off (Decided ahead, question 19: the Head only; plan of 5.11)", () => {
  /** A Manager's write-off of `qty`, asked; approved by the Head when `approve`. */
  async function writtenOff(variantId: string, qty: string, approve: boolean) {
    const asked = await runAction(askWriteOff, manager, {
      clientKey: randomUUID(),
      branchId: branch.id,
      docDate: "2031-05-03",
      reason: "DAMAGED",
      comment: "Sinov izoh",
      lines: [{ variantId, qty }],
    });
    if (!asked.ok) throw new Error(`fixture: ${asked.error.code}`);
    if (approve) {
      const decided = await runAction(decideWriteOff, head, {
        documentId: asked.data.documentId,
        outcome: "APPROVE",
      });
      expect(decided.ok).toBe(true);
    }
    return asked.data;
  }

  it("the Head reverses an approved write-off: the stock comes back at its own cost and it is Reversed", async () => {
    const pens = await goods();
    await receive(branch.id, pens, "10", 1000n, head);
    const writeOff = await writtenOff(pens, "4", true);
    expect(await balanceOf(pens)).toEqual({ qty: "6.000", avg_cost: "1000" });
    const result = await reverse(writeOff.documentId, head);
    expect(result).toEqual({
      ok: true,
      data: { documentId: writeOff.documentId, number: writeOff.number },
    });
    expect(await balanceOf(pens)).toEqual({ qty: "10.000", avg_cost: "1000" });
    expect(await reversalsOf(writeOff.documentId)).toEqual([
      expect.objectContaining({ variant_id: pens, qty_delta: "4.000", unit_cost: "1000" }),
    ]);
    expect((await documentOf(writeOff.documentId)).status).toBe("REVERSED");
  });

  it("the Manager who asked, with RETURN_REVERSE on, is refused: forbidden, nothing saved", async () => {
    const pens = await goods();
    await receive(branch.id, pens, "10", 1000n, head);
    const writeOff = await writtenOff(pens, "4", true);
    const result = await reverse(writeOff.documentId, manager);
    expect(result.ok ? null : result.error.code).toBe("forbidden");
    expect((await documentOf(writeOff.documentId)).status).toBe("POSTED");
    expect((await balanceOf(pens))!.qty).toBe("6.000");
  });

  it("a waiting or a refused write-off is not reversed: wrong_status, nothing moves", async () => {
    const pens = await goods();
    await receive(branch.id, pens, "10", 1000n, head);
    const pending = await writtenOff(pens, "2", false);
    expect(await reverse(pending.documentId, head)).toMatchObject({
      ok: false,
      error: { code: "wrong_status" },
    });
    const refused = await writtenOff(pens, "3", false);
    const decided = await runAction(decideWriteOff, head, {
      documentId: refused.documentId,
      outcome: "REFUSE",
      reason: "Sinov sababi",
    });
    expect(decided.ok).toBe(true);
    expect(await reverse(refused.documentId, head)).toMatchObject({
      ok: false,
      error: { code: "wrong_status" },
    });
    expect((await balanceOf(pens))!.qty).toBe("10.000");
  });
});
