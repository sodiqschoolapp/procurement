import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { refusalOf } from "../../../../tests/helpers/database-error";
import { insertDepartment, insertItem } from "../../../../tests/helpers/orders";
import { postDocument, receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { askWriteOff } from "./write-off";
import { decideWriteOff } from "./write-off-decision";

// The Head's decision on a write-off (build plan 5.11, Done when; plan of 5.11, Tests). Spec:
// 09-warehouse.md (Other documents, Write-off: "Stock changes only after the Head approves"; Stock
// value: write-offs use the average at that moment); 03 Permission matrix "Approve a write-off or
// stock correction"; 10 Notifications ("the decision goes back to the Manager"); edge-cases/
// purchasing-and-money.md ("Faulty goods go back to the supplier"); developer-rules.md rules 2
// and 3. Every fixture is asserted (D38); every refusal carries other stock beside it (D40).

const ASKED = "2031-05-03T06:00:00Z";
const DECIDED = "2031-05-04T09:30:00Z";

let branch: { id: string; code: string };
let manager: { id: string };
let head: { id: string };

beforeEach(async () => {
  setClock(ASKED);
  branch = await insertBranch();
  manager = await insertUser("MANAGER", { branches: [branch.id] });
  head = await insertUser("HEAD");
});

async function balanceOf(variantId: string) {
  const found = await db.execute<{ qty: string; avg_cost: string }>(sql`
    select qty::text as qty, avg_cost::text as avg_cost from stock_balances
    where branch_id = ${branch.id} and variant_id = ${variantId}`);
  return found.rows[0];
}

async function documentOf(id: string) {
  const found = await db.execute<{
    status: string;
    decided_by: string | null;
    decided_at: string | null;
  }>(sql`
    select status, decided_by, to_char(decided_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as decided_at
    from stock_documents where id = ${id}`);
  return found.rows[0]!;
}

async function movementsOf(id: string) {
  const found = await db.execute<{
    type: string;
    variant_id: string;
    qty_delta: string;
    unit_cost: string;
    created_by: string;
  }>(sql`
    select m.type, m.variant_id, m.qty_delta::text as qty_delta, m.unit_cost::text as unit_cost,
      m.created_by
    from stock_movements m join stock_document_lines l on l.id = m.document_line_id
    where l.document_id = ${id} order by m.seq`);
  return found.rows;
}

/** A Manager's waiting write-off of the lines; asserted waiting (D38). */
async function asked(
  lines: { variantId: string; qty: string }[],
  reason: "DAMAGED" | "RETURNED_TO_SUPPLIER" = "DAMAGED",
) {
  setClock(ASKED);
  const result = await runAction(askWriteOff, manager.id, {
    clientKey: randomUUID(),
    branchId: branch.id,
    docDate: "2031-05-03",
    reason,
    comment: "Sinov izoh",
    lines,
  });
  if (!result.ok) throw new Error(`fixture: ${result.error.code}`);
  expect(result.data.posted).toBe(false);
  setClock(DECIDED);
  return result.data;
}

describe("decideWriteOff: approve (Done when 2)", () => {
  it("lowers the stock by each line at the average of that moment, made by the approving Head; POSTED with who and when", async () => {
    const { variantId: a } = await insertItem();
    const { variantId: b } = await insertItem();
    await receive(branch.id, a, "10", 1000n, manager.id);
    await receive(branch.id, b, "6", 700n, manager.id);
    const writeOff = await asked([
      { variantId: a, qty: "4" },
      { variantId: b, qty: "6" },
    ]);
    // The average moves between the ask and the approval: the approval's is the one used.
    await receive(branch.id, a, "10", 2000n, manager.id); // 20 @ 1 500

    const result = await runAction(decideWriteOff, head.id, {
      documentId: writeOff.documentId,
      outcome: "APPROVE",
    });
    expect(result).toEqual({
      ok: true,
      data: { documentId: writeOff.documentId, number: writeOff.number, outcome: "APPROVE" },
    });
    expect(await documentOf(writeOff.documentId)).toEqual({
      status: "POSTED",
      decided_by: head.id,
      decided_at: DECIDED,
    });
    expect(await movementsOf(writeOff.documentId)).toEqual(
      expect.arrayContaining([
        {
          type: "WRITE_OFF",
          variant_id: a,
          qty_delta: "-4.000",
          unit_cost: "1500",
          created_by: head.id,
        },
        {
          type: "WRITE_OFF",
          variant_id: b,
          qty_delta: "-6.000",
          unit_cost: "700",
          created_by: head.id,
        },
      ]),
    );
    expect(await balanceOf(a)).toEqual({ qty: "16.000", avg_cost: "1500" });
    // A line exactly equal to the stock is approved; at 0 the average resets (09 Stock value; D40).
    expect(await balanceOf(b)).toEqual({ qty: "0.000", avg_cost: "0" });
  });

  it('writes off faulty goods sent back to the supplier after closing (edge case "Faulty goods go back to the supplier")', async () => {
    const { variantId: a } = await insertItem();
    await receive(branch.id, a, "8", 2500n, manager.id);
    const writeOff = await asked([{ variantId: a, qty: "3" }], "RETURNED_TO_SUPPLIER");
    const result = await runAction(decideWriteOff, head.id, {
      documentId: writeOff.documentId,
      outcome: "APPROVE",
    });
    expect(result.ok).toBe(true);
    expect(await movementsOf(writeOff.documentId)).toEqual([
      {
        type: "WRITE_OFF",
        variant_id: a,
        qty_delta: "-3.000",
        unit_cost: "2500",
        created_by: head.id,
      },
    ]);
    expect(await balanceOf(a)).toEqual({ qty: "5.000", avg_cost: "2500" });
  });

  it("refuses the whole approval when the stock fell below a line, naming the line and what is left; nothing moves and it keeps waiting (decided item 2; rule 3)", async () => {
    const { variantId: a } = await insertItem();
    const { variantId: b } = await insertItem();
    await receive(branch.id, a, "10", 1000n, manager.id);
    await receive(branch.id, b, "5", 700n, manager.id);
    const writeOff = await asked([
      { variantId: a, qty: "8" },
      { variantId: b, qty: "2" },
    ]);
    // An issue of 3 leaves 7: the line of 8 is one past the stock; b stays covered beside it.
    const department = await insertDepartment(branch.id);
    await postDocument({
      type: "ISSUE",
      branchId: branch.id,
      departmentId: department.id,
      createdBy: manager.id,
      lines: [{ variantId: a, qty: "3" }],
    });
    expect((await balanceOf(a))?.qty).toBe("7.000");
    const lineOfA = await db.execute<{ id: string }>(sql`
      select id from stock_document_lines
      where document_id = ${writeOff.documentId} and variant_id = ${a}`);
    const field = `lines.${lineOfA.rows[0]!.id}.qty`;

    const result = await runAction(decideWriteOff, head.id, {
      documentId: writeOff.documentId,
      outcome: "APPROVE",
    });
    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_input",
        messageKey: "errors.invalidInput",
        fields: { [field]: "errors.field.stockShort" },
        available: { [field]: "7" },
      },
    });
    expect(await documentOf(writeOff.documentId)).toEqual({
      status: "PENDING_APPROVAL",
      decided_by: null,
      decided_at: null,
    });
    expect(await movementsOf(writeOff.documentId)).toEqual([]);
    expect(await balanceOf(a)).toEqual({ qty: "7.000", avg_cost: "1000" });
    expect(await balanceOf(b)).toEqual({ qty: "5.000", avg_cost: "700" });
  });
});

describe("decideWriteOff: refuse (Done when 3)", () => {
  it("sets REJECTED with who and when, and changes no stock and writes no movement", async () => {
    const { variantId: a } = await insertItem();
    await receive(branch.id, a, "10", 1000n, manager.id);
    const writeOff = await asked([{ variantId: a, qty: "4" }]);
    const result = await runAction(decideWriteOff, head.id, {
      documentId: writeOff.documentId,
      outcome: "REFUSE",
      reason: "Sinov sababi",
    });
    expect(result).toMatchObject({ ok: true, data: { outcome: "REFUSE" } });
    expect(await documentOf(writeOff.documentId)).toEqual({
      status: "REJECTED",
      decided_by: head.id,
      decided_at: DECIDED,
    });
    expect(await movementsOf(writeOff.documentId)).toEqual([]);
    expect(await balanceOf(a)).toEqual({ qty: "10.000", avg_cost: "1000" });
  });
});

async function reasonOf(documentId: string): Promise<string | null> {
  const found = await db.execute<{ decision_reason: string | null }>(
    sql`select decision_reason from stock_documents where id = ${documentId}`,
  );
  return found.rows[0]!.decision_reason;
}

describe('decideWriteOff: the reason of a refusal (09 Other documents, Write-off: "A refusal of a write-off … carries a reason"; plan of 7.4c)', () => {
  it("refuses a refusal without a reason, with 4 or with 501 characters; the write-off still waits (Done when)", async () => {
    const { variantId: a } = await insertItem();
    await receive(branch.id, a, "10", 1000n, manager.id);
    const writeOff = await asked([{ variantId: a, qty: "4" }]);
    for (const [reason, kind] of [
      [undefined, "errors.field.required"],
      ["   ", "errors.field.required"],
      ["abcd", "errors.field.tooShort"],
      ["a".repeat(501), "errors.field.tooLong"],
    ] as const) {
      const result = await runAction(decideWriteOff, head.id, {
        documentId: writeOff.documentId,
        outcome: "REFUSE",
        ...(reason === undefined ? {} : { reason }),
      });
      expect(result).toMatchObject({
        ok: false,
        error: { code: "invalid_input", fields: { reason: kind } },
      });
    }
    expect(await documentOf(writeOff.documentId)).toEqual({
      status: "PENDING_APPROVAL",
      decided_by: null,
      decided_at: null,
    });
    expect(await reasonOf(writeOff.documentId)).toBeNull();
  });

  it("stores the reason trimmed on a refusal, and none on an approval", async () => {
    const { variantId: a } = await insertItem();
    await receive(branch.id, a, "10", 1000n, manager.id);
    const refused = await asked([{ variantId: a, qty: "1" }]);
    expect(
      (
        await runAction(decideWriteOff, head.id, {
          documentId: refused.documentId,
          outcome: "REFUSE",
          reason: "  Singan emas, ishlaydi  ",
        })
      ).ok,
    ).toBe(true);
    expect(await reasonOf(refused.documentId)).toBe("Singan emas, ishlaydi");

    const approved = await asked([{ variantId: a, qty: "1" }]);
    expect(
      (
        await runAction(decideWriteOff, head.id, {
          documentId: approved.documentId,
          outcome: "APPROVE",
          reason: "Sinov sababi",
        })
      ).ok,
    ).toBe(true);
    expect(await reasonOf(approved.documentId)).toBeNull();
  });
});

describe("decideWriteOff: one decision only (plan of 5.11, decided item 4; developer-rules rule 2)", () => {
  it("refuses a second approve or refuse after either, with wrong_status, and moves nothing more", async () => {
    const { variantId: a } = await insertItem();
    await receive(branch.id, a, "10", 1000n, manager.id);
    for (const first of ["APPROVE", "REFUSE"] as const) {
      const writeOff = await asked([{ variantId: a, qty: "1" }]);
      expect(
        (
          await runAction(decideWriteOff, head.id, {
            documentId: writeOff.documentId,
            outcome: first,
            reason: "Sinov sababi",
          })
        ).ok,
      ).toBe(true);
      const qty = (await balanceOf(a))!.qty;
      for (const second of ["APPROVE", "REFUSE"] as const) {
        expect(
          await runAction(decideWriteOff, head.id, {
            documentId: writeOff.documentId,
            outcome: second,
            reason: "Sinov sababi",
          }),
        ).toMatchObject({ ok: false, error: { code: "wrong_status" } });
      }
      expect((await balanceOf(a))!.qty).toBe(qty);
    }
  });

  it("answers Not found for a document of another type", async () => {
    const { variantId: a } = await insertItem();
    await receive(branch.id, a, "10", 1000n, manager.id);
    const department = await insertDepartment(branch.id);
    const issue = await postDocument({
      type: "ISSUE",
      branchId: branch.id,
      departmentId: department.id,
      createdBy: manager.id,
      lines: [{ variantId: a, qty: "1" }],
    });
    expect(
      await runAction(decideWriteOff, head.id, {
        documentId: issue.documentId,
        outcome: "APPROVE",
      }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("the database refuses a decided_by without decided_at (stock_documents_decided_check, D39)", async () => {
    const { variantId: a } = await insertItem();
    await receive(branch.id, a, "10", 1000n, manager.id);
    const writeOff = await asked([{ variantId: a, qty: "1" }]);
    expect(
      await refusalOf(
        db.execute(sql`
          update stock_documents set status = 'REJECTED', decided_by = ${head.id},
            decision_reason = 'Sinov sababi'
          where id = ${writeOff.documentId}`),
      ),
    ).toMatchObject({ code: "23514", constraint: "stock_documents_decided_check" });
  });
});

describe("decideWriteOff: the decision goes back to the Manager (10 Notifications)", () => {
  it("tells the Manager who asked, once, with the outcome and the link; nobody else", async () => {
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    const { variantId: a } = await insertItem();
    await receive(branch.id, a, "10", 1000n, manager.id);
    for (const [outcome, word] of [
      ["APPROVE", "approved"],
      ["REFUSE", "refused"],
    ] as const) {
      const writeOff = await asked([{ variantId: a, qty: "1" }]);
      expect(
        (
          await runAction(decideWriteOff, head.id, {
            documentId: writeOff.documentId,
            outcome,
            reason: "Sinov sababi",
          })
        ).ok,
      ).toBe(true);
      const link = `/warehouse/documents/${writeOff.documentId}`;
      const told = await db.execute<{ user_id: string; params: Record<string, unknown> }>(sql`
        select user_id, params from notifications
        where type = 'STOCK_CHANGE_DECIDED' and link = ${link}`);
      expect(told.rows).toEqual([
        {
          user_id: manager.id,
          params: {
            number: writeOff.number,
            branch: branch.code,
            kind: "WRITE_OFF",
            outcome: word,
          },
        },
      ]);
      const toColleague = await db.execute<{ n: number }>(sql`
        select count(*)::int as n from notifications where user_id = ${colleague.id}`);
      expect(toColleague.rows[0]!.n).toBe(0);
    }
  });
});

describe("decideWriteOff: an asker who left the branch is not told (03 rule 1; notify() of 0.11)", () => {
  it("a Manager taken off the branch while it waits gets no notice of the decision", async () => {
    const { variantId: a } = await insertItem();
    await receive(branch.id, a, "10", 1000n, manager.id);
    const writeOff = await asked([{ variantId: a, qty: "1" }]);
    await db.execute(sql`delete from user_branches where user_id = ${manager.id}`);
    expect(
      (
        await runAction(decideWriteOff, head.id, {
          documentId: writeOff.documentId,
          outcome: "REFUSE",
          reason: "Sinov sababi",
        })
      ).ok,
    ).toBe(true);
    const told = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from notifications
      where user_id = ${manager.id} and type = 'STOCK_CHANGE_DECIDED'`);
    expect(told.rows[0]!.n).toBe(0);
  });
});
