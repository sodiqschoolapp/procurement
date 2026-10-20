import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { db } from "@/server/db/client";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertItem } from "../../../../tests/helpers/orders";
import { receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { type TransferInput, sendTransfer } from "./transfer";

// Send a transfer (build plan 7.1; plan of 7.1, Tests). Spec: 09-warehouse.md (Movement types:
// "Transfer to another branch | Down at the sender, up at the receiver"; Other documents,
// Transfer: "stock leaves the sender at once and the transfer shows 'In transit'"; Stock value:
// "transfers out use the average at that moment"); 10 Notifications ("Transfer sent | Managers of
// the receiving branch"); 03 Manager rights (TRANSFER_STOCK); edge-cases/warehouse.md ("Half a
// piece"); developer-rules.md rule 8. Every fixture is asserted (D38); the receiver holds stock
// of the same subtype beside every send, so a movement in the wrong branch shows (D40).

const AT = "2031-05-03T06:00:00Z";

let sender: { id: string; code: string };
let receiver: { id: string; code: string };
let manager: { id: string; fullName: string };

beforeEach(async () => {
  setClock(AT);
  sender = await insertBranch();
  receiver = await insertBranch();
  manager = await insertUser("MANAGER", { branches: [sender.id] });
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

async function documentCount(): Promise<number> {
  const found = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from stock_documents
      where branch_id in (${sender.id}, ${receiver.id})`,
  );
  return found.rows[0]!.n;
}

async function noticesOf(userId: string) {
  const found = await db.execute<{ type: string; params: Record<string, unknown>; link: string }>(
    sql`select type, params, link from notifications where user_id = ${userId}`,
  );
  return found.rows;
}

function transferInput(
  lines: TransferInput["lines"],
  change: Partial<TransferInput> = {},
): TransferInput {
  return {
    clientKey: randomUUID(),
    branchId: sender.id,
    toBranchId: receiver.id,
    docDate: "2031-05-03",
    receivedByName: null,
    comment: null,
    lines,
    ...change,
  };
}

/** A goods subtype: `qty` at the sender at 1 000 so'm, and 4 at the receiver at 3 000 so'm. */
async function inStock(qty: string, allowDecimal = false): Promise<string> {
  const { variantId } = await insertItem({ allowDecimal });
  await receive(sender.id, variantId, qty, 1000n, manager.id);
  await receive(receiver.id, variantId, "4", 3000n, manager.id);
  expect(await balanceOf(sender.id, variantId)).toEqual({
    qty: Number(qty).toFixed(3),
    avg_cost: "1000",
  });
  expect(await balanceOf(receiver.id, variantId)).toEqual({ qty: "4.000", avg_cost: "3000" });
  return variantId;
}

describe("sendTransfer (09 Other documents, Transfer: stock leaves the sender at once)", () => {
  it("lowers the sender's stock at once at its average and leaves the receiver's as it was (Done when)", async () => {
    const a = await inStock("25");
    const receiverMoves = await movementsOf(receiver.id, a);
    expect(receiverMoves).toHaveLength(1);

    const result = await runAction(
      sendTransfer,
      manager.id,
      transferInput([{ variantId: a, qty: "10" }]),
    );
    expect(result).toEqual({
      ok: true,
      data: { documentId: expect.any(String), number: `TRF-${sender.code}-31-0001` },
    });

    expect(await balanceOf(sender.id, a)).toEqual({ qty: "15.000", avg_cost: "1000" });
    expect((await movementsOf(sender.id, a)).at(-1)).toEqual({
      type: "TRANSFER_OUT",
      qty_delta: "-10.000",
      unit_cost: "1000",
    });
    // The receiver: quantity, average and movements exactly as before (09: up at the receiver
    // only when it is received, 7.2).
    expect(await balanceOf(receiver.id, a)).toEqual({ qty: "4.000", avg_cost: "3000" });
    expect(await movementsOf(receiver.id, a)).toEqual(receiverMoves);
  });

  it("saves the transfer In transit, of the sending branch, naming the receiver, typed receiver and comment (09 Transfer; 14 stock_documents)", async () => {
    const a = await inStock("5");
    const result = await runAction(
      sendTransfer,
      manager.id,
      transferInput([{ variantId: a, qty: "2" }], {
        receivedByName: "  Sinov   Haydovchi ",
        comment: "Sinov izohi",
      }),
    );
    expect(result.ok).toBe(true);
    const id = result.ok ? result.data.documentId : "";
    const document = await db.execute<Record<string, string | null>>(sql`
      select type, status, branch_id, to_branch_id, received_by_name, comment, created_by,
        department_id, reason, doc_date::text as doc_date
      from stock_documents where id = ${id}`);
    expect(document.rows[0]).toEqual({
      type: "TRANSFER",
      status: "IN_TRANSIT",
      branch_id: sender.id,
      to_branch_id: receiver.id,
      received_by_name: "Sinov Haydovchi",
      comment: "Sinov izohi",
      created_by: manager.id,
      department_id: null,
      reason: null,
      doc_date: "2031-05-03",
    });
    const lines = await db.execute<{ qty: string; unit_cost: string | null }>(sql`
      select qty::text as qty, unit_cost::text as unit_cost
      from stock_document_lines where document_id = ${id}`);
    // No cost on the line: its TRANSFER_OUT holds the sender's average (decided item 2).
    expect(lines.rows).toEqual([{ qty: "2.000", unit_cost: null }]);
  });

  it("refuses more than the stock under the lock, naming the amount left, and saves nothing (09 intro; Issue 1)", async () => {
    const a = await inStock("4");
    const b = await inStock("9");
    const over = await runAction(
      sendTransfer,
      manager.id,
      transferInput([
        { variantId: b, qty: "1" },
        { variantId: a, qty: "5" },
      ]),
    );
    expect(over).toEqual({
      ok: false,
      error: {
        code: "invalid_input",
        messageKey: "errors.invalidInput",
        fields: { "lines.1.qty": "errors.field.stockShort" },
        available: { "lines.1.qty": "4" },
      },
    });
    expect(await documentCount()).toBe(0);
    expect(await balanceOf(sender.id, b)).toEqual({ qty: "9.000", avg_cost: "1000" });
    const all = await runAction(
      sendTransfer,
      manager.id,
      transferInput([{ variantId: a, qty: "4" }]),
    );
    expect(all.ok).toBe(true);
    // The whole stock leaves: the average resets to 0 (decisions 3.1 item 4).
    expect(await balanceOf(sender.id, a)).toEqual({ qty: "0.000", avg_cost: "0" });
  });

  it("refuses the sender as the receiver, an unknown and an inactive receiving branch (decided item 1)", async () => {
    const a = await inStock("5");
    expect(
      await runAction(
        sendTransfer,
        manager.id,
        transferInput([{ variantId: a, qty: "1" }], { toBranchId: sender.id }),
      ),
    ).toMatchObject({ ok: false, error: { fields: { toBranchId: "errors.field.notAllowed" } } });
    expect(
      await runAction(
        sendTransfer,
        manager.id,
        transferInput([{ variantId: a, qty: "1" }], { toBranchId: randomUUID() }),
      ),
    ).toMatchObject({ ok: false, error: { fields: { toBranchId: "errors.field.notAllowed" } } });
    const closed = await insertBranch({ isActive: false });
    expect(
      await runAction(
        sendTransfer,
        manager.id,
        transferInput([{ variantId: a, qty: "1" }], { toBranchId: closed.id }),
      ),
    ).toMatchObject({
      ok: false,
      error: { fields: { toBranchId: "errors.field.branchInactive" } },
    });
    expect(await documentCount()).toBe(0);
    expect(await balanceOf(sender.id, a)).toEqual({ qty: "5.000", avg_cost: "1000" });
  });

  it("accepts a receiving branch the sender does not belong to (decided item 1, Look first)", async () => {
    const a = await inStock("5");
    const third = await insertBranch();
    const result = await runAction(
      sendTransfer,
      manager.id,
      transferInput([{ variantId: a, qty: "1" }], { toBranchId: third.id }),
    );
    expect(result.ok).toBe(true);
  });

  // An inactive subtype is sent up to the stock held since D55 (3): inactive-stock.db.test.ts.
  it('refuses half a piece, a service, an inactive sending branch and a future date (edge case "Half a piece"; decided item 10)', async () => {
    const a = await inStock("4");
    expect(
      await runAction(sendTransfer, manager.id, transferInput([{ variantId: a, qty: "1.5" }])),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { "lines.0.qty": expect.any(String) } },
    });

    expect(
      await runAction(
        sendTransfer,
        manager.id,
        transferInput([{ variantId: a, qty: "1" }], { docDate: "2031-05-04" }),
      ),
    ).toMatchObject({ ok: false, error: { fields: { docDate: "errors.field.inFuture" } } });

    const service = (await insertItem({ type: "SERVICE" })).variantId;
    expect(
      await runAction(sendTransfer, manager.id, transferInput([{ variantId: service, qty: "1" }])),
    ).toMatchObject({
      ok: false,
      error: { fields: { "lines.0.variantId": "errors.field.notAllowed" } },
    });

    const b = await inStock("4");
    await db.execute(sql`update branches set is_active = false where id = ${sender.id}`);
    expect(
      await runAction(sendTransfer, manager.id, transferInput([{ variantId: b, qty: "1" }])),
    ).toMatchObject({ ok: false, error: { fields: { branchId: "errors.field.branchInactive" } } });
    expect(await documentCount()).toBe(0);
  });

  it("returns the first result for the same browser id and sends once (developer-rules rule 8)", async () => {
    const a = await inStock("5");
    const input = transferInput([{ variantId: a, qty: "1" }]);
    const first = await runAction(sendTransfer, manager.id, input);
    const second = await runAction(sendTransfer, manager.id, input);
    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    expect(await documentCount()).toBe(1);
    expect(await balanceOf(sender.id, a)).toEqual({ qty: "4.000", avg_cost: "1000" });
  });

  it("answers Not found to a Manager of another branch who sends a known key with their own branch (rule 8; permission review of 2.13)", async () => {
    const a = await inStock("5");
    const input = transferInput([{ variantId: a, qty: "1" }]);
    const first = await runAction(sendTransfer, manager.id, input);
    expect(first.ok).toBe(true);
    const stranger = await insertUser("MANAGER", { branches: [receiver.id] });
    const again = await runAction(sendTransfer, stranger.id, {
      ...input,
      branchId: receiver.id,
      toBranchId: sender.id,
    });
    expect(again).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(JSON.stringify(again)).not.toContain(first.ok ? first.data.number : "");
    expect(await documentCount()).toBe(1);
  });
});

describe('sendTransfer tells the receiving Managers ("Transfer sent"; plan of 7.1, decided items 3 and 8)', () => {
  it("tells each active Manager of the receiving branch once, also one with TRANSFER_STOCK off; not the sender's, an inactive one, the Head or the actor", async () => {
    const a = await inStock("5");
    const there = await insertUser("MANAGER", { branches: [receiver.id] });
    const rightOff = await insertUser("MANAGER", { branches: [receiver.id] });
    await setManagerRight(rightOff.id, "TRANSFER_STOCK", false);
    const both = await insertUser("MANAGER", { branches: [sender.id, receiver.id] });
    const inactive = await insertUser("MANAGER", { branches: [receiver.id], isActive: false });
    const colleague = await insertUser("MANAGER", { branches: [sender.id] });
    const head = await insertUser("HEAD");
    const principal = await insertUser("PRINCIPAL", { branches: [receiver.id] });

    const result = await runAction(
      sendTransfer,
      manager.id,
      transferInput([{ variantId: a, qty: "1" }]),
    );
    expect(result.ok).toBe(true);
    const id = result.ok ? result.data.documentId : "";
    const notice = {
      type: "TRANSFER_SENT",
      params: {
        actor: manager.fullName,
        number: `TRF-${sender.code}-31-0001`,
        branch: sender.code,
      },
      link: `/warehouse/documents/${id}`,
    };
    for (const told of [there, rightOff, both]) expect(await noticesOf(told.id)).toEqual([notice]);
    for (const untold of [inactive, colleague, head, principal, manager]) {
      expect(await noticesOf(untold.id)).toEqual([]);
    }
  });

  it("sent by the Head, tells the receiving Managers and not the Head (10 Notifications)", async () => {
    const a = await inStock("5");
    const head = await insertUser("HEAD");
    const there = await insertUser("MANAGER", { branches: [receiver.id] });
    const result = await runAction(
      sendTransfer,
      head.id,
      transferInput([{ variantId: a, qty: "1" }]),
    );
    expect(result.ok).toBe(true);
    expect(await noticesOf(there.id)).toMatchObject([{ type: "TRANSFER_SENT" }]);
    expect(await noticesOf(head.id)).toEqual([]);
  });
});
