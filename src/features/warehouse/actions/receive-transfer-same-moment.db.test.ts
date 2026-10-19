import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { heldWhile } from "../../../../tests/helpers/held-while";
import { insertItem } from "../../../../tests/helpers/orders";
import { receive, sendTransferDocument } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { receiveTransfer } from "./receive-transfer";

// Two receivers press Confirm at the same moment (09-warehouse.md, Other documents, Transfer; 15
// Test layers: "Actions run two at a time to prove the locks work"; plan of 7.2, decided item 9).
// Both sides are the real actions, started in a fixed order while a third transaction holds the
// transfer's row they lock (.claude/rules/tests.md); each side's one code.

describe("two Managers of the receiving branch receive one transfer at the same moment (plan of 7.2)", () => {
  it("one receives, the other is wrong_status; the stock rises once and one write-off is asked", async () => {
    setClock("2031-05-05T07:00:00Z");
    const sender = await insertBranch();
    const receiver = await insertBranch();
    const maker = await insertUser("MANAGER", { branches: [sender.id] });
    const first = await insertUser("MANAGER", { branches: [receiver.id] });
    const second = await insertUser("MANAGER", { branches: [receiver.id] });
    const { variantId } = await insertItem();
    await receive(sender.id, variantId, "10", 2_000n, maker.id);
    const made = await sendTransferDocument({
      branchId: sender.id,
      toBranchId: receiver.id,
      createdBy: maker.id,
      lines: [{ variantId, qty: "10" }],
    });

    const press = (userId: string) => () =>
      runAction(receiveTransfer, userId, {
        documentId: made.documentId,
        receivedByName: null,
        lines: [{ lineId: made.lineIds[0]!, receivedQty: "8" }],
      });
    const [won, lost] = await heldWhile(
      "select 1 from stock_documents where id = $1 for update",
      [made.documentId],
      [press(first.id), press(second.id)],
    );
    expect(won).toMatchObject({ ok: true });
    expect(lost).toEqual({
      ok: false,
      error: { code: "wrong_status", messageKey: "errors.wrongStatus" },
    });
    const balance = await db.execute<{ branch_id: string; qty: string }>(sql`
      select branch_id, qty::text as qty from stock_balances where variant_id = ${variantId}`);
    expect(Object.fromEntries(balance.rows.map((row) => [row.branch_id, row.qty]))).toEqual({
      [sender.id]: "2.000",
      [receiver.id]: "8.000",
    });
    const writeOffs = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from stock_documents
      where branch_id = ${sender.id} and type = 'WRITE_OFF'`);
    expect(writeOffs.rows[0]!.n).toBe(1);
  });
});
