import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { countDifference } from "@/domain/stock-documents";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { createDocument } from "@/server/stock-documents";
import { postMovement } from "@/server/stock-ledger";

import { insertBranch, setManagerRight } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertItem } from "../../../../tests/helpers/orders";
import { receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import {
  type SaveCountedQuantitiesInput,
  type StartCountInput,
  saveCountedQuantities,
  startCount,
} from "./count";

// Stock counts (build plan 7.3; plan of 7.3, Tests). Spec: 09-warehouse.md (Other documents,
// Stock count: "The Manager starts a count for a branch or a category and types the counted
// quantities. The system shows the differences"; Movement types: "Correction after a stock count
// … Manager asks | Head", so nothing moves before 7.4); edge-cases/warehouse.md ("Half a piece");
// developer-rules.md rule 8. Every fixture is asserted (D38); every pass carries the data a wrong
// guard would let through (D40).

const AT = "2031-05-03T06:00:00Z";

let branch: { id: string; code: string };
let other: { id: string; code: string };
let manager: { id: string };

beforeEach(async () => {
  setClock(AT);
  branch = await insertBranch();
  other = await insertBranch();
  manager = await insertUser("MANAGER", { branches: [branch.id] });
});

async function balanceOf(branchId: string, variantId: string) {
  const found = await db.execute<{ qty: string; avg_cost: string }>(sql`
    select qty::text as qty, avg_cost::text as avg_cost from stock_balances
    where branch_id = ${branchId} and variant_id = ${variantId}`);
  return found.rows[0];
}

async function movementCount(branchId: string): Promise<number> {
  const found = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from stock_movements where branch_id = ${branchId}`,
  );
  return found.rows[0]!.n;
}

async function lastSeq(branchId: string, variantId: string): Promise<string> {
  const found = await db.execute<{ seq: string }>(sql`
    select max(seq)::text as seq from stock_movements
    where branch_id = ${branchId} and variant_id = ${variantId}`);
  return found.rows[0]!.seq;
}

type LineRow = {
  id: string;
  variant_id: string;
  qty: string;
  counted_qty: string | null;
  start_seq: string | null;
};

async function linesOf(documentId: string): Promise<LineRow[]> {
  const found = await db.execute<LineRow>(sql`
    select id, variant_id, qty::text as qty, counted_qty::text as counted_qty,
      start_seq::text as start_seq
    from stock_document_lines where document_id = ${documentId} order by variant_id`);
  return found.rows;
}

function lineOf(lines: LineRow[], variantId: string): LineRow {
  return lines.find((line) => line.variant_id === variantId)!;
}

/** A goods item with `qty` in the branch at 1 000 so'm, and 10 in the other branch beside it. */
async function inStock(qty: string, allowDecimal = false) {
  const item = await insertItem({ allowDecimal });
  await receive(branch.id, item.variantId, qty, 1000n, manager.id);
  await receive(other.id, item.variantId, "10", 1000n, manager.id);
  expect((await balanceOf(branch.id, item.variantId))?.qty).toBe(Number(qty).toFixed(3));
  return item;
}

/** An issue of `qty` straight through the ledger (the shape of the issue's movement). */
async function issue(variantId: string, qty: string) {
  await db.transaction((tx) =>
    postMovement(tx, {
      branchId: branch.id,
      variantId,
      type: "ISSUE",
      qtyDelta: `-${qty}`,
      unitCost: null,
      createdBy: manager.id,
    }),
  );
}

function startInput(change: Partial<StartCountInput> = {}): StartCountInput {
  return {
    clientKey: randomUUID(),
    branchId: branch.id,
    categoryId: null,
    comment: null,
    ...change,
  };
}

async function started(change: Partial<StartCountInput> = {}) {
  const result = await runAction(startCount, manager.id, startInput(change));
  expect(result).toMatchObject({ ok: true });
  return result.ok ? result.data : { documentId: "", number: "" };
}

function save(documentId: string, lines: SaveCountedQuantitiesInput["lines"]) {
  return runAction(saveCountedQuantities, manager.id, { documentId, lines });
}

describe("the difference of a count (09 Stock count: the system shows the differences; Done when)", () => {
  it("each difference is the counted quantity minus the stock at the start, not the stock of now", async () => {
    const a = await inStock("10");
    const b = await inStock("4");
    const c = await inStock("5");
    const { documentId } = await started();
    // After the start an issue takes 3 of A: the stock of now is 7.
    await issue(a.variantId, "3");
    expect((await balanceOf(branch.id, a.variantId))?.qty).toBe("7.000");

    const held = await linesOf(documentId);
    const saved = await save(documentId, [
      { lineId: lineOf(held, a.variantId).id, countedQty: "8" },
      { lineId: lineOf(held, b.variantId).id, countedQty: "4" },
      { lineId: lineOf(held, c.variantId).id, countedQty: "7" },
    ]);
    expect(saved).toEqual({ ok: true, data: { documentId, saved: 3 } });

    const lines = await linesOf(documentId);
    const differences = Object.fromEntries(
      lines.map((line) => [line.variant_id, countDifference(line.qty, line.counted_qty)]),
    );
    // 8 − 10, not 8 − 7 = +1; 4 − 4; 7 − 5.
    expect(differences).toEqual({ [a.variantId]: "-2", [b.variantId]: "0", [c.variantId]: "2" });
    expect(lineOf(lines, a.variantId).qty).toBe("10.000");
  });
});

describe("startCount (09 Stock count: a count for a branch or a category)", () => {
  it("holds every item of the branch at its stock, the item at 0 too, numbered CNT, waiting, and moves nothing", async () => {
    const a = await inStock("10");
    const empty = await inStock("2");
    await issue(empty.variantId, "2");
    expect((await balanceOf(branch.id, empty.variantId))?.qty).toBe("0.000");
    // An item only the other branch holds is not in this branch's count.
    const elsewhere = await insertItem();
    await receive(other.id, elsewhere.variantId, "6", 1000n, manager.id);
    const movesBefore = await movementCount(branch.id);
    const balanceBefore = await balanceOf(branch.id, a.variantId);

    const result = await runAction(startCount, manager.id, startInput({ comment: "Sinov" }));
    expect(result).toEqual({
      ok: true,
      data: { documentId: expect.any(String), number: `CNT-${branch.code}-31-0001` },
    });
    const id = result.ok ? result.data.documentId : "";

    const document = await db.execute<Record<string, string | null>>(sql`
      select type, status, comment, doc_date::text as doc_date, created_by, decided_by
      from stock_documents where id = ${id}`);
    expect(document.rows[0]).toEqual({
      type: "COUNT",
      status: "PENDING_APPROVAL",
      comment: "Sinov",
      doc_date: "2031-05-03",
      created_by: manager.id,
      decided_by: null,
    });
    const lines = await linesOf(id);
    expect(lines.map((line) => line.variant_id).sort()).toEqual(
      [a.variantId, empty.variantId].sort(),
    );
    expect(lineOf(lines, a.variantId)).toMatchObject({
      qty: "10.000",
      counted_qty: null,
      start_seq: await lastSeq(branch.id, a.variantId),
    });
    expect(lineOf(lines, empty.variantId)).toMatchObject({
      qty: "0.000",
      start_seq: await lastSeq(branch.id, empty.variantId),
    });
    expect(await movementCount(branch.id)).toBe(movesBefore);
    expect(await balanceOf(branch.id, a.variantId)).toEqual(balanceBefore);
  });

  it("a category count holds only that category's items of the branch", async () => {
    const a = await inStock("10");
    const b = await inStock("4");
    const { documentId } = await started({ categoryId: a.categoryId });
    expect((await linesOf(documentId)).map((line) => line.variant_id)).toEqual([a.variantId]);
    expect(b.categoryId).not.toBe(a.categoryId);
  });

  it("the same key twice gives the first count and makes one", async () => {
    await inStock("10");
    const input = startInput();
    const first = await runAction(startCount, manager.id, input);
    const second = await runAction(startCount, manager.id, input);
    expect(first).toMatchObject({ ok: true });
    expect(second).toEqual(first);
    const found = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from stock_documents where branch_id = ${branch.id}`);
    expect(found.rows[0]!.n).toBe(1);
  });

  it("a branch or a category with nothing in stock is refused nothingToCount", async () => {
    // The other branch holds an item; this branch holds none.
    const elsewhere = await insertItem();
    await receive(other.id, elsewhere.variantId, "6", 1000n, manager.id);
    expect(await runAction(startCount, manager.id, startInput())).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { branchId: "errors.field.nothingToCount" } },
    });
    await inStock("10");
    expect(
      await runAction(startCount, manager.id, startInput({ categoryId: elsewhere.categoryId })),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { categoryId: "errors.field.nothingToCount" } },
    });
  });

  it("an inactive branch is refused", async () => {
    await inStock("10");
    await db.execute(sql`update branches set is_active = false where id = ${branch.id}`);
    expect(await runAction(startCount, manager.id, startInput())).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { branchId: "errors.field.branchInactive" } },
    });
  });
});

describe("saveCountedQuantities (09 Stock count: types the counted quantities)", () => {
  async function scene() {
    const pieces = await inStock("10");
    const kilos = await inStock("2.5", true);
    const third = await inStock("3");
    const { documentId } = await started();
    // Another count of the same branch, its lines beside this one's.
    const { documentId: otherCount } = await started();
    const lines = await linesOf(documentId);
    return {
      documentId,
      otherLines: await linesOf(otherCount),
      pieces: lineOf(lines, pieces.variantId),
      kilos: lineOf(lines, kilos.variantId),
      third: lineOf(lines, third.variantId),
    };
  }

  it("saves the lines sent only, by the measure; two saves of different lines both keep theirs", async () => {
    const { documentId, otherLines, pieces, kilos, third } = await scene();
    expect(await save(documentId, [{ lineId: pieces.id, countedQty: "9" }])).toMatchObject({
      ok: true,
    });
    expect(await save(documentId, [{ lineId: kilos.id, countedQty: "1.5" }])).toMatchObject({
      ok: true,
    });
    const lines = await linesOf(documentId);
    expect(lineOf(lines, pieces.variant_id).counted_qty).toBe("9.000");
    expect(lineOf(lines, kilos.variant_id).counted_qty).toBe("1.500");
    expect(lineOf(lines, third.variant_id).counted_qty).toBeNull();
    for (const line of await db
      .execute<{ counted_qty: string | null }>(
        sql`
      select counted_qty::text as counted_qty from stock_document_lines
      where id in (${sql.join(
        otherLines.map((line) => sql`${line.id}::uuid`),
        sql`, `,
      )})`,
      )
      .then((found) => found.rows)) {
      expect(line.counted_qty).toBeNull();
    }
  });

  it("0 is a count; a quantity cleared goes back to not counted while the line beside it stays", async () => {
    const { documentId, pieces, kilos } = await scene();
    await save(documentId, [
      { lineId: pieces.id, countedQty: "0" },
      { lineId: kilos.id, countedQty: "2" },
    ]);
    expect(lineOf(await linesOf(documentId), pieces.variant_id).counted_qty).toBe("0.000");
    expect(await save(documentId, [{ lineId: pieces.id, countedQty: "" }])).toMatchObject({
      ok: true,
    });
    const lines = await linesOf(documentId);
    expect(lineOf(lines, pieces.variant_id).counted_qty).toBeNull();
    expect(lineOf(lines, kilos.variant_id).counted_qty).toBe("2.000");
  });

  it("half a piece is refused (edge case 'Half a piece'), and nothing of the save is kept", async () => {
    const { documentId, pieces, kilos } = await scene();
    expect(
      await save(documentId, [
        { lineId: kilos.id, countedQty: "1.5" },
        { lineId: pieces.id, countedQty: "1.5" },
      ]),
    ).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        fields: { [`lines.${pieces.id}.countedQty`]: "errors.field.wholeOnly" },
      },
    });
    expect(lineOf(await linesOf(documentId), kilos.variant_id).counted_qty).toBeNull();
  });

  it("a line of another count of the branch is refused notAllowed", async () => {
    const { documentId, otherLines, pieces } = await scene();
    expect(
      await save(documentId, [
        { lineId: pieces.id, countedQty: "9" },
        { lineId: otherLines[0]!.id, countedQty: "9" },
      ]),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { lines: "errors.field.notAllowed" } },
    });
    expect(lineOf(await linesOf(documentId), pieces.variant_id).counted_qty).toBeNull();
  });

  it("a count the Head has decided takes no more typing (wrong_status)", async () => {
    const { documentId, pieces } = await scene();
    // As 7.4's refusal would leave it.
    await db.execute(sql`
      update stock_documents set status = 'REJECTED', decided_by = ${manager.id},
        decided_at = ${AT}
      where id = ${documentId}`);
    expect(await save(documentId, [{ lineId: pieces.id, countedQty: "9" }])).toMatchObject({
      ok: false,
      error: { code: "wrong_status" },
    });
  });

  it("a document that is not a count is Not found", async () => {
    const { pieces } = await scene();
    const entry = await db.transaction((tx) =>
      createDocument(tx, {
        type: "DIRECT_ENTRY",
        branchId: branch.id,
        docDate: "2031-05-03",
        status: "POSTED",
        reason: "EXISTING_STOCK",
        clientKey: randomUUID(),
        createdBy: manager.id,
        lines: [{ variantId: pieces.variant_id, qty: "1", unitCost: 1000n }],
      }),
    );
    expect(
      await save(entry.documentId, [{ lineId: entry.lineIds[0]!, countedQty: "9" }]),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    // Not found also for a Manager with WRITE_OFF_COUNT off, never "forbidden".
    await setManagerRight(manager.id, "WRITE_OFF_COUNT", false);
    expect(
      await save(entry.documentId, [{ lineId: entry.lineIds[0]!, countedQty: "9" }]),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});
