import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { updateProduct } from "@/features/catalog/actions/products";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertProduct, insertSubtypes, insertUnit } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { directEntryBranchChoices } from "../queries/direct-entry-form";
import { getItemCard } from "../queries/item-card";
import { type DirectEntryInput, enterStockDirectly } from "./direct-entry";

// Direct entry by the Head (build plan 5.8; plan of 5.8, Tests). Spec: 09-warehouse.md (Direct
// entry by the Head: the table and rules 2 and 4; Stock value); 15-quality-and-acceptance.md S15;
// 03-roles-and-permissions.md, Permission matrix "Enter stock directly, without an order"; Decided
// ahead, question 12; 04-catalogs.md, Catalogs table "Type and measure lock after first use";
// developer-rules.md rules 3 and 8. Every fixture is asserted (D38); the rows that must not count
// stand beside the ones that do (D40).

const AT = "2031-05-03T06:00:00Z";

let branch: { id: string; code: string };
let head: string;

beforeEach(async () => {
  setClock(AT);
  branch = await insertBranch();
  head = (await insertUser("HEAD")).id;
});

async function goods(options: { allowDecimal?: boolean; referencePrice?: bigint } = {}) {
  const unit = await insertUnit({ allowDecimal: options.allowDecimal ?? false });
  const product = await insertProduct({
    unitId: unit.id,
    referencePrice: options.referencePrice ?? null,
  });
  return { ...product, variantId: product.defaultVariantId };
}

function entry(
  variantId: string,
  overrides: Partial<DirectEntryInput> & { qty?: string; unitCost?: string } = {},
): DirectEntryInput {
  const { qty = "200", unitCost = "150000", ...rest } = overrides;
  return {
    clientKey: randomUUID(),
    branchId: branch.id,
    docDate: "2031-05-03",
    reason: "EXISTING_STOCK",
    comment: null,
    lines: [{ variantId, qty, unitCost }],
    ...rest,
  };
}

async function stockOf(variantId: string, branchId = branch.id) {
  const found = await db.execute<{ qty: string; avg_cost: string }>(sql`
    select qty::text as qty, avg_cost::text as avg_cost from stock_balances
    where branch_id = ${branchId} and variant_id = ${variantId}`);
  return found.rows[0] ?? null;
}

async function countsOf(branchId: string) {
  const found = await db.execute<{ documents: number; movements: number; audits: number }>(sql`
    select
      (select count(*)::int from stock_documents where branch_id = ${branchId}) as documents,
      (select count(*)::int from stock_movements where branch_id = ${branchId}) as movements,
      (select count(*)::int from audit_log a
        join stock_documents d on d.id::text = a.entity_id
        where d.branch_id = ${branchId} and a.action like 'direct_entry.%') as audits`);
  return found.rows[0]!;
}

describe("S15: the Head enters 200 chairs CHL already owns; a Manager cannot (15 S15; 09 Direct entry 2 and 4)", () => {
  it("stock +200, the ENT number, Direct entry on the item card and one audit row", async () => {
    const chairs = await goods({ referencePrice: 150000n });
    const result = await runAction(enterStockDirectly, head, entry(chairs.variantId));
    expect(result).toMatchObject({ ok: true });
    const { documentId, number } = (
      result as { ok: true; data: { documentId: string; number: string } }
    ).data;
    expect(number).toBe(`ENT-${branch.code}-31-0001`);
    expect(await stockOf(chairs.variantId)).toEqual({ qty: "200.000", avg_cost: "150000" });

    const document = await db.execute<{ type: string; status: string; reason: string }>(
      sql`select type, status, reason from stock_documents where id = ${documentId}`,
    );
    expect(document.rows[0]).toEqual({
      type: "DIRECT_ENTRY",
      status: "POSTED",
      reason: "EXISTING_STOCK",
    });

    const card = await getItemCard(head, chairs.variantId, branch.id);
    expect(card!.movements[0]).toMatchObject({
      type: "DIRECT_ENTRY",
      qtyDelta: "200.000",
      documentNumber: number,
      documentId,
    });

    const audits = await db.execute<{ action: string; actor_id: string; after: unknown }>(sql`
      select action, actor_id, after from audit_log where entity_id = ${documentId}`);
    expect(audits.rows).toHaveLength(1);
    expect(audits.rows[0]).toMatchObject({
      action: "direct_entry.create",
      actor_id: head,
      after: {
        number,
        branch: branch.code,
        reason: "EXISTING_STOCK",
        lines: [{ variantId: chairs.variantId, qty: "200", unitCost: "150000" }],
      },
    });
  });

  it("a Manager of CHL with every right on is refused: no stock, document, movement or audit row; no button", async () => {
    const chairs = await goods({ referencePrice: 150000n });
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    await receive(branch.id, chairs.variantId, "3", 150000n, head);
    const result = await runAction(enterStockDirectly, manager.id, entry(chairs.variantId));
    expect(result).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await stockOf(chairs.variantId)).toEqual({ qty: "3.000", avg_cost: "150000" });
    expect(await countsOf(branch.id)).toEqual({ documents: 0, movements: 1, audits: 0 });
    // The Stock on hand button reads these choices (mayUse() is false on a refusal).
    await expect(directEntryBranchChoices(manager.id)).rejects.toMatchObject({
      kind: "forbidden",
    });
  });
});

describe("the cost of a direct entry (Decided ahead, question 12; plan of 5.8, decided item 1)", () => {
  it("enters the moving average like a receipt: 10 at 1 000 and 10 at 3 000 give 2 000", async () => {
    const item = await goods();
    await receive(branch.id, item.variantId, "10", 1000n, head);
    expect(await stockOf(item.variantId)).toEqual({ qty: "10.000", avg_cost: "1000" });
    const result = await runAction(
      enterStockDirectly,
      head,
      entry(item.variantId, { qty: "10", unitCost: "3 000" }),
    );
    expect(result).toMatchObject({ ok: true });
    expect(await stockOf(item.variantId)).toEqual({ qty: "20.000", avg_cost: "2000" });
  });

  it("takes a gift at 0; refuses an empty, negative or fractional cost", async () => {
    const item = await goods();
    await receive(branch.id, item.variantId, "10", 1000n, head);
    expect(
      await runAction(
        enterStockDirectly,
        head,
        entry(item.variantId, { qty: "10", unitCost: "0", reason: "GIFT" }),
      ),
    ).toMatchObject({ ok: true });
    expect(await stockOf(item.variantId)).toEqual({ qty: "20.000", avg_cost: "500" });

    for (const [unitCost, kind] of [
      ["", "errors.field.required"],
      ["-5", "errors.field.wrongFormat"],
      ["12.5", "errors.field.wrongFormat"],
    ] as const) {
      expect(
        await runAction(enterStockDirectly, head, entry(item.variantId, { unitCost })),
      ).toMatchObject({
        ok: false,
        error: { code: "invalid_input", fields: { "lines.0.unitCost": kind } },
      });
    }
    expect(await stockOf(item.variantId)).toEqual({ qty: "20.000", avg_cost: "500" });
  });
});

describe("the fields of a direct entry (09 Direct entry: Branch, Date, Reason, Lines, Comment)", () => {
  it("Other needs a comment; with one it is taken", async () => {
    const item = await goods();
    expect(
      await runAction(enterStockDirectly, head, entry(item.variantId, { reason: "OTHER" })),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { comment: "errors.field.required" } },
    });
    expect(
      await runAction(
        enterStockDirectly,
        head,
        entry(item.variantId, { reason: "OTHER", comment: "   " }),
      ),
    ).toMatchObject({ ok: false, error: { fields: { comment: "errors.field.required" } } });
    expect(await stockOf(item.variantId)).toBeNull();
    expect(
      await runAction(
        enterStockDirectly,
        head,
        entry(item.variantId, { reason: "OTHER", comment: "Eski ombordan topildi" }),
      ),
    ).toMatchObject({ ok: true });
  });

  it("a reason outside the direct entry's list is refused", async () => {
    const item = await goods();
    const result = await runAction(enterStockDirectly, head, {
      ...entry(item.variantId),
      reason: "DAMAGED",
    } as unknown as DirectEntryInput);
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(await stockOf(item.variantId)).toBeNull();
  });

  it("refuses a date tomorrow and takes today and a past day", async () => {
    const item = await goods();
    expect(
      await runAction(enterStockDirectly, head, entry(item.variantId, { docDate: "2031-05-04" })),
    ).toMatchObject({ ok: false, error: { fields: { docDate: "errors.field.inFuture" } } });
    for (const docDate of ["2031-05-03", "2030-09-01"]) {
      expect(
        await runAction(enterStockDirectly, head, entry(item.variantId, { docDate })),
      ).toMatchObject({ ok: true });
    }
  });

  it("enters any active branch, and refuses an inactive one", async () => {
    const item = await goods();
    const elsewhere = await insertBranch();
    const closed = await insertBranch({ isActive: false });
    expect(
      await runAction(enterStockDirectly, head, entry(item.variantId, { branchId: elsewhere.id })),
    ).toMatchObject({ ok: true });
    expect((await stockOf(item.variantId, elsewhere.id))?.qty).toBe("200.000");
    expect(
      await runAction(enterStockDirectly, head, entry(item.variantId, { branchId: closed.id })),
    ).toMatchObject({ ok: false, error: { fields: { branchId: "errors.field.branchInactive" } } });
    expect(await stockOf(item.variantId, closed.id)).toBeNull();
  });

  it("refuses a service, an inactive subtype, a decimal of a whole measure and a subtype twice", async () => {
    const service = await insertProduct({ type: "SERVICE" });
    expect(
      await runAction(enterStockDirectly, head, entry(service.defaultVariantId)),
    ).toMatchObject({
      ok: false,
      error: { fields: { "lines.0.variantId": "errors.field.notAllowed" } },
    });

    const product = await insertProduct();
    const [, dropped] = await insertSubtypes(product.id, [
      { name: "Bor" },
      { name: "Yo'q", isActive: false },
    ]);
    expect(await runAction(enterStockDirectly, head, entry(dropped!))).toMatchObject({
      ok: false,
      error: { fields: { "lines.0.variantId": "errors.field.inactive" } },
    });

    const whole = await goods();
    expect(
      await runAction(enterStockDirectly, head, entry(whole.variantId, { qty: "2.5" })),
    ).toMatchObject({ ok: false, error: { fields: { "lines.0.qty": "errors.field.wholeOnly" } } });
    const decimal = await goods({ allowDecimal: true });
    expect(
      await runAction(enterStockDirectly, head, entry(decimal.variantId, { qty: "2.5" })),
    ).toMatchObject({ ok: true });

    const twice = await runAction(enterStockDirectly, head, {
      ...entry(whole.variantId),
      lines: [
        { variantId: whole.variantId, qty: "1", unitCost: "100" },
        { variantId: whole.variantId, qty: "2", unitCost: "100" },
      ],
    });
    expect(twice).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(await stockOf(whole.variantId)).toBeNull();
  });
});

describe("the same browser id twice (developer-rules.md rule 8)", () => {
  it("returns the first number and writes one document", async () => {
    const item = await goods();
    const input = entry(item.variantId);
    const first = await runAction(enterStockDirectly, head, input);
    const second = await runAction(enterStockDirectly, head, input);
    expect(first).toMatchObject({ ok: true });
    expect(second).toEqual(first);
    expect(await stockOf(item.variantId)).toMatchObject({ qty: "200.000" });
    expect(await countsOf(branch.id)).toEqual({ documents: 1, movements: 1, audits: 1 });
  });
});

describe("a product's first direct entry locks its type and measure (04 Catalogs table; build plan 5.8)", () => {
  it("the measure changes before the entry and is refused after it", async () => {
    const item = await goods();
    const before = await insertUnit();
    expect(await runAction(updateProduct, head, { id: item.id, unitId: before.id })).toMatchObject({
      ok: true,
      data: { changed: ["unitId"] },
    });

    expect(await runAction(enterStockDirectly, head, entry(item.variantId))).toMatchObject({
      ok: true,
    });

    const after = await insertUnit();
    expect(
      await runAction(updateProduct, head, { id: item.id, type: "SERVICE", unitId: after.id }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        fields: { type: "errors.field.locked", unitId: "errors.field.locked" },
      },
    });
  });
});
