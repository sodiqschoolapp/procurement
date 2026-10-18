import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { runAction } from "@/server/action";
import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertItem } from "../../../../tests/helpers/orders";
import { receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { type WriteOffInput, askWriteOff } from "./write-off";

// Ask for a write-off (build plan 5.11; plan of 5.11, Tests). Spec: 09-warehouse.md (Movement
// types: "Write-off … Manager asks | Head"; Other documents, Write-off: "Stock changes only after
// the Head approves"; Stock value); Decided ahead, question 13 (the reasons; every write-off has
// its comment); 10 Notifications ("Write-off or correction asked | Head"); edge-cases/
// warehouse.md ("Half a piece"); developer-rules.md rule 8. Every fixture is asserted (D38); every
// refusal carries the stock of another branch beside it, untouched (D40).

const AT = "2031-05-03T06:00:00Z";

let branch: { id: string; code: string };
let other: { id: string; code: string };
let manager: { id: string; fullName: string };
let head: { id: string };

beforeEach(async () => {
  setClock(AT);
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

async function movementsOf(branchId: string, variantId: string): Promise<number> {
  const found = await db.execute<{ n: number }>(sql`
    select count(*)::int as n from stock_movements
    where branch_id = ${branchId} and variant_id = ${variantId}`);
  return found.rows[0]!.n;
}

async function documentCount(): Promise<number> {
  const found = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from stock_documents where branch_id = ${branch.id}`,
  );
  return found.rows[0]!.n;
}

async function noticesOf(userId: string) {
  const found = await db.execute<{ type: string; params: Record<string, unknown>; link: string }>(
    sql`select type, params, link from notifications where user_id = ${userId}`,
  );
  return found.rows;
}

function writeOffInput(
  lines: WriteOffInput["lines"],
  change: Partial<WriteOffInput> = {},
): WriteOffInput {
  return {
    clientKey: randomUUID(),
    branchId: branch.id,
    docDate: "2031-05-03",
    reason: "DAMAGED",
    comment: "Sinov: namlikdan buzilgan",
    lines,
    ...change,
  };
}

/** A goods subtype with `qty` in the branch at 1 000 so'm, and 10 in the other branch beside it. */
async function inStock(qty: string, allowDecimal = false): Promise<string> {
  const { variantId } = await insertItem({ allowDecimal });
  await receive(branch.id, variantId, qty, 1000n, manager.id);
  await receive(other.id, variantId, "10", 1000n, manager.id);
  expect((await balanceOf(branch.id, variantId))?.qty).toBe(Number(qty).toFixed(3));
  return variantId;
}

describe("askWriteOff by a Manager (09 Other documents, Write-off: stock changes only after the Head approves)", () => {
  it("saves the write-off waiting for the Head, numbered WOF-<code>-31-0001, and moves no stock (Done when 1)", async () => {
    const a = await inStock("10");
    const b = await inStock("4");
    const movesBefore = await movementsOf(branch.id, a);

    const result = await runAction(
      askWriteOff,
      manager.id,
      writeOffInput([
        { variantId: a, qty: "3" },
        { variantId: b, qty: "4" },
      ]),
    );
    expect(result).toEqual({
      ok: true,
      data: {
        documentId: expect.any(String),
        number: `WOF-${branch.code}-31-0001`,
        posted: false,
      },
    });
    const id = result.ok ? result.data.documentId : "";

    const document = await db.execute<Record<string, string | null>>(sql`
      select type, status, reason, comment, doc_date::text as doc_date, created_by, decided_by,
        decided_at::text as decided_at, department_id
      from stock_documents where id = ${id}`);
    expect(document.rows[0]).toEqual({
      type: "WRITE_OFF",
      status: "PENDING_APPROVAL",
      reason: "DAMAGED",
      comment: "Sinov: namlikdan buzilgan",
      doc_date: "2031-05-03",
      created_by: manager.id,
      decided_by: null,
      decided_at: null,
      department_id: null,
    });
    const lines = await db.execute<{ variant_id: string; qty: string }>(sql`
      select variant_id, qty::text as qty from stock_document_lines
      where document_id = ${id} order by variant_id = ${a} desc`);
    expect(lines.rows).toEqual([
      { variant_id: a, qty: "3.000" },
      { variant_id: b, qty: "4.000" },
    ]);
    expect(await balanceOf(branch.id, a)).toEqual({ qty: "10.000", avg_cost: "1000" });
    expect(await balanceOf(branch.id, b)).toEqual({ qty: "4.000", avg_cost: "1000" });
    expect(await movementsOf(branch.id, a)).toBe(movesBefore);
  });

  it("tells every active Head once, with the number and the branch, linking to the write-off; not the Manager, not an inactive Head (10 Notifications)", async () => {
    const away = await insertUser("HEAD", { isActive: false });
    const a = await inStock("5");
    const result = await runAction(
      askWriteOff,
      manager.id,
      writeOffInput([{ variantId: a, qty: "1" }]),
    );
    expect(result.ok).toBe(true);
    const id = result.ok ? result.data.documentId : "";
    expect(await noticesOf(head.id)).toEqual([
      {
        type: "STOCK_CHANGE_ASKED",
        params: {
          actor: manager.fullName,
          number: `WOF-${branch.code}-31-0001`,
          branch: branch.code,
          kind: "WRITE_OFF",
        },
        link: `/warehouse/documents/${id}`,
      },
    ]);
    expect(await noticesOf(manager.id)).toEqual([]);
    expect(await noticesOf(away.id)).toEqual([]);
  });

  it("returns the first result for the same browser id and makes one document (developer-rules rule 8)", async () => {
    const a = await inStock("5");
    const input = writeOffInput([{ variantId: a, qty: "1" }]);
    const first = await runAction(askWriteOff, manager.id, input);
    const second = await runAction(askWriteOff, manager.id, input);
    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    expect(await documentCount()).toBe(1);
  });

  it('accepts every reason of the fixed list, "Returned to supplier" and "Other" among them (Decided ahead, question 13)', async () => {
    const a = await inStock("10");
    for (const reason of [
      "DAMAGED",
      "EXPIRED",
      "LOST",
      "RETURNED_TO_SUPPLIER",
      "LOST_IN_TRANSFER",
      "OTHER",
    ] as const) {
      const result = await runAction(
        askWriteOff,
        manager.id,
        writeOffInput([{ variantId: a, qty: "1" }], { reason }),
      );
      expect(result.ok, reason).toBe(true);
    }
    expect(await documentCount()).toBe(6);
  });

  it("refuses a reason outside the list, and a direct entry's reason (Decided ahead, question 13)", async () => {
    const a = await inStock("5");
    for (const reason of ["GIFT", "EXISTING_STOCK", "BROKEN"]) {
      const result = await runAction(askWriteOff, manager.id, {
        ...writeOffInput([{ variantId: a, qty: "1" }]),
        reason,
      });
      expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    }
    expect(await documentCount()).toBe(0);
  });

  it("refuses an empty or blank comment, whatever the reason (Decided ahead, question 13)", async () => {
    const a = await inStock("5");
    for (const comment of ["", "   ", null]) {
      const result = await runAction(askWriteOff, manager.id, {
        ...writeOffInput([{ variantId: a, qty: "1" }]),
        comment,
      });
      expect(result).toMatchObject({
        ok: false,
        error: { code: "invalid_input", fields: { comment: "errors.field.required" } },
      });
    }
    expect(await documentCount()).toBe(0);
  });

  it("refuses more than the stock, naming the amount left; equal to the stock is accepted (plan of 5.11, decided item 3)", async () => {
    const a = await inStock("4");
    const over = await runAction(
      askWriteOff,
      manager.id,
      writeOffInput([{ variantId: a, qty: "5" }]),
    );
    expect(over).toEqual({
      ok: false,
      error: {
        code: "invalid_input",
        messageKey: "errors.invalidInput",
        fields: { "lines.0.qty": "errors.field.stockShort" },
        available: { "lines.0.qty": "4.000" },
      },
    });
    expect(await documentCount()).toBe(0);
    const equal = await runAction(
      askWriteOff,
      manager.id,
      writeOffInput([{ variantId: a, qty: "4" }]),
    );
    expect(equal.ok).toBe(true);
    expect(await balanceOf(other.id, a)).toEqual({ qty: "10.000", avg_cost: "1000" });
  });

  it('refuses half a piece of an item counted in pieces (edge case "Half a piece")', async () => {
    const a = await inStock("4");
    const result = await runAction(
      askWriteOff,
      manager.id,
      writeOffInput([{ variantId: a, qty: "1.5" }]),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { "lines.0.qty": expect.any(String) } },
    });
    expect(await documentCount()).toBe(0);
  });

  it("refuses an inactive subtype, a service, an inactive branch and a future date (plan of 5.11, decided items 8 and 9; 04 rule 2)", async () => {
    const a = await inStock("4");
    await db.execute(sql`update product_variants set is_active = false where id = ${a}`);
    expect(
      await runAction(askWriteOff, manager.id, writeOffInput([{ variantId: a, qty: "1" }])),
    ).toMatchObject({
      ok: false,
      error: { fields: { "lines.0.variantId": "errors.field.inactive" } },
    });

    const service = (await insertItem({ type: "SERVICE" })).variantId;
    expect(
      await runAction(askWriteOff, manager.id, writeOffInput([{ variantId: service, qty: "1" }])),
    ).toMatchObject({
      ok: false,
      error: { fields: { "lines.0.variantId": "errors.field.notAllowed" } },
    });

    const b = await inStock("4");
    expect(
      await runAction(
        askWriteOff,
        manager.id,
        writeOffInput([{ variantId: b, qty: "1" }], { docDate: "2031-05-04" }),
      ),
    ).toMatchObject({ ok: false, error: { fields: { docDate: "errors.field.inFuture" } } });

    await db.execute(sql`update branches set is_active = false where id = ${branch.id}`);
    expect(
      await runAction(askWriteOff, manager.id, writeOffInput([{ variantId: b, qty: "1" }])),
    ).toMatchObject({ ok: false, error: { fields: { branchId: "errors.field.branchInactive" } } });
    expect(await documentCount()).toBe(0);
  });
});

describe("askWriteOff by the Head (plan of 5.11, decided item 1, Look first)", () => {
  it("posts it at once, decided by that Head, lowering the stock at the average, and tells nobody", async () => {
    const { variantId: a } = await insertItem();
    await receive(branch.id, a, "10", 1000n, manager.id);
    await receive(branch.id, a, "10", 2000n, manager.id); // 20 @ 1 500
    const result = await runAction(
      askWriteOff,
      head.id,
      writeOffInput([{ variantId: a, qty: "5" }], { reason: "EXPIRED" }),
    );
    expect(result).toMatchObject({ ok: true, data: { posted: true } });
    const id = result.ok ? result.data.documentId : "";
    const document = await db.execute<{ status: string; decided_by: string; decided: boolean }>(sql`
      select status, decided_by, decided_at is not null as decided
      from stock_documents where id = ${id}`);
    expect(document.rows[0]).toEqual({ status: "POSTED", decided_by: head.id, decided: true });
    const moved = await db.execute<{ type: string; qty_delta: string; unit_cost: string }>(sql`
      select m.type, m.qty_delta::text as qty_delta, m.unit_cost::text as unit_cost
      from stock_movements m join stock_document_lines l on l.id = m.document_line_id
      where l.document_id = ${id}`);
    expect(moved.rows).toEqual([{ type: "WRITE_OFF", qty_delta: "-5.000", unit_cost: "1500" }]);
    expect(await balanceOf(branch.id, a)).toEqual({ qty: "15.000", avg_cost: "1500" });
    const told = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from notifications where type = 'STOCK_CHANGE_ASKED'
        and link = ${`/warehouse/documents/${id}`}`);
    expect(told.rows[0]!.n).toBe(0);
  });
});
