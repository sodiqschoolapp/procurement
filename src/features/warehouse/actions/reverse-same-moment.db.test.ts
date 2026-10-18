import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { heldWhile } from "../../../../tests/helpers/held-while";
import { insertDepartment, insertItem } from "../../../../tests/helpers/orders";
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
