import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { heldWhile } from "../../../../tests/helpers/held-while";
import { insertItem } from "../../../../tests/helpers/orders";
import { receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { askWriteOff } from "./write-off";
import { decideWriteOff } from "./write-off-decision";

// Two Heads decide one write-off at the same moment (15-quality-and-acceptance.md, Test layers:
// "Actions run two at a time to prove the locks work"; 03 rule 2: "the first action wins"; plan of
// 5.11, decided item 4). Both real actions start while a third transaction holds the document;
// the asserts follow from which committed first (.claude/rules/tests.md).

describe("two decisions of one write-off at the same moment", () => {
  it("the first Head's approval wins; the second Head's refusal is wrong_status, and the stock fell once", async () => {
    setClock("2031-05-05T07:00:00Z");
    const branch = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const first = await insertUser("HEAD");
    const second = await insertUser("HEAD");
    const { variantId } = await insertItem();
    await receive(branch.id, variantId, "10", 1000n, manager.id);
    const asked = await runAction(askWriteOff, manager.id, {
      clientKey: randomUUID(),
      branchId: branch.id,
      docDate: "2031-05-05",
      reason: "LOST",
      comment: "Sinov izoh",
      lines: [{ variantId, qty: "4" }],
    });
    if (!asked.ok) throw new Error(`fixture: ${asked.error.code}`);

    const [approved, refused] = await heldWhile(
      "select 1 from stock_documents where id = $1 for update",
      [asked.data.documentId],
      [
        () =>
          runAction(decideWriteOff, first.id, {
            documentId: asked.data.documentId,
            outcome: "APPROVE",
          }),
        () =>
          runAction(decideWriteOff, second.id, {
            documentId: asked.data.documentId,
            outcome: "REFUSE",
            reason: "Sinov sababi",
          }),
      ],
    );
    expect(approved).toMatchObject({ ok: true, data: { outcome: "APPROVE" } });
    expect(refused).toMatchObject({ ok: false, error: { code: "wrong_status" } });
    const document = await db.execute<{ status: string; decided_by: string }>(sql`
      select status, decided_by from stock_documents where id = ${asked.data.documentId}`);
    expect(document.rows[0]).toEqual({ status: "POSTED", decided_by: first.id });
    const balance = await db.execute<{ qty: string }>(sql`
      select qty::text as qty from stock_balances
      where branch_id = ${branch.id} and variant_id = ${variantId}`);
    expect(balance.rows[0]!.qty).toBe("6.000");
  });
});
