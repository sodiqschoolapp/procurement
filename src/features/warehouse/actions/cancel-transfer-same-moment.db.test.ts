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
import { cancelTransfer } from "./cancel-transfer";
import { receiveTransfer } from "./receive-transfer";

// The sender cancels while the receiver confirms, at the same moment (09-warehouse.md, Other
// documents, Transfer: "Until then the sender or the Head can cancel the transfer"; 15 Test
// layers: "Actions run two at a time to prove the locks work"; plan of 7.4c). Both sides are the
// real actions, started in a fixed order while a third transaction holds the transfer's row they
// lock (.claude/rules/tests.md); each side's one code, in both orders.

async function scene() {
  setClock("2031-05-05T07:00:00Z");
  const sender = await insertBranch();
  const receiver = await insertBranch();
  const maker = await insertUser("MANAGER", { branches: [sender.id] });
  const there = await insertUser("MANAGER", { branches: [receiver.id] });
  const { variantId } = await insertItem();
  await receive(sender.id, variantId, "10", 2_000n, maker.id);
  const made = await sendTransferDocument({
    branchId: sender.id,
    toBranchId: receiver.id,
    createdBy: maker.id,
    lines: [{ variantId, qty: "10" }],
  });
  const cancel = () =>
    runAction(cancelTransfer, maker.id, { documentId: made.documentId, reason: "Sinov sababi" });
  const confirm = () =>
    runAction(receiveTransfer, there.id, {
      documentId: made.documentId,
      receivedByName: null,
      lines: [{ lineId: made.lineIds[0]!, receivedQty: "10" }],
    });
  const stock = async () => {
    const found = await db.execute<{ branch_id: string; qty: string }>(sql`
      select branch_id, qty::text as qty from stock_balances where variant_id = ${variantId}`);
    return Object.fromEntries(found.rows.map((row) => [row.branch_id, row.qty]));
  };
  const status = async () =>
    (
      await db.execute<{ status: string }>(
        sql`select status from stock_documents where id = ${made.documentId}`,
      )
    ).rows[0]!.status;
  return { sender, receiver, made, cancel, confirm, stock, status };
}

const WRONG_STATUS = {
  ok: false,
  error: { code: "wrong_status", messageKey: "errors.wrongStatus" },
};

describe("a cancel and a receipt of one transfer at the same moment (plan of 7.4c)", () => {
  it("the cancel first: the receipt is wrong_status, the 10 are back at the sender and none at the receiver", async () => {
    const s = await scene();
    const [cancelled, received] = await heldWhile(
      "select 1 from stock_documents where id = $1 for update",
      [s.made.documentId],
      [s.cancel, s.confirm],
    );
    expect(cancelled).toMatchObject({ ok: true });
    expect(received).toEqual(WRONG_STATUS);
    expect(await s.stock()).toEqual({ [s.sender.id]: "10.000" });
    expect(await s.status()).toBe("CANCELLED");
  });

  it("the receipt first: the cancel is wrong_status, the 10 are at the receiver", async () => {
    const s = await scene();
    const [received, cancelled] = await heldWhile(
      "select 1 from stock_documents where id = $1 for update",
      [s.made.documentId],
      [s.confirm, s.cancel],
    );
    expect(received).toMatchObject({ ok: true });
    expect(cancelled).toEqual(WRONG_STATUS);
    expect(await s.stock()).toEqual({ [s.sender.id]: "0.000", [s.receiver.id]: "10.000" });
    expect(await s.status()).toBe("RECEIVED");
  });
});
