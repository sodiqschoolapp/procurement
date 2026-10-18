import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import type { ImportSheet } from "@/domain/imports";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertProduct, insertSubtypes, insertUnit } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { type Value, importSheet } from "../../../../tests/helpers/imports";
import { receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { importStock } from "./import-stock";

// Existing stock from an Excel file (build-plan 5.9; plan of 5.9, Tests). Spec: 09-warehouse.md
// (Direct entry by the Head: 1 "Many items are imported from an Excel template, with the same
// preview and error check as catalog imports", 2, Lines; Stock value); 04-catalogs.md rule 7
// ("saves nothing unless every row is valid"); edge case "The school already has stock on launch
// day"; Decided ahead, question 12; developer-rules.md rules 3 and 8. Every fixture is asserted
// (D38); another branch's stock stands beside the one imported into (D40).

const AT = "2031-05-03T06:00:00Z";

let branch: { id: string; code: string };
let other: { id: string; code: string };
let head: string;

beforeEach(async () => {
  setClock(AT);
  branch = await insertBranch();
  other = await insertBranch();
  head = (await insertUser("HEAD")).id;
});

/** A goods product without subtypes, in a whole-unit measure unless told otherwise. */
async function goods(options: { allowDecimal?: boolean; referencePrice?: bigint | null } = {}) {
  const unit = await insertUnit({ allowDecimal: options.allowDecimal ?? false });
  const product = await insertProduct({
    unitId: unit.id,
    referencePrice: options.referencePrice ?? null,
  });
  return { ...product, variantId: product.defaultVariantId };
}

function input(sheet: ImportSheet, overrides: { clientKey?: string; branchId?: string } = {}) {
  return {
    clientKey: overrides.clientKey ?? randomUUID(),
    fileName: "qoldiq.xlsx",
    branchId: overrides.branchId ?? branch.id,
    sheet,
  };
}

/** A row: product name, subtype, quantity, cost. */
function row(name: string, qty: Value, cost: Value = 1000, subtype = ""): Value[] {
  return [name, subtype, qty, cost];
}

async function stockOf(variantId: string, branchId = branch.id) {
  const found = await db.execute<{ qty: string; avg_cost: string }>(sql`
    select qty::text as qty, avg_cost::text as avg_cost from stock_balances
    where branch_id = ${branchId} and variant_id = ${variantId}`);
  return found.rows[0] ?? null;
}

async function written(branchId = branch.id) {
  const found = await db.execute<{
    documents: number;
    movements: number;
    balances: number;
    imports: number;
  }>(sql`
    select
      (select count(*)::int from stock_documents where branch_id = ${branchId}) as documents,
      (select count(*)::int from stock_movements where branch_id = ${branchId}) as movements,
      (select count(*)::int from stock_balances where branch_id = ${branchId}) as balances,
      (select count(*)::int from catalog_imports where branch_id = ${branchId}) as imports`);
  return found.rows[0]!;
}

type Saved = { importId: string; rows: number; numbers: string[] };

/** The answer as the page gets it: the record, its rows and the numbers. */
function savedOf(result: unknown): Saved {
  expect(result).toMatchObject({ ok: true });
  const { importId, rows, numbers } = (result as { ok: true; data: Saved }).data;
  return { importId, rows, numbers };
}

describe("Done when: a file with one unknown product saves nothing (04 rule 7; build-plan 5.9)", () => {
  it("no document, no movement, no balance, no import row; the error names that row's product", async () => {
    const items = await Promise.all(Array.from({ length: 3 }, () => goods()));
    const sheet = importSheet("stock", [
      row(items[0]!.name, 5),
      row(items[1]!.name, 6),
      row("Bunday mahsulot yo'q", 7),
      row(items[2]!.name, 8),
    ]);
    expect(await runAction(importStock, head, input(sheet))).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { "4:name": "errors.field.unknown" } },
    });
    expect(await written()).toEqual({ documents: 0, movements: 0, balances: 0, imports: 0 });
  });
});

describe("Done when: a valid file of 20 rows raises 20 balances (09 Direct entry by the Head 1)", () => {
  it("each balance of the branch by its quantity at its cost; another branch's stock is unchanged", async () => {
    const items = await Promise.all(Array.from({ length: 20 }, () => goods()));
    // Another branch already holds the first item: an import into this branch leaves it as it is.
    await receive(other.id, items[0]!.variantId, "4", 900n, head);
    expect(await stockOf(items[0]!.variantId, other.id)).toEqual({ qty: "4.000", avg_cost: "900" });

    const sheet = importSheet(
      "stock",
      items.map((item, at) => row(item.name, at + 1, 1000 * (at + 1))),
    );
    const saved = savedOf(await runAction(importStock, head, input(sheet)));
    expect(saved.rows).toBe(20);
    expect(saved.numbers).toEqual([`ENT-${branch.code}-31-0001`]);
    for (const [at, item] of items.entries()) {
      expect(await stockOf(item.variantId)).toEqual({
        qty: `${at + 1}.000`,
        avg_cost: String(1000 * (at + 1)),
      });
    }
    expect(await written()).toEqual({ documents: 1, movements: 20, balances: 20, imports: 1 });
    expect(await stockOf(items[0]!.variantId, other.id)).toEqual({ qty: "4.000", avg_cost: "900" });
    expect((await written(other.id)).documents).toBe(0);
  });
});

describe('the document an import writes (09 Direct entry 2; edge case "The school already has stock on launch day"; decided items 3 and 5)', () => {
  it("a POSTED direct entry of today with the reason Stock we already had, its import, its own client key and one audit row", async () => {
    const chairs = await goods();
    const key = randomUUID();
    const saved = savedOf(
      await runAction(
        importStock,
        head,
        input(importSheet("stock", [row(chairs.name, 200, 150000)]), { clientKey: key }),
      ),
    );
    const document = await db.execute<{
      id: string;
      type: string;
      status: string;
      reason: string;
      doc_date: string;
      comment: string | null;
      import_id: string;
      client_key: string;
      created_by: string;
    }>(sql`
      select id, type, status, reason, doc_date::text, comment, import_id, client_key, created_by
      from stock_documents where branch_id = ${branch.id}`);
    expect(document.rows).toHaveLength(1);
    expect(document.rows[0]).toMatchObject({
      type: "DIRECT_ENTRY",
      status: "POSTED",
      reason: "EXISTING_STOCK",
      doc_date: "2031-05-03",
      comment: null,
      import_id: saved.importId,
      created_by: head,
    });
    expect(document.rows[0]!.client_key).not.toBe(key);

    const record = await db.execute<{ kind: string; row_count: number; file_name: string }>(sql`
      select kind, row_count, file_name from catalog_imports where id = ${saved.importId}`);
    expect(record.rows[0]).toEqual({ kind: "STOCK", row_count: 1, file_name: "qoldiq.xlsx" });

    const audits = await db.execute<{ action: string; actor_id: string; after: unknown }>(sql`
      select action, actor_id, after from audit_log where entity_id = ${document.rows[0]!.id}`);
    expect(audits.rows).toEqual([
      expect.objectContaining({
        action: "direct_entry.create",
        actor_id: head,
        after: expect.objectContaining({
          number: saved.numbers[0],
          branch: branch.code,
          reason: "EXISTING_STOCK",
          comment: null,
          lines: [{ variantId: chairs.variantId, qty: "200", unitCost: "150000" }],
        }),
      }),
    ]);
  });

  it("101 rows are two documents with consecutive numbers, the lines in the order of their subtype ids (decided item 4)", async () => {
    const items = await Promise.all(Array.from({ length: 101 }, () => goods()));
    const saved = savedOf(
      await runAction(
        importStock,
        head,
        input(
          importSheet(
            "stock",
            items.map((item) => row(item.name, 1)),
          ),
        ),
      ),
    );
    expect(saved.numbers).toEqual([`ENT-${branch.code}-31-0001`, `ENT-${branch.code}-31-0002`]);
    const lines = await db.execute<{ number: string; variant_id: string }>(sql`
      select d.number, l.variant_id from stock_document_lines l
      join stock_documents d on d.id = l.document_id where d.branch_id = ${branch.id}`);
    const byNumber = (number: string) =>
      lines.rows.filter((line) => line.number === number).map((line) => line.variant_id);
    const sorted = items.map((item) => item.variantId).sort();
    expect(byNumber(saved.numbers[0]!).sort()).toEqual(sorted.slice(0, 100));
    expect(byNumber(saved.numbers[1]!)).toEqual(sorted.slice(100));
    expect(await written()).toMatchObject({ documents: 2, movements: 101, imports: 1 });
    const audits = await db.execute<{ count: number }>(sql`
      select count(*)::int as count from audit_log a
      join stock_documents d on d.id::text = a.entity_id
      where d.branch_id = ${branch.id} and a.action = 'direct_entry.create'`);
    expect(audits.rows[0]!.count).toBe(2);
  });
});

describe("the cost of an imported row (09 Direct entry, Lines; plan of 5.9, decided item 1, Look first)", () => {
  it("an empty cost takes the subtype's reference price; a typed 0 is 0", async () => {
    const priced = await goods({ referencePrice: 12000n });
    const free = await goods({ referencePrice: 12000n });
    savedOf(
      await runAction(
        importStock,
        head,
        input(importSheet("stock", [row(priced.name, 10, null), row(free.name, 10, 0)])),
      ),
    );
    expect(await stockOf(priced.variantId)).toEqual({ qty: "10.000", avg_cost: "12000" });
    expect(await stockOf(free.variantId)).toEqual({ qty: "10.000", avg_cost: "0" });
  });

  it("a subtype's own reference price, not another's", async () => {
    const paper = await insertProduct();
    const [a4, a3] = await insertSubtypes(paper.id, [
      { name: "A4", referencePrice: 45000n },
      { name: "A3", referencePrice: 90000n },
    ]);
    savedOf(
      await runAction(
        importStock,
        head,
        input(
          importSheet("stock", [row(paper.name, 2, null, "A3"), row(paper.name, 1, null, "A4")]),
        ),
      ),
    );
    expect(await stockOf(a3!)).toEqual({ qty: "2.000", avg_cost: "90000" });
    expect(await stockOf(a4!)).toEqual({ qty: "1.000", avg_cost: "45000" });
  });

  it("an empty cost with no reference price is required, and nothing is saved", async () => {
    const unpriced = await goods({ referencePrice: null });
    const priced = await goods({ referencePrice: 5000n });
    expect(
      await runAction(
        importStock,
        head,
        input(importSheet("stock", [row(priced.name, 1, null), row(unpriced.name, 1, null)])),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { "3:cost": "errors.field.required" } },
    });
    expect(await written()).toMatchObject({ documents: 0, movements: 0, balances: 0 });
  });

  it("enters the moving average like a receipt (Decided ahead, question 12): 10 at 10 000 and 10 at 12 000 is 11 000", async () => {
    const chairs = await goods({ referencePrice: 12000n });
    await receive(branch.id, chairs.variantId, "10", 10000n, head);
    expect(await stockOf(chairs.variantId)).toEqual({ qty: "10.000", avg_cost: "10000" });
    savedOf(
      await runAction(importStock, head, input(importSheet("stock", [row(chairs.name, 10, null)]))),
    );
    expect(await stockOf(chairs.variantId)).toEqual({ qty: "20.000", avg_cost: "11000" });
  });
});

describe('the rules of a direct-entry line, row by row (09 Direct entry; A7; 04 rule 2; edge case "Half a piece")', () => {
  it("a service, an inactive subtype, an inactive product and half a piece are each their row's error; nothing is saved", async () => {
    const good = await goods();
    const service = await insertProduct({ type: "SERVICE" });
    const paper = await insertProduct();
    await insertSubtypes(paper.id, [{ name: "A4" }, { name: "A5", isActive: false }]);
    const closed = await insertProduct({ isActive: false });
    const pieces = await goods({ allowDecimal: false });
    const sheet = importSheet("stock", [
      row(good.name, 1),
      row(service.name, 1),
      row(paper.name, 1, 1000, "A5"),
      row(closed.name, 1),
      row(pieces.name, 2.5),
    ]);
    expect(await runAction(importStock, head, input(sheet))).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        fields: {
          "3:name": "errors.field.notAllowed",
          "4:subtype": "errors.field.inactive",
          "5:name": "errors.field.inactive",
          "6:qty": "errors.field.wholeOnly",
        },
      },
    });
    expect(await written()).toMatchObject({ documents: 0, movements: 0, balances: 0 });
  });

  it("a decimal quantity where the measure allows it is entered exactly", async () => {
    const sugar = await goods({ allowDecimal: true });
    savedOf(
      await runAction(importStock, head, input(importSheet("stock", [row(sugar.name, 2.5)]))),
    );
    expect(await stockOf(sugar.variantId)).toMatchObject({ qty: "2.500" });
  });

  it("an empty subtype of a product with subtypes is required; a subtype it does not have is unknown", async () => {
    const paper = await insertProduct();
    await insertSubtypes(paper.id, [{ name: "A4" }]);
    expect(
      await runAction(
        importStock,
        head,
        input(importSheet("stock", [row(paper.name, 1), row(paper.name, 1, 1000, "A0")])),
      ),
    ).toMatchObject({
      ok: false,
      error: {
        fields: { "2:subtype": "errors.field.required", "3:subtype": "errors.field.unknown" },
      },
    });
  });

  it("an inactive branch is refused (decided item 5 of 5.8)", async () => {
    const chairs = await goods();
    await db.execute(sql`update branches set is_active = false where id = ${branch.id}`);
    expect(
      await runAction(importStock, head, input(importSheet("stock", [row(chairs.name, 1)]))),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { branchId: "errors.field.branchInactive" } },
    });
    expect(await written()).toMatchObject({ documents: 0, imports: 0 });
  });

  it("a file that is not the template is refused", async () => {
    const sheet: ImportSheet = {
      header: [{ kind: "text", text: "Nomi" }],
      rows: [{ row: 2, cells: [{ kind: "text", text: "Stul" }] }],
    };
    expect(await runAction(importStock, head, input(sheet))).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { file: "errors.field.notTemplate" } },
    });
  });
});

describe("a product renamed between the preview and the save (plan of 5.9, review must fix 3)", () => {
  it("its row is unknown and nothing is saved, though a product of another name holds its subtype", async () => {
    const chairs = await goods();
    const sheet = importSheet("stock", [row(chairs.name, 3)]);
    await db.execute(
      sql`update products set name = ${`${chairs.name} eski`} where id = ${chairs.id}`,
    );
    expect(await runAction(importStock, head, input(sheet))).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { "2:name": "errors.field.unknown" } },
    });
    expect(await stockOf(chairs.variantId)).toBeNull();
  });
});

describe("the same file twice (developer-rules.md rule 8; plan of 5.9, review must fixes 1 and 2)", () => {
  it("the same key gives the first answer with its numbers and writes nothing more", async () => {
    const items = await Promise.all(Array.from({ length: 101 }, () => goods()));
    const typed = input(
      importSheet(
        "stock",
        items.map((item) => row(item.name, 1)),
      ),
    );
    const first = savedOf(await runAction(importStock, head, typed));
    const again = savedOf(await runAction(importStock, head, typed));
    expect(again).toEqual(first);
    expect(await written()).toMatchObject({ documents: 2, movements: 101, imports: 1 });
    expect(await stockOf(items[0]!.variantId)).toMatchObject({ qty: "1.000" });
  });

  it("the same key sent with another branch is not found, and nothing is written there", async () => {
    const chairs = await goods();
    const typed = input(importSheet("stock", [row(chairs.name, 1)]));
    savedOf(await runAction(importStock, head, typed));
    expect(await runAction(importStock, head, { ...typed, branchId: other.id })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await written(other.id)).toMatchObject({ documents: 0, imports: 0 });
  });

  it("the key of a catalog import is not found for a stock import", async () => {
    const chairs = await goods();
    const key = randomUUID();
    await db.execute(sql`
      insert into catalog_imports (kind, file_name, row_count, created_by, client_key, created_at)
      values ('PRICES', 'narxlar.xlsx', 1, ${head}, ${key}, ${AT}::timestamptz)`);
    expect(
      await runAction(
        importStock,
        head,
        input(importSheet("stock", [row(chairs.name, 1)]), { clientKey: key }),
      ),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await written()).toMatchObject({ documents: 0 });
  });
});
