import { randomUUID } from "node:crypto";

import { and, count, desc, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { newClientKey } from "@/components/client-key";
import type { ImportedPrice } from "@/domain/imports";
import { previewImport } from "@/features/catalog/queries/imports";
import { runAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import { auditLog, catalogImports, priceHistory, productVariants } from "@/server/db/schema";

import { insertProduct, insertSubtypes } from "../../../../tests/helpers/catalog";
import { type Value, importSheet } from "../../../../tests/helpers/imports";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { checkPriceImport } from "../imports/check";
import { addPrice } from "./prices";
import { importPrices } from "./imports";

// build-plan 1.11, Done when: "3 prices in one file give 3 history rows and 3 current prices; one
// unknown product fails the whole file". 04-catalogs.md rules 1, 3, 4, 7 and 9; developer-rules.md
// rules 3 and 8; plan of 1.11, its spec review and the review's corrections 1 and 3. Every fixture
// is asserted (D38); every passing case has the data a wrong write would touch beside it (D40).
// Names are invented.

const tag = () => randomUUID().slice(0, 8);

function expectOk<T>(result: ActionResult<T>): T {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
}

function pricesInput(rows: Value[][]) {
  return {
    clientKey: newClientKey(),
    fileName: "narxlar.xlsx",
    sheet: importSheet("prices", rows),
  };
}

function refusedWith(fields: Record<string, string>) {
  return {
    ok: false,
    error: { code: "invalid_input", messageKey: "errors.invalidInput", fields },
  };
}

async function priceOf(variantId: string) {
  const [row] = await db
    .select({ price: productVariants.referencePrice })
    .from(productVariants)
    .where(eq(productVariants.id, variantId));
  return row!.price;
}

async function historyOf(variantId: string) {
  return db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.variantId, variantId))
    .orderBy(desc(priceHistory.seq));
}

/** A product without subtypes at 10 000 and one with subtypes B1 20 000, B2 30 000, B3 40 000. */
async function catalog() {
  const plain = await insertProduct({ name: `Ruchka ${tag()}`, referencePrice: 10_000n });
  const withSubtypes = await insertProduct({ name: `Daftar ${tag()}` });
  const [b1, b2, b3] = await insertSubtypes(withSubtypes.id, [
    { name: "Katta", referencePrice: 20_000n },
    { name: "Oʻrta", referencePrice: 30_000n },
    { name: "Kichik", referencePrice: 40_000n },
  ]);
  expect([b1, b2, b3].every(Boolean)).toBe(true);
  return { plain, withSubtypes, b1: b1!, b2: b2!, b3: b3! };
}

describe("importPrices: all rows or none (04 rules 4 and 7; build-plan 1.11, Done when)", () => {
  it("3 prices give 3 HEAD history rows with note and Head, 3 current prices; B3 keeps its own", async () => {
    const head = await insertUser("HEAD");
    const { plain, withSubtypes, b1, b2, b3 } = await catalog();
    const input = pricesInput([
      [plain.name, null, 12_000, "Sentabr narxi"],
      [withSubtypes.name, "Katta", "21 000", "Sentabr narxi"],
      [withSubtypes.name.toUpperCase(), "  oʻrta ", 31_000, "Yangi yetkazuvchi"],
    ]);

    expect(expectOk(await runAction(importPrices, head.id, input))).toMatchObject({ rows: 3 });

    expect(await priceOf(plain.defaultVariantId)).toBe(12_000n);
    expect(await priceOf(b1)).toBe(21_000n);
    expect(await priceOf(b2)).toBe(31_000n);
    expect(await priceOf(b3)).toBe(40_000n);
    for (const [variantId, price, note] of [
      [plain.defaultVariantId, 12_000n, "Sentabr narxi"],
      [b1, 21_000n, "Sentabr narxi"],
      [b2, 31_000n, "Yangi yetkazuvchi"],
    ] as const) {
      // Exactly one new row on the one set before (spec review of the diff, Should fix 1).
      const rows = await historyOf(variantId);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        price,
        note,
        source: "HEAD",
        setBy: head.id,
        clientKey: null,
      });
    }
    expect(await historyOf(b3)).toHaveLength(1);

    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.actorId, head.id), eq(auditLog.action, "price.add")));
    expect(audits).toHaveLength(3);
    const [record] = await db
      .select()
      .from(catalogImports)
      .where(eq(catalogImports.clientKey, input.clientKey));
    expect(record).toMatchObject({ kind: "PRICES", rowCount: 3, createdBy: head.id });
  });

  it("one unknown product among valid rows saves nothing and names its row", async () => {
    const head = await insertUser("HEAD");
    const { plain, withSubtypes, b1 } = await catalog();
    const input = pricesInput([
      [plain.name, null, 12_000, "x"],
      [withSubtypes.name, "Katta", 21_000, "x"],
      [`Yoʻq mahsulot ${tag()}`, null, 5_000, "x"],
    ]);

    expect(await runAction(importPrices, head.id, input)).toEqual(
      refusedWith({ "4:name": "errors.field.unknown" }),
    );
    expect(await priceOf(plain.defaultVariantId)).toBe(10_000n);
    expect(await priceOf(b1)).toBe(20_000n);
    expect(await historyOf(plain.defaultVariantId)).toHaveLength(1);
    expect(await historyOf(b1)).toHaveLength(1);
    const [imports] = await db
      .select({ n: count() })
      .from(catalogImports)
      .where(eq(catalogImports.clientKey, input.clientKey));
    expect(imports!.n).toBe(0);
    const [audits] = await db
      .select({ n: count() })
      .from(auditLog)
      .where(eq(auditLog.actorId, head.id));
    expect(audits!.n).toBe(0);
  });

  it("a row the domain refuses is named by the input check with its kind", async () => {
    const head = await insertUser("HEAD");
    const { plain } = await catalog();
    expect(
      await runAction(importPrices, head.id, pricesInput([[plain.name, null, 0, null]])),
    ).toEqual(
      refusedWith({ "2:price": "errors.field.wrongFormat", "2:note": "errors.field.required" }),
    );
  });
});

describe("importPrices: which subtype a row names (04 rules 1 and 3; plan of 1.11, decision 6)", () => {
  it("an empty subtype of a product with subtypes is required; a named one of a product without, unknown", async () => {
    const head = await insertUser("HEAD");
    const { plain, withSubtypes, b1 } = await catalog();
    const other = await insertProduct({ name: `Qalam ${tag()}` });
    const [otherSubtype] = await insertSubtypes(other.id, [{ name: "Qizil" }]);
    expect(otherSubtype).toBeDefined();
    const input = pricesInput([
      [withSubtypes.name, null, 1_000, "x"],
      [plain.name, "Katta", 1_000, "x"],
      // The hidden default is never matched by its name (04 rule 1).
      [plain.name, "default", 1_000, "x"],
      // A subtype of another product.
      [withSubtypes.name, "Qizil", 1_000, "x"],
    ]);
    expect(await runAction(importPrices, head.id, input)).toEqual(
      refusedWith({
        "2:subtype": "errors.field.required",
        "3:subtype": "errors.field.unknown",
        "4:subtype": "errors.field.unknown",
        "5:subtype": "errors.field.unknown",
      }),
    );
    expect(await priceOf(b1)).toBe(20_000n);
    expect(await priceOf(plain.defaultVariantId)).toBe(10_000n);
  });

  it("a real subtype named Default gets its price (1.8 decision 6)", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct({ name: `Papka ${tag()}` });
    const [real, small] = await insertSubtypes(product.id, [
      { name: "Default", referencePrice: 7_000n },
      { name: "Kichik", referencePrice: 6_000n },
    ]);
    expectOk(
      await runAction(importPrices, head.id, pricesInput([[product.name, "default", 7_500, "x"]])),
    );
    expect(await priceOf(real!)).toBe(7_500n);
    expect(await priceOf(small!)).toBe(6_000n);
  });

  it("two rows the database resolves to one subtype: the second names the first (Should fix 1)", async () => {
    const { plain, withSubtypes } = await catalog();
    // Passed straight to the check, past the domain's own fold, as two names it could fold apart.
    const prices: ImportedPrice[] = [
      { row: 2, product: plain.name, subtype: null, price: 1n, note: "x" },
      { row: 3, product: plain.name.toUpperCase(), subtype: null, price: 2n, note: "x" },
      { row: 4, product: withSubtypes.name, subtype: "Katta", price: 3n, note: "x" },
      { row: 5, product: withSubtypes.name, subtype: "KATTA", price: 4n, note: "x" },
      { row: 6, product: withSubtypes.name, subtype: "Kichik", price: 5n, note: "x" },
    ];
    expect(await checkPriceImport(db, prices, { lock: false })).toEqual({
      errors: [
        { row: 3, column: "name", kind: "duplicateInFile", firstRow: 2 },
        { row: 5, column: "subtype", kind: "duplicateInFile", firstRow: 4 },
      ],
      targets: [],
    });
  });

  it("an inactive product or subtype gets its price, as by hand (1.9 decision 7)", async () => {
    const head = await insertUser("HEAD");
    const off = await insertProduct({
      name: `Eski ${tag()}`,
      referencePrice: 1_000n,
      isActive: false,
    });
    const product = await insertProduct({ name: `Savat ${tag()}` });
    const [offSubtype] = await insertSubtypes(product.id, [
      { name: "Eski", referencePrice: 2_000n, isActive: false },
    ]);
    expectOk(
      await runAction(
        importPrices,
        head.id,
        pricesInput([
          [off.name, null, 1_000, "Oʻsha narx"],
          [product.name, "Eski", 2_500, "x"],
        ]),
      ),
    );
    // The same price again is a new row too.
    expect(await historyOf(off.defaultVariantId)).toHaveLength(2);
    expect(await priceOf(off.defaultVariantId)).toBe(1_000n);
    expect(await priceOf(offSubtype!)).toBe(2_500n);
  });
});

describe("importPrices: the audit row is the one a price by hand writes (04 rule 9; correction 3)", () => {
  it("before and after have the same shape and values as addPrice's", async () => {
    const head = await insertUser("HEAD");
    const { withSubtypes, b1, b2 } = await catalog();
    expectOk(
      await runAction(addPrice, head.id, {
        clientKey: newClientKey(),
        variantId: b1,
        price: "25 000",
        note: "Qoʻlda",
      }),
    );
    expectOk(
      await runAction(
        importPrices,
        head.id,
        pricesInput([[withSubtypes.name, "Oʻrta", 35_000, "Fayldan"]]),
      ),
    );
    const rows = await db
      .select({
        entityId: auditLog.entityId,
        entity: auditLog.entity,
        before: auditLog.before,
        after: auditLog.after,
      })
      .from(auditLog)
      .where(and(eq(auditLog.action, "price.add"), inArray(auditLog.entityId, [b1, b2])));
    const byHand = rows.find((row) => row.entityId === b1)!;
    const byFile = rows.find((row) => row.entityId === b2)!;
    const parent = { productId: withSubtypes.id, product: withSubtypes.name };
    expect(byHand).toEqual({
      entityId: b1,
      entity: "product_variants",
      before: { ...parent, referencePrice: "20000" },
      after: { ...parent, referencePrice: "25000", note: "Qoʻlda" },
    });
    expect(byFile).toEqual({
      entityId: b2,
      entity: "product_variants",
      before: { ...parent, referencePrice: "30000" },
      after: { ...parent, referencePrice: "35000", note: "Fayldan" },
    });
  });
});

describe("importPrices: a safe repeat (developer-rules.md rule 8)", () => {
  it("the same client key twice gives the first result and saves once; another Head gets not found", async () => {
    const head = await insertUser("HEAD");
    const otherHead = await insertUser("HEAD");
    const { plain } = await catalog();
    const input = pricesInput([[plain.name, null, 11_000, "x"]]);
    const first = expectOk(await runAction(importPrices, head.id, input));
    expect(expectOk(await runAction(importPrices, head.id, input))).toMatchObject({
      importId: first.importId,
      rows: 1,
    });
    expect(await runAction(importPrices, otherHead.id, input)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await historyOf(plain.defaultVariantId)).toHaveLength(2);
  });
});

describe("previewImport of prices (04 rule 7: a preview with errors per row)", () => {
  it("shows every row with the database's errors and writes nothing", async () => {
    const head = await insertUser("HEAD");
    const { plain, withSubtypes } = await catalog();
    const preview = await previewImport(
      head.id,
      "prices",
      importSheet("prices", [
        [plain.name, null, 12_000, "x"],
        [withSubtypes.name, "Yoʻq", 1_000, "x"],
        [`Yoʻq ${tag()}`, null, 1_000, ""],
      ]),
    );
    expect(preview.rows.map((row) => row.row)).toEqual([2, 3, 4]);
    expect(preview.errors).toEqual([
      { row: 3, column: "subtype", kind: "unknown" },
      { row: 4, column: "name", kind: "unknown" },
      { row: 4, column: "note", kind: "required" },
    ]);
    expect(await priceOf(plain.defaultVariantId)).toBe(10_000n);
  });
});

/** The wrapper's refusal as the matrix reads it. */
function answerOf(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const { code } = result.error;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

describePermissionMatrix("importPrices", {
  permission: "price.add",
  async run({ user }) {
    const product = await insertProduct({ name: `Matritsa ${tag()}` });
    answerOf(
      await runAction(importPrices, user.id, pricesInput([[product.name, null, 1_000, "x"]])),
    );
  },
});

describePermissionMatrix("previewImport of prices", {
  permission: "price.add",
  async run({ user }) {
    await previewImport(user.id, "prices", importSheet("prices", [["Matritsa", null, 1, "x"]]));
  },
});
