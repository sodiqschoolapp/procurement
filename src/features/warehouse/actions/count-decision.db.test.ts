import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { postMovement } from "@/server/stock-ledger";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertItem } from "../../../../tests/helpers/orders";
import { receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { getStockDocument } from "../queries/document";
import { getReversePreview } from "../queries/reverse-preview";
import { saveCountedQuantities, startCount } from "./count";
import { decideCount } from "./count-decision";
import { reverseStockDocument } from "./reverse";

// The Head's decision on a stock count (build plan 7.4, Done when; plan of 7.4, Tests). Spec:
// 09-warehouse.md (Movement types: "Correction after a stock count | Up or down | Manager asks |
// Head"; Other documents, Stock count: "the Head approves them as corrections. If an item moved
// between the start of the count and the approval, the system asks the Manager to count that item
// again"; Stock value); 03 Permission matrix "Approve a write-off or stock correction"; 10
// Notifications ("Write-off or correction asked … the decision goes back to the Manager");
// developer-rules.md rules 2 and 3. Every fixture is asserted (D38); every pass carries the data a
// wrong guard would catch (D40).

const STARTED = "2031-05-03T06:00:00Z";
const DECIDED = "2031-05-04T09:30:00Z";

let branch: { id: string; code: string };
let other: { id: string; code: string };
let manager: { id: string };
let head: { id: string };

beforeEach(async () => {
  setClock(STARTED);
  branch = await insertBranch();
  other = await insertBranch();
  manager = await insertUser("MANAGER", { branches: [branch.id] });
  head = await insertUser("HEAD");
});

async function balanceOf(branchId: string, variantId: string) {
  const found = await db.execute<{ qty: string; avg_cost: string }>(sql`
    select qty::text as qty, avg_cost::text as avg_cost from stock_balances
    where branch_id = ${branchId} and variant_id = ${variantId}`);
  return found.rows[0];
}

async function documentOf(id: string) {
  const found = await db.execute<{
    status: string;
    decided_by: string | null;
    decided_at: string | null;
  }>(sql`
    select status, decided_by,
      to_char(decided_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as decided_at
    from stock_documents where id = ${id}`);
  return found.rows[0]!;
}

async function movementsOf(id: string) {
  const found = await db.execute<{
    type: string;
    document_line_id: string;
    qty_delta: string;
    unit_cost: string;
    balance_after: string;
    created_by: string;
  }>(sql`
    select m.type, m.document_line_id, m.qty_delta::text as qty_delta,
      m.unit_cost::text as unit_cost, m.balance_after::text as balance_after, m.created_by
    from stock_movements m join stock_document_lines l on l.id = m.document_line_id
    where l.document_id = ${id} order by m.seq`);
  return found.rows;
}

type LineRow = {
  id: string;
  variant_id: string;
  qty: string;
  counted_qty: string | null;
  start_seq: string | null;
  recount: boolean;
};

async function linesOf(documentId: string): Promise<LineRow[]> {
  const found = await db.execute<LineRow>(sql`
    select id, variant_id, qty::text as qty, counted_qty::text as counted_qty,
      start_seq::text as start_seq, recount
    from stock_document_lines where document_id = ${documentId} order by variant_id`);
  return found.rows;
}

function lineOf(lines: LineRow[], variantId: string): LineRow {
  return lines.find((line) => line.variant_id === variantId)!;
}

async function lastSeq(branchId: string, variantId: string): Promise<string> {
  const found = await db.execute<{ seq: string }>(sql`
    select max(seq)::text as seq from stock_movements
    where branch_id = ${branchId} and variant_id = ${variantId}`);
  return found.rows[0]!.seq;
}

/** A goods item with `qty` in the branch at 1 000 so'm; 10 of it in the other branch too. */
async function inStock(qty: string) {
  const item = await insertItem();
  await receive(branch.id, item.variantId, qty, 1000n, manager.id);
  await receive(other.id, item.variantId, "10", 1000n, manager.id);
  return item.variantId;
}

/** An issue of `qty` in a branch, straight through the ledger (the issue's movement). */
async function issue(branchId: string, variantId: string, qty: string) {
  await db.transaction((tx) =>
    postMovement(tx, {
      branchId,
      variantId,
      type: "ISSUE",
      qtyDelta: `-${qty}`,
      unitCost: null,
      createdBy: manager.id,
    }),
  );
}

/** The Manager's count of the whole branch; asserted (D38). */
async function started() {
  setClock(STARTED);
  const result = await runAction(startCount, manager.id, {
    clientKey: randomUUID(),
    branchId: branch.id,
    categoryId: null,
    comment: null,
  });
  if (!result.ok) throw new Error(`fixture: ${result.error.code}`);
  return result.data;
}

/** Types the counted quantity of each item; asserted (D38). */
async function counted(documentId: string, quantities: Record<string, string | null>) {
  const lines = await linesOf(documentId);
  const result = await runAction(saveCountedQuantities, manager.id, {
    documentId,
    lines: Object.entries(quantities).map(([variantId, countedQty]) => ({
      lineId: lineOf(lines, variantId).id,
      countedQty,
    })),
  });
  if (!result.ok) throw new Error(`fixture: ${result.error.code}`);
  return result.data;
}

/** What the Head is shown on the count's page: every line with its counted quantity. */
async function seenOf(documentId: string) {
  return (await linesOf(documentId)).map((line) => ({
    lineId: line.id,
    countedQty: line.counted_qty ?? "",
  }));
}

async function approve(documentId: string, userId = head.id) {
  setClock(DECIDED);
  return runAction(decideCount, userId, {
    documentId,
    outcome: "APPROVE",
    seen: await seenOf(documentId),
  });
}

describe("decideCount: approve writes Correction movements (Done when 1)", () => {
  it("one CORRECTION per line whose difference is not 0, down and up, at the average; the stock after is the counted quantity; POSTED with who and when", async () => {
    const down = await inStock("10");
    const up = await inStock("4");
    const same = await inStock("6");
    const count = await started();
    await counted(count.documentId, { [down]: "8", [up]: "5", [same]: "6" });

    const result = await approve(count.documentId);
    expect(result).toEqual({
      ok: true,
      data: { documentId: count.documentId, number: count.number, outcome: "APPROVE", recount: 0 },
    });
    expect(await documentOf(count.documentId)).toEqual({
      status: "POSTED",
      decided_by: head.id,
      decided_at: DECIDED,
    });
    const lines = await linesOf(count.documentId);
    // A count mixing 0 and non-0 lines: each CORRECTION points at its own line (plan review,
    // should fix 2); the line of difference 0 writes none.
    expect(await movementsOf(count.documentId)).toEqual(
      expect.arrayContaining([
        {
          type: "CORRECTION",
          document_line_id: lineOf(lines, down).id,
          qty_delta: "-2.000",
          unit_cost: "1000",
          balance_after: "8.000",
          created_by: head.id,
        },
        {
          type: "CORRECTION",
          document_line_id: lineOf(lines, up).id,
          qty_delta: "1.000",
          unit_cost: "1000",
          balance_after: "5.000",
          created_by: head.id,
        },
      ]),
    );
    expect(await movementsOf(count.documentId)).toHaveLength(2);
    expect(await balanceOf(branch.id, down)).toEqual({ qty: "8.000", avg_cost: "1000" });
    expect(await balanceOf(branch.id, up)).toEqual({ qty: "5.000", avg_cost: "1000" });
    expect(await balanceOf(branch.id, same)).toEqual({ qty: "6.000", avg_cost: "1000" });
    // The other branch's stock of the same items is untouched.
    expect((await balanceOf(other.id, down))?.qty).toBe("10.000");
  });

  it("does not flag what did not move after the start (D40): another branch's movement of the item, and the start's own newest movement (seq = start_seq)", async () => {
    const item = await inStock("10");
    const count = await started();
    const lines = await linesOf(count.documentId);
    // The start's own newest movement is the line's start_seq: not a movement after the start.
    expect(lineOf(lines, item).start_seq).toBe(await lastSeq(branch.id, item));
    await counted(count.documentId, { [item]: "9" });
    await issue(other.id, item, "2");

    const result = await approve(count.documentId);
    expect(result.ok && result.data.outcome).toBe("APPROVE");
    expect(await balanceOf(branch.id, item)).toEqual({ qty: "9.000", avg_cost: "1000" });
  });

  it("another item's movement in the branch flags that item only (D40: by subtype)", async () => {
    const still = await inStock("10");
    const moved = await inStock("5");
    const count = await started();
    await counted(count.documentId, { [still]: "9", [moved]: "5" });
    await issue(branch.id, moved, "1");

    const result = await approve(count.documentId);
    expect(result.ok && result.data).toMatchObject({ outcome: "RECOUNT", recount: 1 });
    const lines = await linesOf(count.documentId);
    expect(lineOf(lines, still)).toMatchObject({ counted_qty: "9.000", recount: false });
    expect(lineOf(lines, moved)).toMatchObject({ qty: "4.000", counted_qty: null, recount: true });
  });
});

describe("decideCount: an item moved during the count (Done when 2)", () => {
  it("an item issued during the count is not corrected and is flagged; nothing of the count posts and it goes back to the Manager", async () => {
    const issued = await inStock("10");
    const kept = await inStock("4");
    const count = await started();
    await counted(count.documentId, { [issued]: "9", [kept]: "3" });
    await issue(branch.id, issued, "3"); // 7 left, after the start

    const result = await approve(count.documentId);
    expect(result).toEqual({
      ok: true,
      data: { documentId: count.documentId, number: count.number, outcome: "RECOUNT", recount: 1 },
    });
    expect(await movementsOf(count.documentId)).toEqual([]);
    expect(await documentOf(count.documentId)).toEqual({
      status: "PENDING_APPROVAL",
      decided_by: null,
      decided_at: null,
    });
    expect(await balanceOf(branch.id, issued)).toEqual({ qty: "7.000", avg_cost: "1000" });
    expect(await balanceOf(branch.id, kept)).toEqual({ qty: "4.000", avg_cost: "1000" });
    const lines = await linesOf(count.documentId);
    expect(lineOf(lines, issued)).toMatchObject({
      qty: "7.000",
      counted_qty: null,
      start_seq: await lastSeq(branch.id, issued),
      recount: true,
    });
    expect(lineOf(lines, kept)).toMatchObject({
      qty: "4.000",
      counted_qty: "3.000",
      recount: false,
    });

    const told = await db.execute<{ user_id: string; params: unknown }>(sql`
      select user_id, params from notifications
      where type = 'STOCK_CHANGE_DECIDED' and link = ${`/warehouse/documents/${count.documentId}`}`);
    expect(told.rows).toEqual([
      {
        user_id: manager.id,
        params: { number: count.number, branch: branch.code, kind: "COUNT", outcome: "recount" },
      },
    ]);
  });

  it("after the item is counted again, the approval posts against the new start", async () => {
    const issued = await inStock("10");
    const count = await started();
    await counted(count.documentId, { [issued]: "9" });
    await issue(branch.id, issued, "3");
    const first = await approve(count.documentId);
    expect(first.ok && first.data.outcome).toBe("RECOUNT");

    await counted(count.documentId, { [issued]: "6" });
    const second = await approve(count.documentId);
    expect(second.ok && second.data.outcome).toBe("APPROVE");
    expect((await movementsOf(count.documentId)).map((m) => m.qty_delta)).toEqual(["-1.000"]);
    expect(await balanceOf(branch.id, issued)).toEqual({ qty: "6.000", avg_cost: "1000" });
  });
});

describe("decideCount: refusals (developer-rules rule 2 and 3)", () => {
  it("refuse: REJECTED with who and when, no stock moves, the starter is told; allowed on an incomplete count (decided item 6)", async () => {
    const item = await inStock("10");
    const second = await inStock("2");
    const count = await started();
    await counted(count.documentId, { [item]: "8" });
    setClock(DECIDED);
    const result = await runAction(decideCount, head.id, {
      documentId: count.documentId,
      outcome: "REFUSE",
    });
    expect(result).toEqual({
      ok: true,
      data: { documentId: count.documentId, number: count.number, outcome: "REFUSE", recount: 0 },
    });
    expect(await documentOf(count.documentId)).toEqual({
      status: "REJECTED",
      decided_by: head.id,
      decided_at: DECIDED,
    });
    expect(await movementsOf(count.documentId)).toEqual([]);
    expect((await balanceOf(branch.id, item))?.qty).toBe("10.000");
    expect((await balanceOf(branch.id, second))?.qty).toBe("2.000");
    const told = await db.execute<{ params: { outcome: string } }>(sql`
      select params from notifications
      where type = 'STOCK_CHANGE_DECIDED' and user_id = ${manager.id}`);
    expect(told.rows.map((row) => row.params.outcome)).toEqual(["refused"]);
  });

  it("approve of an incomplete count is wrong_status; nothing moves", async () => {
    const item = await inStock("10");
    const second = await inStock("2");
    const count = await started();
    await counted(count.documentId, { [item]: "8" });
    const result = await approve(count.documentId);
    expect(result.ok ? null : result.error.code).toBe("wrong_status");
    expect(await movementsOf(count.documentId)).toEqual([]);
    expect((await balanceOf(branch.id, second))?.qty).toBe("2.000");
  });

  it("a second decision is wrong_status, and so is typing after it", async () => {
    const item = await inStock("10");
    const count = await started();
    await counted(count.documentId, { [item]: "8" });
    expect((await approve(count.documentId)).ok).toBe(true);
    const again = await runAction(decideCount, head.id, {
      documentId: count.documentId,
      outcome: "REFUSE",
    });
    expect(again.ok ? null : again.error.code).toBe("wrong_status");
    const lines = await linesOf(count.documentId);
    const typed = await runAction(saveCountedQuantities, manager.id, {
      documentId: count.documentId,
      lines: [{ lineId: lines[0]!.id, countedQty: "1" }],
    });
    expect(typed.ok ? null : typed.error.code).toBe("wrong_status");
    expect(await movementsOf(count.documentId)).toHaveLength(1);
  });

  it("a save that lands between the Head's read and the approval: conflict, no CORRECTION written (plan review, must fix 1)", async () => {
    const item = await inStock("10");
    const count = await started();
    await counted(count.documentId, { [item]: "8" });
    const shown = await seenOf(count.documentId);
    await counted(count.documentId, { [item]: "7" });

    setClock(DECIDED);
    const result = await runAction(decideCount, head.id, {
      documentId: count.documentId,
      outcome: "APPROVE",
      seen: shown,
    });
    expect(result.ok ? null : result.error.code).toBe("conflict");
    expect(await movementsOf(count.documentId)).toEqual([]);
    expect((await documentOf(count.documentId)).status).toBe("PENDING_APPROVAL");
    expect((await balanceOf(branch.id, item))?.qty).toBe("10.000");
  });

  it("an approval without what was shown is conflict", async () => {
    const item = await inStock("10");
    const count = await started();
    await counted(count.documentId, { [item]: "8" });
    setClock(DECIDED);
    const result = await runAction(decideCount, head.id, {
      documentId: count.documentId,
      outcome: "APPROVE",
    });
    expect(result.ok ? null : result.error.code).toBe("conflict");
    expect(await movementsOf(count.documentId)).toEqual([]);
  });

  it("a write-off's id is Not found, even to the Head", async () => {
    const item = await inStock("10");
    const writeOff = await db.execute<{ id: string }>(sql`
      insert into stock_documents (number, type, branch_id, doc_date, status, reason, comment,
        client_key, created_by, created_at)
      values (${`WOF-${branch.code}-31-9001`}, 'WRITE_OFF', ${branch.id}, '2031-05-03',
        'PENDING_APPROVAL', 'DAMAGED', 'Sinov', ${randomUUID()}, ${manager.id}, ${STARTED})
      returning id`);
    await db.execute(sql`
      insert into stock_document_lines (document_id, variant_id, qty, created_at)
      values (${writeOff.rows[0]!.id}, ${item}, 1, ${STARTED})`);
    const result = await runAction(decideCount, head.id, {
      documentId: writeOff.rows[0]!.id,
      outcome: "APPROVE",
      seen: [],
    });
    expect(result.ok ? null : result.error.code).toBe("not_found");
    expect((await balanceOf(branch.id, item))?.qty).toBe("10.000");
  });
});

describe("decideCount: the decision goes back to the Manager (10 Notifications)", () => {
  it("an approval tells the count's starter, approved", async () => {
    const item = await inStock("10");
    const count = await started();
    await counted(count.documentId, { [item]: "8" });
    expect((await approve(count.documentId)).ok).toBe(true);
    const told = await db.execute<{ user_id: string; params: unknown }>(sql`
      select user_id, params from notifications
      where type = 'STOCK_CHANGE_DECIDED' and link = ${`/warehouse/documents/${count.documentId}`}`);
    expect(told.rows).toEqual([
      {
        user_id: manager.id,
        params: { number: count.number, branch: branch.code, kind: "COUNT", outcome: "approved" },
      },
    ]);
  });
});

describe("Reverse of an approved count (Decided ahead, question 19: the Head only; plan of 7.4, decided item 7)", () => {
  it("the Head reverses it: one REVERSAL per CORRECTION, the stock back to the start, the count REVERSED", async () => {
    const down = await inStock("10");
    const up = await inStock("4");
    const count = await started();
    await counted(count.documentId, { [down]: "7", [up]: "6" });
    expect((await approve(count.documentId)).ok).toBe(true);

    const preview = await getReversePreview(head.id, count.documentId);
    expect(preview.lines.map((line) => line.qty).sort()).toEqual(["-3", "2"]);
    const reversed = await runAction(reverseStockDocument, head.id, {
      documentId: count.documentId,
      reason: "Sanoqda xato (sinov)",
    });
    expect(reversed).toMatchObject({ ok: true });
    expect((await documentOf(count.documentId)).status).toBe("REVERSED");
    expect((await movementsOf(count.documentId)).map((m) => m.type)).toEqual([
      "CORRECTION",
      "CORRECTION",
      "REVERSAL",
      "REVERSAL",
    ]);
    expect((await balanceOf(branch.id, down))?.qty).toBe("10.000");
    expect((await balanceOf(branch.id, up))?.qty).toBe("4.000");
  });

  it("the Manager who started it, with RETURN_REVERSE on, is refused; the page offers it to the Head only", async () => {
    const item = await inStock("10");
    const count = await started();
    await counted(count.documentId, { [item]: "7" });
    expect((await approve(count.documentId)).ok).toBe(true);
    const refused = await runAction(reverseStockDocument, manager.id, {
      documentId: count.documentId,
      reason: "Sanoqda xato (sinov)",
    });
    expect(refused.ok ? null : refused.error.code).toBe("forbidden");
    await expect(getReversePreview(manager.id, count.documentId)).rejects.toMatchObject({
      kind: "forbidden",
    });
    expect((await getStockDocument(manager.id, count.documentId))?.canReverse).toBe(false);
    expect((await getStockDocument(head.id, count.documentId))?.canReverse).toBe(true);
    expect((await balanceOf(branch.id, item))?.qty).toBe("7.000");
  });

  it("a count with no differences moved nothing: Reverse is not offered (plan review, should fix 5)", async () => {
    const item = await inStock("10");
    const count = await started();
    await counted(count.documentId, { [item]: "10" });
    expect((await approve(count.documentId)).ok).toBe(true);
    expect((await documentOf(count.documentId)).status).toBe("POSTED");
    expect(await movementsOf(count.documentId)).toEqual([]);
    expect((await getStockDocument(head.id, count.documentId))?.canReverse).toBe(false);
  });
});

describe("the count's page offers what the actions allow (getStockDocument; plan of 7.4)", () => {
  it("the Head may refuse an incomplete count and approve a complete one; a Manager may neither; a sent-back line is marked", async () => {
    const item = await inStock("10");
    const second = await inStock("3");
    const count = await started();
    await counted(count.documentId, { [item]: "9" });
    const incomplete = await getStockDocument(head.id, count.documentId);
    expect(incomplete).toMatchObject({ canDecide: true, canApprove: false, countAsked: false });

    await counted(count.documentId, { [second]: "3" });
    expect(await getStockDocument(head.id, count.documentId)).toMatchObject({
      canDecide: true,
      canApprove: true,
      countAsked: true,
      countChanges: 1,
    });
    expect(await getStockDocument(manager.id, count.documentId)).toMatchObject({
      canDecide: false,
      canApprove: false,
      countAsked: true,
    });

    await issue(branch.id, second, "1");
    expect((await approve(count.documentId)).ok).toBe(true);
    const sentBack = await getStockDocument(manager.id, count.documentId);
    expect(sentBack?.countAsked).toBe(false);
    const lines = await linesOf(count.documentId);
    const marks = Object.fromEntries(sentBack!.lines.map((line) => [line.id, line.recount]));
    expect(marks).toEqual({
      [lineOf(lines, item).id]: false,
      [lineOf(lines, second).id]: true,
    });
  });
});
