import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { db } from "@/server/db/client";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { refusalOf } from "../../../../tests/helpers/database-error";
import { setClock } from "../../../../tests/helpers/clock";
import { insertDepartment, insertItem } from "../../../../tests/helpers/orders";
import {
  postDocument,
  receive,
  sendTransferDocument,
} from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { type ReceiveTransferInput, receiveTransfer } from "./receive-transfer";
import { reverseStockDocument } from "./reverse";
import { sendTransfer } from "./transfer";
import { decideWriteOff } from "./write-off-decision";

// Receive a transfer (build plan 7.2; plan of 7.2, Tests). Spec: 09-warehouse.md (Movement types:
// "Transfer to another branch | Down at the sender, up at the receiver | Sending Manager; the
// receiving Manager confirms"; Other documents, Transfer: "The receiving Manager enters what really
// arrived. Any shortage becomes a write-off request 'Lost in transfer' on the sending branch for
// the Head to decide"; Stock value, second bullet: "A transfer arrives at the receiver with the
// sender's average"); 16-build-order.md (phase 7 row: "Send 10 items to another branch, receive 8,
// see the write-off request"); edge-cases/warehouse.md ("A transfer arrives short"; "Half a
// piece"); 10 Notifications ("Write-off or correction asked | Head; the decision goes back to the
// Manager"); Decided ahead, question 19. Every fixture is asserted (D38); the receiver holds stock
// of the same subtype at another average beside every receipt, so a movement in the wrong branch
// or at the wrong cost shows (D40).

const AT = "2031-05-03T06:00:00Z";

let sender: { id: string; code: string };
let receiver: { id: string; code: string };
let sendingManager: { id: string; fullName: string };
let receivingManager: { id: string; fullName: string };
let head: { id: string; fullName: string };

beforeEach(async () => {
  setClock(AT);
  sender = await insertBranch();
  receiver = await insertBranch();
  sendingManager = await insertUser("MANAGER", { branches: [sender.id] });
  receivingManager = await insertUser("MANAGER", { branches: [receiver.id] });
  head = await insertUser("HEAD");
});

async function balanceOf(branchId: string, variantId: string) {
  const found = await db.execute<{ qty: string; avg_cost: string }>(sql`
    select qty::text as qty, avg_cost::text as avg_cost from stock_balances
    where branch_id = ${branchId} and variant_id = ${variantId}`);
  return found.rows[0];
}

async function movementsOf(branchId: string, variantId: string) {
  const found = await db.execute<{ type: string; qty_delta: string; unit_cost: string }>(sql`
    select type, qty_delta::text as qty_delta, unit_cost::text as unit_cost from stock_movements
    where branch_id = ${branchId} and variant_id = ${variantId} order by seq`);
  return found.rows;
}

async function documentOf(id: string) {
  const found = await db.execute<{
    status: string;
    received_by_name: string | null;
    decided_by: string | null;
    decided_at: string | null;
  }>(sql`select status, received_by_name, decided_by,
    to_char(decided_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as decided_at
    from stock_documents
    where id = ${id}`);
  return found.rows[0]!;
}

async function writeOffsOf(branchId: string) {
  const found = await db.execute<{
    id: string;
    number: string;
    status: string;
    reason: string;
    comment: string;
    created_by: string;
    decided_by: string | null;
    doc_date: string;
  }>(sql`select id, number, status, reason, comment, created_by, decided_by,
      doc_date::text as doc_date
    from stock_documents where branch_id = ${branchId} and type = 'WRITE_OFF'`);
  return found.rows;
}

async function linesOf(documentId: string) {
  const found = await db.execute<{ variant_id: string; qty: string; received_qty: string | null }>(
    sql`select variant_id, qty::text as qty, received_qty::text as received_qty
      from stock_document_lines where document_id = ${documentId} order by variant_id`,
  );
  return found.rows;
}

async function noticesOf(userId: string) {
  const found = await db.execute<{ type: string; params: Record<string, unknown>; link: string }>(
    sql`select type, params, link from notifications where user_id = ${userId}`,
  );
  return found.rows;
}

/** A goods subtype: `qty` at the sender at 5 000 so'm, and 4 at the receiver at 3 000 so'm. */
async function inStock(qty: string, allowDecimal = false): Promise<string> {
  const { variantId } = await insertItem({ allowDecimal });
  await receive(sender.id, variantId, qty, 5000n, head.id);
  await receive(receiver.id, variantId, "4", 3000n, head.id);
  expect(await balanceOf(sender.id, variantId)).toEqual({
    qty: Number(qty).toFixed(3),
    avg_cost: "5000",
  });
  expect(await balanceOf(receiver.id, variantId)).toEqual({ qty: "4.000", avg_cost: "3000" });
  return variantId;
}

/** A transfer of the lines, sent and asserted (D38); its line ids by subtype. */
async function sent(
  lines: { variantId: string; qty: string }[],
  receivedByName: string | null = null,
) {
  const made = await sendTransferDocument({
    branchId: sender.id,
    toBranchId: receiver.id,
    createdBy: sendingManager.id,
    lines,
    receivedByName,
  });
  expect((await documentOf(made.documentId)).status).toBe("IN_TRANSIT");
  const lineOf = new Map(lines.map((line, index) => [line.variantId, made.lineIds[index]!]));
  return { ...made, lineOf };
}

function receiveInput(
  documentId: string,
  lines: ReceiveTransferInput["lines"],
  receivedByName: string | null = "Sinov Qabulqiluvchi",
): ReceiveTransferInput {
  return { documentId, receivedByName, lines };
}

describe("the phase 7 check (16-build-order.md: send 10, receive 8, see the write-off request)", () => {
  it("sends 10 through sendTransfer, receives 8: 8 in at the sender's average, 2 back at the sender, a write-off of 2 waits for the Head", async () => {
    const a = await inStock("20");
    const sentResult = await runAction(sendTransfer, sendingManager.id, {
      clientKey: randomUUID(),
      branchId: sender.id,
      toBranchId: receiver.id,
      docDate: "2031-05-03",
      receivedByName: null,
      comment: null,
      lines: [{ variantId: a, qty: "10" }],
    });
    if (!sentResult.ok) throw new Error(`fixture: ${sentResult.error.code}`);
    expect(await balanceOf(sender.id, a)).toEqual({ qty: "10.000", avg_cost: "5000" });
    const [line] = await db
      .execute<{ id: string }>(
        sql`select id from stock_document_lines where document_id = ${sentResult.data.documentId}`,
      )
      .then((found) => found.rows);

    setClock("2031-05-04T09:30:00Z");
    const result = await runAction(
      receiveTransfer,
      receivingManager.id,
      receiveInput(sentResult.data.documentId, [{ lineId: line!.id, receivedQty: "8" }]),
    );
    expect(result).toEqual({
      ok: true,
      data: {
        documentId: sentResult.data.documentId,
        number: sentResult.data.number,
        writeOff: {
          documentId: expect.any(String),
          number: `WOF-${sender.code}-31-0001`,
          posted: false,
        },
      },
    });
    if (!result.ok) return;

    // The receiver: 4 at 3 000 and 8 at 5 000 make 12 at 4 333 (09 Stock value).
    expect(await balanceOf(receiver.id, a)).toEqual({ qty: "12.000", avg_cost: "4333" });
    expect((await movementsOf(receiver.id, a)).at(-1)).toEqual({
      type: "TRANSFER_IN",
      qty_delta: "8.000",
      unit_cost: "5000",
    });
    // The sender: 10 left, 2 back at the cost they left at, waiting for the Head (decided item 1).
    expect(await balanceOf(sender.id, a)).toEqual({ qty: "12.000", avg_cost: "5000" });
    expect((await movementsOf(sender.id, a)).slice(1)).toEqual([
      { type: "TRANSFER_OUT", qty_delta: "-10.000", unit_cost: "5000" },
      { type: "TRANSFER_IN", qty_delta: "2.000", unit_cost: "5000" },
    ]);

    expect(await documentOf(sentResult.data.documentId)).toEqual({
      status: "RECEIVED",
      received_by_name: "Sinov Qabulqiluvchi",
      decided_by: receivingManager.id,
      decided_at: "2031-05-04T09:30:00Z",
    });
    expect(await linesOf(sentResult.data.documentId)).toEqual([
      { variant_id: a, qty: "10.000", received_qty: "8.000" },
    ]);

    // The write-off request "Lost in transfer" of 2 on the sending branch.
    const writeOffs = await writeOffsOf(sender.id);
    expect(writeOffs).toEqual([
      {
        id: result.data.writeOff!.documentId,
        number: `WOF-${sender.code}-31-0001`,
        status: "PENDING_APPROVAL",
        reason: "LOST_IN_TRANSFER",
        comment: sentResult.data.number,
        created_by: receivingManager.id,
        decided_by: null,
        doc_date: "2031-05-04",
      },
    ]);
    expect(await linesOf(writeOffs[0]!.id)).toEqual([
      { variant_id: a, qty: "2.000", received_qty: null },
    ]);
    expect(await writeOffsOf(receiver.id)).toEqual([]);

    // The Head is told (10 Notifications: "Write-off or correction asked").
    expect(await noticesOf(head.id)).toEqual([
      {
        type: "STOCK_CHANGE_ASKED",
        params: {
          actor: receivingManager.fullName,
          number: `WOF-${sender.code}-31-0001`,
          branch: sender.code,
          kind: "WRITE_OFF",
        },
        link: `/warehouse/documents/${result.data.writeOff!.documentId}`,
      },
    ]);

    // The Head approves: the 2 are lost once, and the sender holds 10.
    const approved = await runAction(decideWriteOff, head.id, {
      documentId: result.data.writeOff!.documentId,
      outcome: "APPROVE",
    });
    expect(approved.ok).toBe(true);
    expect(await balanceOf(sender.id, a)).toEqual({ qty: "10.000", avg_cost: "5000" });
    expect(await balanceOf(receiver.id, a)).toEqual({ qty: "12.000", avg_cost: "4333" });
  });

  it("the Head refuses the write-off: the 2 stay counted at the sender (decided item 1)", async () => {
    const a = await inStock("20");
    const made = await sent([{ variantId: a, qty: "10" }]);
    const result = await runAction(
      receiveTransfer,
      receivingManager.id,
      receiveInput(made.documentId, [{ lineId: made.lineOf.get(a)!, receivedQty: "8" }]),
    );
    if (!result.ok) throw new Error(`fixture: ${result.error.code}`);
    const refused = await runAction(decideWriteOff, head.id, {
      documentId: result.data.writeOff!.documentId,
      outcome: "REFUSE",
    });
    expect(refused.ok).toBe(true);
    expect(await balanceOf(sender.id, a)).toEqual({ qty: "12.000", avg_cost: "5000" });
  });
});

describe("receiveTransfer (09 Other documents, Transfer; edge case 'A transfer arrives short')", () => {
  it("all received: no write-off and nobody told; 'Received by' replaces the sender's text", async () => {
    const a = await inStock("20");
    const b = await inStock("3");
    const made = await sent(
      [
        { variantId: a, qty: "10" },
        { variantId: b, qty: "3" },
      ],
      "Sinov Yuboruvchi",
    );
    const result = await runAction(
      receiveTransfer,
      receivingManager.id,
      receiveInput(
        made.documentId,
        [
          { lineId: made.lineOf.get(a)!, receivedQty: "10" },
          { lineId: made.lineOf.get(b)!, receivedQty: " 3 " },
        ],
        "  Sinov   Ombor  ",
      ),
    );
    expect(result).toEqual({
      ok: true,
      data: { documentId: made.documentId, number: made.number, writeOff: null },
    });
    expect((await documentOf(made.documentId)).received_by_name).toBe("Sinov Ombor");
    expect(await balanceOf(receiver.id, a)).toEqual({ qty: "14.000", avg_cost: "4429" });
    expect(await balanceOf(receiver.id, b)).toEqual({ qty: "7.000", avg_cost: "3857" });
    expect(await balanceOf(sender.id, a)).toEqual({ qty: "10.000", avg_cost: "5000" });
    expect(await balanceOf(sender.id, b)).toEqual({ qty: "0.000", avg_cost: "0" });
    expect(await writeOffsOf(sender.id)).toEqual([]);
    expect(await noticesOf(head.id)).toEqual([]);
  });

  it("nothing arrived: no movement at the receiver, all of it back and asked as lost", async () => {
    const a = await inStock("2.5", true);
    const made = await sent([{ variantId: a, qty: "2.5" }]);
    const result = await runAction(
      receiveTransfer,
      receivingManager.id,
      receiveInput(made.documentId, [{ lineId: made.lineOf.get(a)!, receivedQty: "0" }], null),
    );
    if (!result.ok) throw new Error(`fixture: ${result.error.code}`);
    expect(await movementsOf(receiver.id, a)).toHaveLength(1);
    expect(await balanceOf(receiver.id, a)).toEqual({ qty: "4.000", avg_cost: "3000" });
    expect(await balanceOf(sender.id, a)).toEqual({ qty: "2.500", avg_cost: "5000" });
    expect(await linesOf(result.data.writeOff!.documentId)).toEqual([
      { variant_id: a, qty: "2.500", received_qty: null },
    ]);
    expect((await documentOf(made.documentId)).received_by_name).toBeNull();
  });

  it("the Head receives short: the write-off is approved at once by the Head, and nobody is told (plan of 5.11, decided item 1)", async () => {
    const a = await inStock("20");
    const made = await sent([{ variantId: a, qty: "10" }]);
    const result = await runAction(
      receiveTransfer,
      head.id,
      receiveInput(made.documentId, [{ lineId: made.lineOf.get(a)!, receivedQty: "8" }]),
    );
    if (!result.ok) throw new Error(`fixture: ${result.error.code}`);
    expect(result.data.writeOff?.posted).toBe(true);
    const [writeOff] = await writeOffsOf(sender.id);
    expect(writeOff).toMatchObject({ status: "POSTED", decided_by: head.id });
    expect(await balanceOf(sender.id, a)).toEqual({ qty: "10.000", avg_cost: "5000" });
    expect((await movementsOf(sender.id, a)).at(-1)).toEqual({
      type: "WRITE_OFF",
      qty_delta: "-2.000",
      unit_cost: "5000",
    });
    const otherHead = await insertUser("HEAD");
    expect(await noticesOf(otherHead.id)).toEqual([]);
    expect(await noticesOf(head.id)).toEqual([]);
  });

  it("the sender issues the 2 that came back before the Head decides: the approval is refused and the write-off keeps waiting (decided item 1)", async () => {
    const a = await inStock("10");
    const made = await sent([{ variantId: a, qty: "10" }]);
    const result = await runAction(
      receiveTransfer,
      receivingManager.id,
      receiveInput(made.documentId, [{ lineId: made.lineOf.get(a)!, receivedQty: "8" }]),
    );
    if (!result.ok) throw new Error(`fixture: ${result.error.code}`);
    expect(await balanceOf(sender.id, a)).toEqual({ qty: "2.000", avg_cost: "5000" });
    const department = await insertDepartment(sender.id);
    await postDocument({
      type: "ISSUE",
      branchId: sender.id,
      departmentId: department.id,
      createdBy: sendingManager.id,
      lines: [{ variantId: a, qty: "2" }],
    });
    const approved = await runAction(decideWriteOff, head.id, {
      documentId: result.data.writeOff!.documentId,
      outcome: "APPROVE",
    });
    expect(approved).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect((await writeOffsOf(sender.id))[0]!.status).toBe("PENDING_APPROVAL");
    expect(await balanceOf(sender.id, a)).toEqual({ qty: "0.000", avg_cost: "0" });
  });

  it("a receiving Manager with every right off still receives (decided item 2)", async () => {
    for (const right of [
      "TRANSFER_STOCK",
      "ISSUE_STOCK",
      "RETURN_REVERSE",
      "WRITE_OFF_COUNT",
    ] as const) {
      await setManagerRight(receivingManager.id, right, false);
    }
    const a = await inStock("10");
    const made = await sent([{ variantId: a, qty: "10" }]);
    const result = await runAction(
      receiveTransfer,
      receivingManager.id,
      receiveInput(made.documentId, [{ lineId: made.lineOf.get(a)!, receivedQty: "10" }]),
    );
    expect(result.ok).toBe(true);
  });
});

describe("refusals: nothing moves (09 Transfer; decided items 4 and 9)", () => {
  async function unchanged(documentId: string, a: string) {
    expect((await documentOf(documentId)).status).toBe("IN_TRANSIT");
    expect(await balanceOf(receiver.id, a)).toEqual({ qty: "4.000", avg_cost: "3000" });
    expect(await balanceOf(sender.id, a)).toEqual({ qty: "10.000", avg_cost: "5000" });
    expect(await writeOffsOf(sender.id)).toEqual([]);
    expect(await linesOf(documentId)).toEqual([
      { variant_id: a, qty: "10.000", received_qty: null },
    ]);
  }

  it("a second receipt is wrong_status and nothing moves twice", async () => {
    const a = await inStock("20");
    const made = await sent([{ variantId: a, qty: "10" }]);
    const input = receiveInput(made.documentId, [
      { lineId: made.lineOf.get(a)!, receivedQty: "8" },
    ]);
    const first = await runAction(receiveTransfer, receivingManager.id, input);
    expect(first.ok).toBe(true);
    const second = await runAction(receiveTransfer, receivingManager.id, input);
    expect(second).toMatchObject({ ok: false, error: { code: "wrong_status" } });
    expect(await balanceOf(receiver.id, a)).toEqual({ qty: "12.000", avg_cost: "4333" });
    expect(await balanceOf(sender.id, a)).toEqual({ qty: "12.000", avg_cost: "5000" });
    expect(await writeOffsOf(sender.id)).toHaveLength(1);
  });

  it("more than was sent is aboveSent, by the smallest step", async () => {
    const a = await inStock("20", true);
    const made = await sent([{ variantId: a, qty: "10" }]);
    const lineId = made.lineOf.get(a)!;
    const result = await runAction(
      receiveTransfer,
      receivingManager.id,
      receiveInput(made.documentId, [{ lineId, receivedQty: "10.001" }]),
    );
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        fields: { [`lines.${lineId}.receivedQty`]: "errors.field.aboveSent" },
      },
    });
    await unchanged(made.documentId, a);
  });

  it("half a piece on a whole measure is wholeOnly (edge case 'Half a piece')", async () => {
    const a = await inStock("20");
    const made = await sent([{ variantId: a, qty: "10" }]);
    const lineId = made.lineOf.get(a)!;
    const result = await runAction(
      receiveTransfer,
      receivingManager.id,
      receiveInput(made.documentId, [{ lineId, receivedQty: "7.5" }]),
    );
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        fields: { [`lines.${lineId}.receivedQty`]: "errors.field.wholeOnly" },
      },
    });
    await unchanged(made.documentId, a);
  });

  it("a line missing, or a line of another transfer of the same branches, is refused", async () => {
    const a = await inStock("20");
    const b = await inStock("20");
    const made = await sent([
      { variantId: a, qty: "10" },
      { variantId: b, qty: "10" },
    ]);
    const other = await sent([{ variantId: a, qty: "1" }]);
    const missing = await runAction(
      receiveTransfer,
      receivingManager.id,
      receiveInput(made.documentId, [{ lineId: made.lineOf.get(a)!, receivedQty: "10" }]),
    );
    expect(missing).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { lines: "errors.field.notAllowed" } },
    });
    const foreign = await runAction(
      receiveTransfer,
      receivingManager.id,
      receiveInput(made.documentId, [
        { lineId: made.lineOf.get(a)!, receivedQty: "10" },
        { lineId: other.lineOf.get(a)!, receivedQty: "1" },
      ]),
    );
    expect(foreign).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { lines: "errors.field.notAllowed" } },
    });
    expect((await documentOf(made.documentId)).status).toBe("IN_TRANSIT");
    expect((await documentOf(other.documentId)).status).toBe("IN_TRANSIT");
    expect(await writeOffsOf(sender.id)).toEqual([]);
  });

  it("a document that is not a transfer is Not found, even to the Head", async () => {
    const a = await inStock("20");
    const department = await insertDepartment(sender.id);
    const issue = await postDocument({
      type: "ISSUE",
      branchId: sender.id,
      departmentId: department.id,
      createdBy: sendingManager.id,
      lines: [{ variantId: a, qty: "1" }],
    });
    const result = await runAction(
      receiveTransfer,
      head.id,
      receiveInput(issue.documentId, [{ lineId: issue.lineIds[0]!, receivedQty: "1" }]),
    );
    expect(result).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});

describe("the decision of a 'Lost in transfer' write-off (10 Notifications: the decision goes back to the Manager; review of the plan, correction 1)", () => {
  it("a receiving Manager outside the sending branch is told nothing when the Head approves or refuses", async () => {
    for (const outcome of ["APPROVE", "REFUSE"] as const) {
      const a = await inStock("20");
      const made = await sent([{ variantId: a, qty: "10" }]);
      const result = await runAction(
        receiveTransfer,
        receivingManager.id,
        receiveInput(made.documentId, [{ lineId: made.lineOf.get(a)!, receivedQty: "8" }]),
      );
      if (!result.ok) throw new Error(`fixture: ${result.error.code}`);
      const decided = await runAction(decideWriteOff, head.id, {
        documentId: result.data.writeOff!.documentId,
        outcome,
      });
      expect(decided.ok).toBe(true);
    }
    expect(await noticesOf(receivingManager.id)).toEqual([]);
  });

  it("a Manager of both branches who received is told, as a sending-branch Manager's own write-off is", async () => {
    const both = await insertUser("MANAGER", { branches: [sender.id, receiver.id] });
    const a = await inStock("20");
    const made = await sent([{ variantId: a, qty: "10" }]);
    const result = await runAction(
      receiveTransfer,
      both.id,
      receiveInput(made.documentId, [{ lineId: made.lineOf.get(a)!, receivedQty: "8" }]),
    );
    if (!result.ok) throw new Error(`fixture: ${result.error.code}`);
    const decided = await runAction(decideWriteOff, head.id, {
      documentId: result.data.writeOff!.documentId,
      outcome: "APPROVE",
    });
    expect(decided.ok).toBe(true);
    expect(await noticesOf(both.id)).toEqual([
      expect.objectContaining({ type: "STOCK_CHANGE_DECIDED" }),
    ]);
  });
});

describe("reverse of a received transfer (Decided ahead, question 19; plan of 7.2, decided item 5)", () => {
  it("the Head undoes every movement in its own branch: the sender gets 10 back less the 2 that came back, the receiver loses 8", async () => {
    const a = await inStock("20");
    const made = await sent([{ variantId: a, qty: "10" }]);
    const received = await runAction(
      receiveTransfer,
      receivingManager.id,
      receiveInput(made.documentId, [{ lineId: made.lineOf.get(a)!, receivedQty: "8" }]),
    );
    if (!received.ok) throw new Error(`fixture: ${received.error.code}`);
    const reversed = await runAction(reverseStockDocument, head.id, {
      documentId: made.documentId,
      reason: "Sinov: noto'g'ri filial",
    });
    expect(reversed.ok).toBe(true);
    expect(await balanceOf(sender.id, a)).toEqual({ qty: "20.000", avg_cost: "5000" });
    // Back to 4; the average 2 999, not 3 000: 12 at 4 333 less 8 at 5 000, each average rounded
    // half up to whole so'm once (09 Stock value; plan of 5.1, decided item 2).
    expect(await balanceOf(receiver.id, a)).toEqual({ qty: "4.000", avg_cost: "2999" });
    expect((await documentOf(made.documentId)).status).toBe("REVERSED");
    // The write-off is a document of its own and still waits.
    expect((await writeOffsOf(sender.id))[0]!.status).toBe("PENDING_APPROVAL");
  });

  it("the sending and the receiving Manager may not reverse it", async () => {
    const a = await inStock("20");
    const made = await sent([{ variantId: a, qty: "10" }]);
    const received = await runAction(
      receiveTransfer,
      receivingManager.id,
      receiveInput(made.documentId, [{ lineId: made.lineOf.get(a)!, receivedQty: "10" }]),
    );
    if (!received.ok) throw new Error(`fixture: ${received.error.code}`);
    const bySender = await runAction(reverseStockDocument, sendingManager.id, {
      documentId: made.documentId,
      reason: "Sinov sababi",
    });
    expect(bySender).toMatchObject({ ok: false, error: { code: "forbidden" } });
    const byReceiver = await runAction(reverseStockDocument, receivingManager.id, {
      documentId: made.documentId,
      reason: "Sinov sababi",
    });
    expect(byReceiver).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect((await documentOf(made.documentId)).status).toBe("RECEIVED");
  });

  it("the receiver issued some: the reverse is refused naming the line and what is left", async () => {
    const a = await inStock("20");
    const made = await sent([{ variantId: a, qty: "10" }]);
    const received = await runAction(
      receiveTransfer,
      receivingManager.id,
      receiveInput(made.documentId, [{ lineId: made.lineOf.get(a)!, receivedQty: "10" }]),
    );
    if (!received.ok) throw new Error(`fixture: ${received.error.code}`);
    const department = await insertDepartment(receiver.id);
    await postDocument({
      type: "ISSUE",
      branchId: receiver.id,
      departmentId: department.id,
      createdBy: receivingManager.id,
      lines: [{ variantId: a, qty: "13" }],
    });
    const lineId = made.lineOf.get(a)!;
    const reversed = await runAction(reverseStockDocument, head.id, {
      documentId: made.documentId,
      reason: "Sinov sababi",
    });
    expect(reversed).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        fields: { [`lines.${lineId}.qty`]: "errors.field.reverseStockShort" },
        available: { [`lines.${lineId}.qty`]: "1" },
      },
    });
    expect((await documentOf(made.documentId)).status).toBe("RECEIVED");
  });
});

describe("stock_document_lines_received_qty_sent_check (CLAUDE.md rule 5; review of the plan, correction 2)", () => {
  it("refuses a received quantity above the line's, written straight into the database", async () => {
    const a = await inStock("20");
    const made = await sent([{ variantId: a, qty: "10" }]);
    expect(
      await refusalOf(
        db.execute(
          sql`update stock_document_lines set received_qty = 10.001
            where id = ${made.lineOf.get(a)!}`,
        ),
      ),
    ).toMatchObject({ code: "23514", constraint: "stock_document_lines_received_qty_sent_check" });
    await db.execute(
      sql`update stock_document_lines set received_qty = 10 where id = ${made.lineOf.get(a)!}`,
    );
    expect((await linesOf(made.documentId))[0]!.received_qty).toBe("10.000");
  });
});
