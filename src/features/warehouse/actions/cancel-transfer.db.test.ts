import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import type { MovementType } from "@/domain/stock";
import { stockMismatch } from "@/domain/stock-check";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { advanceClock, setClock } from "../../../../tests/helpers/clock";
import { insertItem } from "../../../../tests/helpers/orders";
import { receive, sendTransferDocument } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { cancelTransfer } from "./cancel-transfer";
import { receiveTransfer } from "./receive-transfer";

// Cancel a transfer In transit (build plan 7.4c; plan of 7.4c, Tests). Spec: 09-warehouse.md
// (Other documents, Transfer: "Until then the sender or the Head can cancel the transfer with a
// reason, and the stock goes back to the sender at the cost it left with"; Stock value); 10
// Notifications ("Transfer cancelled | Managers of the receiving branch"). Every fixture is
// asserted (D38); the receiver holds stock of the same subtype, so a movement in the wrong branch
// shows (D40).

const AT = "2031-05-03T06:00:00Z";
const REASON = "Yuk mashinasi kelmadi";

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
  const found = await db.execute<{
    id: string;
    type: string;
    qty_delta: string;
    unit_cost: string;
    reverses_movement_id: string | null;
  }>(sql`
    select id, type, qty_delta::text as qty_delta, unit_cost::text as unit_cost,
      reverses_movement_id
    from stock_movements
    where branch_id = ${branchId} and variant_id = ${variantId} order by seq`);
  return found.rows;
}

async function documentOf(id: string) {
  const found = await db.execute<{
    status: string;
    decided_by: string | null;
    decided_at: string | null;
    decision_reason: string | null;
    reversed_by: string | null;
  }>(sql`
    select status, decided_by, to_char(decided_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as decided_at,
      decision_reason, reversed_by
    from stock_documents where id = ${id}`);
  return found.rows[0]!;
}

async function noticesOf(userId: string) {
  const found = await db.execute<{ type: string; params: Record<string, unknown>; link: string }>(
    sql`select type, params, link from notifications where user_id = ${userId}
      and type = 'TRANSFER_CANCELLED'`,
  );
  return found.rows;
}

/** 50 chairs at the sender at 120 000, 4 at the receiver at 3 000; 20 sent. */
async function chairsSent() {
  const { variantId } = await insertItem();
  await receive(sender.id, variantId, "50", 120_000n, manager.id);
  await receive(receiver.id, variantId, "4", 3_000n, manager.id);
  const sent = await sendTransferDocument({
    branchId: sender.id,
    toBranchId: receiver.id,
    createdBy: manager.id,
    lines: [{ variantId, qty: "20" }],
  });
  expect(await balanceOf(sender.id, variantId)).toEqual({ qty: "30.000", avg_cost: "120000" });
  expect(await balanceOf(receiver.id, variantId)).toEqual({ qty: "4.000", avg_cost: "3000" });
  return { variantId, ...sent };
}

describe("cancelTransfer (09 Other documents, Transfer: the stock goes back to the sender at the cost it left with)", () => {
  it("puts 20 chairs back at the sender at their cost, after 10 more came in at 150 000 (Done when)", async () => {
    const { variantId, documentId, number } = await chairsSent();
    await receive(sender.id, variantId, "10", 150_000n, manager.id);
    expect(await balanceOf(sender.id, variantId)).toEqual({ qty: "40.000", avg_cost: "127500" });
    const receiverMoves = await movementsOf(receiver.id, variantId);

    advanceClock({ minutes: 1 });
    const result = await runAction(cancelTransfer, manager.id, {
      documentId,
      reason: `  ${REASON} `,
    });
    expect(result).toEqual({ ok: true, data: { documentId, number } });

    // 60 chairs worth 7 500 000: 50 × 120 000 + 10 × 150 000, as if the transfer never left.
    expect(await balanceOf(sender.id, variantId)).toEqual({ qty: "60.000", avg_cost: "125000" });
    const moves = await movementsOf(sender.id, variantId);
    const out = moves.find((move) => move.type === "TRANSFER_OUT")!;
    expect(moves.at(-1)).toEqual({
      id: expect.any(String),
      type: "REVERSAL",
      qty_delta: "20.000",
      unit_cost: "120000",
      reverses_movement_id: out.id,
    });
    // The nightly check's replay agrees with the balance (14 Notes for the build).
    expect(
      stockMismatch(
        moves.map((move) => ({
          type: move.type as MovementType,
          qtyDelta: move.qty_delta,
          unitCost: BigInt(move.unit_cost),
        })),
        { qty: "60.000", avgCost: 125_000n },
      ),
    ).toBeNull();
    // Nothing at the receiver.
    expect(await movementsOf(receiver.id, variantId)).toEqual(receiverMoves);
    expect(await documentOf(documentId)).toEqual({
      status: "CANCELLED",
      decided_by: manager.id,
      decided_at: "2031-05-03T06:01:00Z",
      decision_reason: REASON,
      reversed_by: null,
    });
  });

  it("a later receive is refused and writes nothing at the receiver (09 Transfer; decided item 2)", async () => {
    const { variantId, documentId, lineIds } = await chairsSent();
    const head = await insertUser("HEAD");
    expect((await runAction(cancelTransfer, head.id, { documentId, reason: REASON })).ok).toBe(
      true,
    );
    const receiverMoves = await movementsOf(receiver.id, variantId);
    const receiving = await insertUser("MANAGER", { branches: [receiver.id] });

    const received = await runAction(receiveTransfer, receiving.id, {
      documentId,
      receivedByName: null,
      lines: [{ lineId: lineIds[0]!, receivedQty: "20" }],
    });
    expect(received).toMatchObject({ ok: false, error: { code: "wrong_status" } });
    expect(await movementsOf(receiver.id, variantId)).toEqual(receiverMoves);
    expect(await balanceOf(sender.id, variantId)).toEqual({ qty: "50.000", avg_cost: "120000" });
    expect((await documentOf(documentId)).status).toBe("CANCELLED");
  });

  it("a second cancel and a cancel of a received transfer are wrong_status; nothing moves twice", async () => {
    const { variantId, documentId } = await chairsSent();
    expect((await runAction(cancelTransfer, manager.id, { documentId, reason: REASON })).ok).toBe(
      true,
    );
    const again = await runAction(cancelTransfer, manager.id, { documentId, reason: REASON });
    expect(again).toMatchObject({ ok: false, error: { code: "wrong_status" } });
    expect(await balanceOf(sender.id, variantId)).toEqual({ qty: "50.000", avg_cost: "120000" });

    const other = await sendTransferDocument({
      branchId: sender.id,
      toBranchId: receiver.id,
      createdBy: manager.id,
      lines: [{ variantId, qty: "5" }],
    });
    const receiving = await insertUser("MANAGER", { branches: [receiver.id] });
    expect(
      (
        await runAction(receiveTransfer, receiving.id, {
          documentId: other.documentId,
          receivedByName: null,
          lines: [{ lineId: other.lineIds[0]!, receivedQty: "5" }],
        })
      ).ok,
    ).toBe(true);
    const late = await runAction(cancelTransfer, manager.id, {
      documentId: other.documentId,
      reason: REASON,
    });
    expect(late).toMatchObject({ ok: false, error: { code: "wrong_status" } });
    expect(await balanceOf(sender.id, variantId)).toEqual({ qty: "45.000", avg_cost: "120000" });
    expect((await documentOf(other.documentId)).status).toBe("RECEIVED");
  });

  it("a reason of 4 or 501 characters, or none, is refused and nothing moves (decided item 7)", async () => {
    const { variantId, documentId } = await chairsSent();
    for (const [reason, kind] of [
      ["", "errors.field.required"],
      ["abcd", "errors.field.tooShort"],
      ["a".repeat(501), "errors.field.tooLong"],
    ] as const) {
      const result = await runAction(cancelTransfer, manager.id, { documentId, reason });
      expect(result).toMatchObject({
        ok: false,
        error: { code: "invalid_input", fields: { reason: kind } },
      });
    }
    expect(await balanceOf(sender.id, variantId)).toEqual({ qty: "30.000", avg_cost: "120000" });
    expect((await documentOf(documentId)).status).toBe("IN_TRANSIT");
    // 5 is enough.
    expect((await runAction(cancelTransfer, manager.id, { documentId, reason: "abcde" })).ok).toBe(
      true,
    );
  });

  it("a document of another type is Not found, even to the Head", async () => {
    const { variantId } = await chairsSent();
    const head = await insertUser("HEAD");
    const found = await db.execute<{ id: string }>(sql`
      select id from stock_documents where branch_id = ${sender.id} and type = 'TRANSFER'`);
    await db.execute(sql`
      update stock_documents set status = 'RECEIVED' where id = ${found.rows[0]!.id}`);
    // A write-off of the sender, waiting.
    const writeOff = await db.execute<{ id: string }>(sql`
      insert into stock_documents (number, type, branch_id, doc_date, status, reason, comment,
        client_key, created_by, created_at)
      values (${`WOF-${sender.code}-31-0001`}, 'WRITE_OFF', ${sender.id}, '2031-05-03',
        'PENDING_APPROVAL', 'DAMAGED', 'Sinov', gen_random_uuid(), ${manager.id}, now())
      returning id`);
    const result = await runAction(cancelTransfer, head.id, {
      documentId: writeOff.rows[0]!.id,
      reason: REASON,
    });
    expect(result).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await balanceOf(sender.id, variantId)).toEqual({ qty: "30.000", avg_cost: "120000" });
  });
});

describe("the notice (10 Notifications: 'Transfer cancelled | Managers of the receiving branch'; decided item 6)", () => {
  it("tells every active Manager of the receiving branch, whatever their rights, and nobody else", async () => {
    const { documentId, number } = await chairsSent();
    const there = await insertUser("MANAGER", { branches: [receiver.id] });
    const rightsOff = await insertUser("MANAGER", { branches: [receiver.id] });
    await setManagerRight(rightsOff.id, "TRANSFER_STOCK", false);
    const inactive = await insertUser("MANAGER", { branches: [receiver.id], isActive: false });
    const head = await insertUser("HEAD");
    const senderColleague = await insertUser("MANAGER", { branches: [sender.id] });
    const third = await insertUser("MANAGER", { branches: [(await insertBranch()).id] });

    expect((await runAction(cancelTransfer, manager.id, { documentId, reason: REASON })).ok).toBe(
      true,
    );

    const notice = {
      type: "TRANSFER_CANCELLED",
      params: { actor: manager.fullName, number, branch: sender.code },
      link: `/warehouse/documents/${documentId}`,
    };
    expect(await noticesOf(there.id)).toEqual([notice]);
    expect(await noticesOf(rightsOff.id)).toEqual([notice]);
    for (const user of [inactive, head, senderColleague, third, manager]) {
      expect(await noticesOf(user.id)).toEqual([]);
    }
  });
});
