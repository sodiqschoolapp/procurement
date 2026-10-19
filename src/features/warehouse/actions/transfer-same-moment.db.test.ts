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
import { sendTransfer } from "./transfer";

// Two transfers of the last items at the same moment (09-warehouse.md intro: "Stock can never go
// below zero"; 15 Test layers: "Actions run two at a time to prove the locks work"; plan of 7.1,
// Tests). Both sides are the real actions, started in a fixed order while a third transaction
// holds the balance row the first waits on (.claude/rules/tests.md); each side's one code.

const DAY = "2031-05-05";

describe("two Managers send the last 10 at the same moment (09 intro; plan of 7.1)", () => {
  it("one succeeds, the other is refused on that line with 0 left; the sender's stock is 0, never below", async () => {
    setClock(`${DAY}T07:00:00Z`);
    const sender = await insertBranch();
    const receiver = await insertBranch();
    const first = await insertUser("MANAGER", { branches: [sender.id] });
    const second = await insertUser("MANAGER", { branches: [sender.id] });
    const { variantId } = await insertItem();
    await receive(sender.id, variantId, "10", 2_000n, first.id);

    const send = (userId: string) => () =>
      runAction(sendTransfer, userId, {
        clientKey: randomUUID(),
        branchId: sender.id,
        toBranchId: receiver.id,
        docDate: DAY,
        receivedByName: null,
        comment: null,
        lines: [{ variantId, qty: "10" }],
      });
    const [won, lost] = await heldWhile(
      "select 1 from stock_balances where branch_id = $1 and variant_id = $2 for update",
      [sender.id, variantId],
      [send(first.id), send(second.id)],
    );
    expect(won).toMatchObject({ ok: true });
    expect(lost).toEqual({
      ok: false,
      error: {
        code: "invalid_input",
        messageKey: "errors.invalidInput",
        fields: { "lines.0.qty": "errors.field.stockShort" },
        available: { "lines.0.qty": "0" },
      },
    });
    const balance = await db.execute<{ qty: string }>(sql`
      select qty::text as qty from stock_balances
      where branch_id = ${sender.id} and variant_id = ${variantId}`);
    expect(balance.rows[0]!.qty).toBe("0.000");
    const sent = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from stock_documents where branch_id = ${sender.id}`,
    );
    expect(sent.rows[0]!.n).toBe(1);
  });
});
