import { desc, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { newClientKey } from "@/components/client-key";
import { defineAction, runAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import { auditLog, priceHistory, productVariants } from "@/server/db/schema";

import { advanceClock, setClock } from "../../../../tests/helpers/clock";
import {
  insertCategory,
  insertProduct,
  insertSubtypes,
  insertUnit,
} from "../../../../tests/helpers/catalog";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { type AddedPrice, addPrice } from "./prices";
import { createProduct } from "./products";
import { createSubtype } from "./subtypes";

// build-plan 1.9, Done when: "a new price keeps the old one in the history with who and when;
// only the Head can add one". 04-catalogs.md rule 4 (price memory), rule 1 (the hidden default),
// rule 9 (change history); 03-roles-and-permissions.md, Permission matrix: "Add a new price for a
// product"; A14; developer-rules.md rules 3, 6, 8; plan of 1.9, decisions 1, 4, 5, 7, 8, 11 and the
// plan review's correction 1. Every fixture is asserted (D38); every passing case has the refused
// data beside it (D40).

function expectOk<T>(result: ActionResult<T>): T {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
}

function tryPrice(userId: string, variantId: string, input: Record<string, unknown> = {}) {
  return runAction(addPrice, userId, {
    clientKey: newClientKey(),
    variantId,
    price: "60 000",
    note: "Yetkazib beruvchi narxni oshirdi",
    ...input,
  }) as Promise<ActionResult<AddedPrice>>;
}

async function historyOf(variantId: string) {
  return db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.variantId, variantId))
    .orderBy(desc(priceHistory.seq));
}

async function priceOf(variantId: string) {
  const [row] = await db
    .select({ price: productVariants.referencePrice })
    .from(productVariants)
    .where(eq(productVariants.id, variantId));
  return row!.price;
}

describe("a new price (04 rule 4; build-plan 1.9 Done when)", () => {
  it("keeps the old one in the history with who and when, and becomes the reference price", async () => {
    const first = await insertUser("HEAD");
    const second = await insertUser("HEAD");
    setClock("2031-05-02T04:00:00Z");
    const created = expectOk(
      await runAction(createProduct, first.id, {
        clientKey: newClientKey(),
        name: `Qog'oz A4 ${newClientKey().slice(0, 8)}`,
        categoryId: (await insertCategory()).id,
        unitId: (await insertUnit()).id,
        referencePrice: "50 000",
      }),
    ) as { id: string };
    const [variant] = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.productId, created.id));
    advanceClock({ days: 30 });
    const added = expectOk(await tryPrice(second.id, variant!.id, { price: "60 000" }));
    expect(added).toMatchObject({ variantId: variant!.id, referencePrice: 60_000n });

    expect(await priceOf(variant!.id)).toBe(60_000n);
    const rows = await historyOf(variant!.id);
    expect(rows).toMatchObject([
      {
        price: 60_000n,
        source: "HEAD",
        note: "Yetkazib beruvchi narxni oshirdi",
        setBy: second.id,
        purchaseId: null,
        createdAt: new Date("2031-06-01T04:00:00Z"),
      },
      {
        price: 50_000n,
        source: "HEAD",
        note: null,
        setBy: first.id,
        createdAt: new Date("2031-05-02T04:00:00Z"),
      },
    ]);
  });

  it("writes the audit row price.add with the price before and after and the note (04 rule 9)", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct({ referencePrice: 50_000n });
    expectOk(await tryPrice(head.id, product.defaultVariantId, { note: "  Bozor narxi  " }));
    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, product.defaultVariantId));
    expect(rows).toMatchObject([
      {
        action: "price.add",
        entity: "product_variants",
        actorId: head.id,
        before: { productId: product.id, product: product.name, referencePrice: "50000" },
        after: {
          productId: product.id,
          product: product.name,
          referencePrice: "60000",
          note: "Bozor narxi",
        },
      },
    ]);
  });

  it("the hidden default of a product without subtypes takes a new price (04 rule 1; decision 5)", async () => {
    const head = await insertUser("HEAD");
    const plain = await insertProduct();
    expectOk(await tryPrice(head.id, plain.defaultVariantId, { price: "12 500" }));
    expect(await priceOf(plain.defaultVariantId)).toBe(12_500n);
    expect(await historyOf(plain.defaultVariantId)).toHaveLength(1);
  });

  it("a real subtype takes a new price; its siblings keep theirs (A14: one price per subtype)", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct();
    const [a, b] = await insertSubtypes(product.id, [
      { referencePrice: 10_000n },
      { referencePrice: 20_000n },
    ]);
    expectOk(await tryPrice(head.id, a!, { price: "11 000" }));
    expect(await priceOf(a!)).toBe(11_000n);
    expect(await priceOf(b!)).toBe(20_000n);
    expect(await historyOf(b!)).toHaveLength(1);
  });

  it("the same price again and an inactive subtype are recorded too (decision 7)", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct({ referencePrice: 50_000n, isActive: false });
    expectOk(
      await tryPrice(head.id, product.defaultVariantId, { price: "50000", note: "Tekshirildi" }),
    );
    expect(await priceOf(product.defaultVariantId)).toBe(50_000n);
    expect((await historyOf(product.defaultVariantId)).map((row) => row.price)).toEqual([
      50_000n,
      50_000n,
    ]);
  });

  it("the history keeps the subtype made from the default (1.8 decision 1): same id, one list", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct({ referencePrice: 50_000n });
    expectOk(await tryPrice(head.id, product.defaultVariantId, { price: "55 000" }));
    const made = expectOk(
      await runAction(createSubtype, head.id, {
        clientKey: newClientKey(),
        productId: product.id,
        name: "Oq",
      }),
    ) as { entry: { id: string; referencePrice: bigint } };
    expect(made.entry).toMatchObject({ id: product.defaultVariantId, referencePrice: 55_000n });
    expect((await historyOf(made.entry.id)).map((row) => row.price)).toEqual([55_000n, 50_000n]);
  });
});

describe("what a new price must carry (04 rule 4; decision 8; developer-rules rule 6)", () => {
  it("the note is required: missing, empty, blank or longer than 200 is refused; nothing is written", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct({ referencePrice: 50_000n });
    for (const note of [undefined, "", "   ", "a".repeat(201)]) {
      expect(await tryPrice(head.id, product.defaultVariantId, { note })).toMatchObject({
        ok: false,
        error: { code: "invalid_input", fields: { note: expect.any(String) } },
      });
    }
    expectOk(await tryPrice(head.id, product.defaultVariantId, { note: "a".repeat(200) }));
    expect(await historyOf(product.defaultVariantId)).toHaveLength(2);
  });

  it("the price is whole so'm, more than 0: 0, -1, 1.5, a word or none is refused", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct({ referencePrice: 50_000n });
    for (const price of ["0", "-1", "1.5", "ellik", "", undefined]) {
      expect(await tryPrice(head.id, product.defaultVariantId, { price })).toMatchObject({
        ok: false,
        error: { code: "invalid_input", fields: { price: expect.any(String) } },
      });
    }
    expect(await priceOf(product.defaultVariantId)).toBe(50_000n);
    expect(await historyOf(product.defaultVariantId)).toHaveLength(1);
    expectOk(await tryPrice(head.id, product.defaultVariantId, { price: "1" }));
    expect(await priceOf(product.defaultVariantId)).toBe(1n);
  });

  it("an unknown subtype is not found", async () => {
    const head = await insertUser("HEAD");
    expect(await tryPrice(head.id, newClientKey())).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });

  it("the same client key twice gives the first result and one row (rule 8)", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct({ referencePrice: 50_000n });
    const clientKey = newClientKey();
    const first = expectOk(
      await tryPrice(head.id, product.defaultVariantId, { clientKey, price: "60000" }),
    );
    const again = expectOk(
      await tryPrice(head.id, product.defaultVariantId, { clientKey, price: "70000" }),
    );
    expect(again).toEqual(first);
    expect(await priceOf(product.defaultVariantId)).toBe(60_000n);
    expect(await historyOf(product.defaultVariantId)).toHaveLength(2);
    // Another Head with the same key finds nothing of theirs (decisions 0.12, item 6).
    const other = await insertUser("HEAD");
    expect(
      await tryPrice(other.id, product.defaultVariantId, { clientKey, price: "80000" }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("a step after the price, its row and the audit row that fails leaves none of them (rule 3)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const head = await insertUser("HEAD");
    const product = await insertProduct({ referencePrice: 50_000n });
    const failing = defineAction({
      ...addPrice,
      async notify() {
        throw new Error("invented failure");
      },
    });
    expect(
      await runAction(failing, head.id, {
        clientKey: newClientKey(),
        variantId: product.defaultVariantId,
        price: "60000",
        note: "Yangi narx",
      }),
    ).toMatchObject({ ok: false, error: { code: "unexpected" } });
    expect(await priceOf(product.defaultVariantId)).toBe(50_000n);
    expect(await historyOf(product.defaultVariantId)).toHaveLength(1);
    expect(
      await db.select().from(auditLog).where(eq(auditLog.entityId, product.defaultVariantId)),
    ).toEqual([]);
    vi.restoreAllMocks();
  });

  it("two prices at one frozen moment: both kept in order, the later current (decision 11)", async () => {
    const head = await insertUser("HEAD");
    setClock("2031-05-02T04:00:00Z");
    const product = await insertProduct({ referencePrice: 50_000n });
    expectOk(await tryPrice(head.id, product.defaultVariantId, { price: "60000" }));
    expectOk(await tryPrice(head.id, product.defaultVariantId, { price: "70000" }));
    expect(await priceOf(product.defaultVariantId)).toBe(70_000n);
    expect((await historyOf(product.defaultVariantId)).map((row) => row.price)).toEqual([
      70_000n,
      60_000n,
      50_000n,
    ]);
  });
});

describe("prices written by the catalog actions (plan of 1.9, decision 1, Look first)", () => {
  async function names() {
    return { categoryId: (await insertCategory()).id, unitId: (await insertUnit()).id };
  }

  it("a product created with a price has one HEAD row with no note; without a price none", async () => {
    const head = await insertUser("HEAD");
    for (const [referencePrice, expected] of [
      ["50 000", [50_000n]],
      ["", []],
    ] as const) {
      const created = expectOk(
        await runAction(createProduct, head.id, {
          clientKey: newClientKey(),
          name: `Mahsulot ${newClientKey().slice(0, 8)}`,
          ...(await names()),
          referencePrice,
        }),
      ) as { id: string };
      const [variant] = await db
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(eq(productVariants.productId, created.id));
      const rows = await historyOf(variant!.id);
      expect(rows.map((row) => row.price)).toEqual(expected);
      for (const row of rows) expect(row).toMatchObject({ note: null, setBy: head.id });
    }
  });

  it("a new subtype with a price has one row; the first subtype taking a price has one; keeping the default's adds none", async () => {
    const head = await insertUser("HEAD");
    const add = async (productId: string, referencePrice?: string) =>
      (
        expectOk(
          await runAction(createSubtype, head.id, {
            clientKey: newClientKey(),
            productId,
            name: `Turi ${newClientKey().slice(0, 8)}`,
            referencePrice,
          }),
        ) as { entry: { id: string } }
      ).entry.id;

    // The default held none: the first subtype's price gets its row.
    const unpriced = await insertProduct();
    const taking = await add(unpriced.id, "30 000");
    expect((await historyOf(taking)).map((row) => row.price)).toEqual([30_000n]);
    // A later subtype with a price, and one without.
    const later = await add(unpriced.id, "20 000");
    expect((await historyOf(later)).map((row) => row.price)).toEqual([20_000n]);
    expect(await historyOf(await add(unpriced.id))).toEqual([]);
    // The default held 40 000: the first subtype keeps it and its one row.
    const priced = await insertProduct({ referencePrice: 40_000n });
    const keeping = await add(priced.id);
    expect(keeping).toBe(priced.defaultVariantId);
    expect((await historyOf(keeping)).map((row) => row.price)).toEqual([40_000n]);
  });
});

function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const { code } = result.error;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

// "Add a new price for a product": the Head only (03, Permission matrix; decision 4, Look first).
// A refused call leaves the price and the history as they were (plan review, correction 1).
describePermissionMatrix("addPrice", {
  permission: "price.add",
  async run({ user }) {
    const product = await insertProduct({ referencePrice: 50_000n });
    const result = await tryPrice(user.id, product.defaultVariantId, { price: "60000" });
    const rows = await historyOf(product.defaultVariantId);
    if (result.ok) {
      expect(await priceOf(product.defaultVariantId)).toBe(60_000n);
      expect(rows).toHaveLength(2);
    } else {
      expect(await priceOf(product.defaultVariantId)).toBe(50_000n);
      expect(rows).toHaveLength(1);
    }
    asMatrixAnswer(result);
  },
});
