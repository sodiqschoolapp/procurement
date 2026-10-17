import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { insertBranch } from "../../tests/helpers/branches";
import { insertProduct, insertUnit } from "../../tests/helpers/catalog";
import { setClock } from "../../tests/helpers/clock";
import { insertDepartment } from "../../tests/helpers/orders";
import { insertUser } from "../../tests/helpers/users";
import { ActionError } from "./action";
import {
  type CreatedDocument,
  type DocumentInput,
  createDocument,
  postLines,
  reverseDocument,
} from "./stock-documents";
import { StockShortError, postMovement } from "./stock-ledger";

// The document helpers of 5.1 (build plan 5.1, Done when: "two documents posted at the same
// moment get different numbers; a reverse writes the opposite movement and marks the original
// Reversed"; plan of 5.1, Tests). Spec: 09-warehouse.md (Movement types and its last paragraph;
// Issue to a department 1 to 3; Direct entry 2; Stock value); 14-data-model.md (number_counters,
// stock_documents, stock_document_lines); 05-order-request-form.md (Order number 2 and 5, the
// counter rules the documents share); 15-quality-and-acceptance.md (Test layers: actions two at
// a time); developer-rules.md rules 3, 7 and 10. Every fixture is asserted (D38).

const AT = "2031-05-03T06:00:00Z";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

let userId: string;

beforeAll(async () => {
  userId = (await insertUser("HEAD")).id;
});

async function branch() {
  const made = await insertBranch();
  return { id: made.id, code: made.code };
}

async function goods(): Promise<string> {
  const unit = await insertUnit({ allowDecimal: false });
  return (await insertProduct({ unitId: unit.id })).defaultVariantId;
}

function issue(
  branchId: string,
  departmentId: string,
  variantId: string,
  qty: string,
): DocumentInput {
  return {
    type: "ISSUE",
    branchId,
    departmentId,
    receivedByName: "Sinov Qabulqiluvchi",
    docDate: "2031-05-03",
    status: "POSTED",
    clientKey: randomUUID(),
    createdBy: userId,
    lines: [{ variantId, qty }],
  };
}

function entry(branchId: string, lines: DocumentInput["lines"]): DocumentInput {
  return {
    type: "DIRECT_ENTRY",
    branchId,
    docDate: "2031-05-03",
    status: "POSTED",
    reason: "EXISTING_STOCK",
    clientKey: randomUUID(),
    createdBy: userId,
    lines,
  };
}

function create(input: DocumentInput): Promise<CreatedDocument> {
  return db.transaction((tx) => createDocument(tx, input));
}

async function balanceOf(branchId: string, variantId: string) {
  const found = await db.execute<{ qty: string; avg_cost: string }>(sql`
    select qty::text as qty, avg_cost::text as avg_cost from stock_balances
    where branch_id = ${branchId} and variant_id = ${variantId}`);
  return found.rows[0] ?? null;
}

async function documentRow(id: string) {
  const found = await db.execute<{
    number: string;
    status: string;
    reversed_by: string | null;
    at_clock: boolean | null;
    reverse_reason: string | null;
  }>(sql`
    select number, status, reversed_by, reversed_at = ${new Date(AT)} as at_clock, reverse_reason
    from stock_documents where id = ${id}`);
  return found.rows[0];
}

async function outcome<T>(running: Promise<T>): Promise<T | Error> {
  return running.catch((error: unknown) => error as Error);
}

/**
 * The held side of a same-moment test (`.claude/rules/tests.md`): `first` runs in a transaction
 * that stays open until `second`, on its own connection, waits on a lock; then it commits. The
 * wait is read from pg_stat_activity, never timed.
 */
async function heldWhileSecondWaits<A, B>(
  first: (tx: Tx) => Promise<A>,
  second: () => Promise<B>,
): Promise<{ first: A; second: B | Error }> {
  let running!: Promise<B | Error>;
  const firstResult = await db.transaction(async (tx) => {
    const result = await first(tx);
    running = outcome(second());
    for (let tries = 0; ; tries += 1) {
      await db.execute(sql`select pg_stat_clear_snapshot()`);
      const waiting = await db.execute<{ n: number }>(sql`
        select count(*)::int as n from pg_stat_activity
        where datname = current_database() and wait_event_type = 'Lock'`);
      if (waiting.rows[0]!.n >= 1) break;
      if (tries > 5_000) throw new Error("The second side never waited on a lock.");
    }
    return result;
  });
  return { first: firstResult, second: await running };
}

describe("numbers: two documents at the same moment (Done when 1; 05 Order number 2 and 5)", () => {
  it("the year's first two issues of a branch get 0001 and 0002, the second waiting on the first", async () => {
    setClock(AT);
    const b = await branch();
    const department = (await insertDepartment(b.id)).id;
    const v = await goods();
    expect((await create(entry(b.id, [{ variantId: v, qty: "10", unitCost: 100n }]))).number).toBe(
      `ENT-${b.code}-31-0001`,
    );

    const { first, second } = await heldWhileSecondWaits(
      (tx) => createDocument(tx, issue(b.id, department, v, "1")),
      () => create(issue(b.id, department, v, "2")),
    );
    expect(first.number).toBe(`ISS-${b.code}-31-0001`);
    expect(second).toMatchObject({ number: `ISS-${b.code}-31-0002` });
    expect(await balanceOf(b.id, v)).toMatchObject({ qty: "7.000" });
  });

  it("with the counter row already there, the third and fourth get 0003 and 0004", async () => {
    setClock(AT);
    const b = await branch();
    const department = (await insertDepartment(b.id)).id;
    const v = await goods();
    await create(entry(b.id, [{ variantId: v, qty: "10", unitCost: 100n }]));
    await create(issue(b.id, department, v, "1"));
    await create(issue(b.id, department, v, "1"));

    const { first, second } = await heldWhileSecondWaits(
      (tx) => createDocument(tx, issue(b.id, department, v, "1")),
      () => create(issue(b.id, department, v, "1")),
    );
    expect(first.number).toBe(`ISS-${b.code}-31-0003`);
    expect(second).toMatchObject({ number: `ISS-${b.code}-31-0004` });
  });

  it("an issue of a second branch at the same moment starts at its own 0001", async () => {
    setClock(AT);
    const [a, b] = [await branch(), await branch()];
    const v = await goods();
    await create(entry(a.id, [{ variantId: v, qty: "5", unitCost: 100n }]));
    await create(entry(b.id, [{ variantId: v, qty: "5", unitCost: 100n }]));
    const [da, db2] = [(await insertDepartment(a.id)).id, (await insertDepartment(b.id)).id];

    const [first, second] = await Promise.all([
      create(issue(a.id, da, v, "1")),
      create(issue(b.id, db2, v, "1")),
    ]);
    expect(first.number).toBe(`ISS-${a.code}-31-0001`);
    expect(second.number).toBe(`ISS-${b.code}-31-0001`);
  });
});

describe("numbers: per scope, branch and Tashkent year (14 number_counters; rule 10)", () => {
  it("counts each type apart and leaves the order counter alone", async () => {
    setClock(AT);
    const b = await branch();
    const v = await goods();
    expect((await create(entry(b.id, [{ variantId: v, qty: "3", unitCost: 100n }]))).number).toBe(
      `ENT-${b.code}-31-0001`,
    );
    const department = (await insertDepartment(b.id)).id;
    expect((await create(issue(b.id, department, v, "1"))).number).toBe(`ISS-${b.code}-31-0001`);
    expect((await create(entry(b.id, [{ variantId: v, qty: "1", unitCost: 100n }]))).number).toBe(
      `ENT-${b.code}-31-0002`,
    );
    const counters = await db.execute<{ scope: string; last_value: number }>(sql`
      select scope, last_value from number_counters where branch_id = ${b.id} order by scope`);
    expect(counters.rows).toEqual([
      { scope: "ISS", last_value: 1 },
      { scope: "ENT", last_value: 2 },
    ]);
  });

  it("takes the year of the moment in Tashkent: 31 December 23:30 is -31-, 1 January 00:10 is -32-", async () => {
    const b = await branch();
    const v = await goods();
    setClock("2031-12-31T23:30:00+05:00");
    expect((await create(entry(b.id, [{ variantId: v, qty: "1", unitCost: 100n }]))).number).toBe(
      `ENT-${b.code}-31-0001`,
    );
    setClock("2032-01-01T00:10:00+05:00");
    expect((await create(entry(b.id, [{ variantId: v, qty: "1", unitCost: 100n }]))).number).toBe(
      `ENT-${b.code}-32-0001`,
    );
  });
});

describe("posting (09 Movement types; Issue to a department 1; rule 3)", () => {
  it("a direct entry raises the stock at its cost and an issue lowers it, each movement on its line", async () => {
    setClock(AT);
    const b = await branch();
    const department = (await insertDepartment(b.id)).id;
    const [v, w] = [await goods(), await goods()];
    const made = await create(
      entry(b.id, [
        { variantId: v, qty: "4", unitCost: 300n },
        { variantId: w, qty: "2", unitCost: 50n },
      ]),
    );
    expect(made.lineIds).toHaveLength(2);
    expect(await balanceOf(b.id, v)).toEqual({ qty: "4.000", avg_cost: "300" });
    expect(await balanceOf(b.id, w)).toEqual({ qty: "2.000", avg_cost: "50" });

    const issued = await create(issue(b.id, department, v, "3"));
    expect(await balanceOf(b.id, v)).toEqual({ qty: "1.000", avg_cost: "300" });
    const moved = await db.execute<{ type: string; qty_delta: string; document_line_id: string }>(
      sql`select type, qty_delta::text as qty_delta, document_line_id from stock_movements
        where branch_id = ${b.id} and variant_id = ${v} order by seq`,
    );
    expect(moved.rows).toEqual([
      { type: "DIRECT_ENTRY", qty_delta: "4.000", document_line_id: made.lineIds[0] },
      { type: "ISSUE", qty_delta: "-3.000", document_line_id: issued.lineIds[0] },
    ]);
  });

  it("a write-off that waits moves nothing until postLines()", async () => {
    setClock(AT);
    const b = await branch();
    const v = await goods();
    await create(entry(b.id, [{ variantId: v, qty: "5", unitCost: 100n }]));
    const waiting = await create({
      type: "WRITE_OFF",
      branchId: b.id,
      docDate: "2031-05-03",
      status: "PENDING_APPROVAL",
      reason: "DAMAGED",
      comment: "Sinib qolgan",
      clientKey: randomUUID(),
      createdBy: userId,
      lines: [{ variantId: v, qty: "2" }],
    });
    expect(waiting.posted).toEqual([]);
    expect(await balanceOf(b.id, v)).toMatchObject({ qty: "5.000" });

    await db.transaction((tx) =>
      postLines(tx, {
        documentId: waiting.documentId,
        type: "WRITE_OFF",
        branchId: b.id,
        createdBy: userId,
      }),
    );
    expect(await balanceOf(b.id, v)).toMatchObject({ qty: "3.000" });
  });

  it("an issue past the stock names what is left and saves no document, line, movement or number", async () => {
    setClock(AT);
    const b = await branch();
    const department = (await insertDepartment(b.id)).id;
    const v = await goods();
    await create(entry(b.id, [{ variantId: v, qty: "2", unitCost: 100n }]));

    const refused = await outcome(create(issue(b.id, department, v, "3")));
    expect(refused).toBeInstanceOf(StockShortError);
    expect(refused).toMatchObject({ code: "conflict", available: "2" });
    const left = await db.execute<{ documents: number; movements: number; counters: number }>(sql`
      select (select count(*)::int from stock_documents where branch_id = ${b.id}) as documents,
        (select count(*)::int from stock_movements where branch_id = ${b.id}) as movements,
        (select count(*)::int from number_counters where branch_id = ${b.id}) as counters`);
    expect(left.rows[0]).toEqual({ documents: 1, movements: 1, counters: 1 });
    expect((await create(issue(b.id, department, v, "2"))).number).toBe(`ISS-${b.code}-31-0001`);
  });
});

describe("reverse (Done when 2; 09 Movement types, last paragraph; Issue to a department 3)", () => {
  it("undoes only its own issue's movements, at their cost, and marks it Reversed with who, when and why", async () => {
    setClock(AT);
    const [b, other] = [await branch(), await branch()];
    const department = (await insertDepartment(b.id)).id;
    const v = await goods();
    await create(entry(b.id, [{ variantId: v, qty: "10", unitCost: 100n }]));
    await create(entry(other.id, [{ variantId: v, qty: "6", unitCost: 700n }]));
    const wrong = await create(issue(b.id, department, v, "2"));
    const kept = await create(issue(b.id, department, v, "3"));
    // A receipt since the issue: 5 @ 100 + 8 @ 200 → 13 @ round(2 100 / 13) = 162.
    await db.transaction((tx) =>
      postMovement(tx, {
        branchId: b.id,
        variantId: v,
        type: "RECEIPT",
        qtyDelta: "8",
        unitCost: 200n,
        createdBy: userId,
      }),
    );
    expect(await balanceOf(b.id, v)).toEqual({ qty: "13.000", avg_cost: "162" });

    const reverser = (await insertUser("HEAD")).id;
    const done = await db.transaction((tx) =>
      reverseDocument(tx, {
        documentId: wrong.documentId,
        reason: "Noto'g'ri bo'lim",
        reversedBy: reverser,
      }),
    );
    expect(done.reversals).toHaveLength(1);
    // +2 back at the 100 the issue left at: round((13 × 162 + 200) ÷ 15) = 154 (decided item 2).
    expect(await balanceOf(b.id, v)).toEqual({ qty: "15.000", avg_cost: "154" });
    expect(await balanceOf(other.id, v)).toEqual({ qty: "6.000", avg_cost: "700" });

    const reversal = await db.execute<{
      type: string;
      qty_delta: string;
      unit_cost: string;
      document_line_id: string;
      reverses_movement_id: string;
      created_by: string;
    }>(sql`
      select type, qty_delta::text as qty_delta, unit_cost::text as unit_cost, document_line_id,
        reverses_movement_id, created_by
      from stock_movements where type = 'REVERSAL' and variant_id = ${v}`);
    const original = await db.execute<{ id: string }>(sql`
      select id from stock_movements where document_line_id = ${wrong.lineIds[0]!} and type = 'ISSUE'`);
    expect(reversal.rows).toEqual([
      {
        type: "REVERSAL",
        qty_delta: "2.000",
        unit_cost: "100",
        document_line_id: wrong.lineIds[0],
        reverses_movement_id: original.rows[0]!.id,
        created_by: reverser,
      },
    ]);
    expect(await documentRow(wrong.documentId)).toEqual({
      number: wrong.number,
      status: "REVERSED",
      reversed_by: reverser,
      at_clock: true,
      reverse_reason: "Noto'g'ri bo'lim",
    });
    expect(await documentRow(kept.documentId)).toMatchObject({
      status: "POSTED",
      reversed_by: null,
    });
  });

  it("refuses a second reverse of the same document (wrong_status), and moves nothing", async () => {
    setClock(AT);
    const b = await branch();
    const department = (await insertDepartment(b.id)).id;
    const v = await goods();
    await create(entry(b.id, [{ variantId: v, qty: "4", unitCost: 100n }]));
    const issued = await create(issue(b.id, department, v, "1"));
    await db.transaction((tx) =>
      reverseDocument(tx, { documentId: issued.documentId, reason: "Xato", reversedBy: userId }),
    );

    const again = await outcome(
      db.transaction((tx) =>
        reverseDocument(tx, { documentId: issued.documentId, reason: "Yana", reversedBy: userId }),
      ),
    );
    expect(again).toBeInstanceOf(ActionError);
    expect(again).toMatchObject({ code: "wrong_status" });
    expect(await balanceOf(b.id, v)).toMatchObject({ qty: "4.000" });
  });

  it("refuses to reverse a write-off that waits for the Head (decided item 8)", async () => {
    setClock(AT);
    const b = await branch();
    const v = await goods();
    await create(entry(b.id, [{ variantId: v, qty: "4", unitCost: 100n }]));
    const waiting = await create({
      type: "WRITE_OFF",
      branchId: b.id,
      docDate: "2031-05-03",
      status: "PENDING_APPROVAL",
      reason: "LOST",
      comment: "Topilmadi",
      clientKey: randomUUID(),
      createdBy: userId,
      lines: [{ variantId: v, qty: "1" }],
    });
    const refused = await outcome(
      db.transaction((tx) =>
        reverseDocument(tx, { documentId: waiting.documentId, reason: "Xato", reversedBy: userId }),
      ),
    );
    expect(refused).toMatchObject({ code: "wrong_status" });
    expect(await documentRow(waiting.documentId)).toMatchObject({ status: "PENDING_APPROVAL" });
  });

  it("refuses a reverse that would take the stock below 0, leaving the entry Posted", async () => {
    setClock(AT);
    const b = await branch();
    const department = (await insertDepartment(b.id)).id;
    const v = await goods();
    const entered = await create(entry(b.id, [{ variantId: v, qty: "5", unitCost: 300n }]));
    await create(issue(b.id, department, v, "2"));

    const refused = await outcome(
      db.transaction((tx) =>
        reverseDocument(tx, { documentId: entered.documentId, reason: "Xato", reversedBy: userId }),
      ),
    );
    expect(refused).toBeInstanceOf(StockShortError);
    expect(refused).toMatchObject({ available: "3" });
    expect(await documentRow(entered.documentId)).toMatchObject({ status: "POSTED" });
    expect(await balanceOf(b.id, v)).toEqual({ qty: "3.000", avg_cost: "300" });
  });
});
