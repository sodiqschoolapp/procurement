import { randomUUID } from "node:crypto";

import { count, eq, inArray } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { newClientKey } from "@/components/client-key";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import {
  auditLog,
  catalogImports,
  priceHistory,
  productVariants,
  products,
} from "@/server/db/schema";

import { insertCategory, insertCompany, insertUnit } from "../../../../tests/helpers/catalog";
import { importSheet, productRow } from "../../../../tests/helpers/imports";
import { insertUser } from "../../../../tests/helpers/users";

// developer-rules.md rule 3 ("If any step fails, nothing is saved"; its table: "Database tests: a
// failing step leaves nothing saved"); build-plan 1.10: "saving only when every row is valid, in
// one transaction"; spec review of the plan of 1.10, Must fix 3. The shared insert of products is
// replaced so the 30th product throws after 29 were written, with their default subtypes, price
// rows and subtypes: nothing of the 29 may stay. No real failure reaches that point once every row
// is checked, which is why the module is replaced (as product-lock.db.test.ts does).

const calls = vi.hoisted(() => ({ count: 0, failAt: Number.POSITIVE_INFINITY }));

vi.mock("./products", async (importOriginal) => {
  const original = await importOriginal<typeof import("./products")>();
  return {
    ...original,
    async insertProduct(...args: Parameters<typeof original.insertProduct>) {
      calls.count += 1;
      if (calls.count === calls.failAt) throw new Error("Invented failure after earlier rows.");
      return original.insertProduct(...args);
    },
  };
});

const { importProducts } = await import("./imports");

describe("importProducts: a failure after 29 rows leaves nothing (developer-rules.md rule 3)", () => {
  it("no product, subtype, price row, audit row or import record of the file remains", async () => {
    const head = await insertUser("HEAD");
    const refs = {
      category: (await insertCategory()).name,
      measure: (await insertUnit()).name,
      company: (await insertCompany()).name,
    };
    const prefix = `Mahsulot ${randomUUID().slice(0, 8)}`;
    const names = Array.from({ length: 30 }, (_, at) => `${prefix} ${at + 1}`);
    // Every other product has two subtypes with prices, so subtypes and price rows were written
    // before the failure too.
    const rows = names.flatMap((name, at) =>
      at % 2 === 0
        ? [productRow(name, refs, { price: 1000 })]
        : [
            productRow(name, refs, { subtype: "Katta", price: 2000 }),
            productRow(name, refs, { subtype: "Kichik", price: 1500 }),
          ],
    );
    const input = {
      clientKey: newClientKey(),
      fileName: "x.xlsx",
      sheet: importSheet("products", rows),
    };
    calls.count = 0;
    calls.failAt = 30;

    expect(await runAction(importProducts, head.id, input)).toMatchObject({
      ok: false,
      error: { code: "unexpected" },
    });
    expect(calls.count).toBe(30);
    expect(await db.select().from(products).where(inArray(products.name, names))).toEqual([]);
    const [variants] = await db
      .select({ n: count() })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(inArray(products.name, names));
    expect(variants!.n).toBe(0);
    const [prices] = await db
      .select({ n: count() })
      .from(priceHistory)
      .where(eq(priceHistory.setBy, head.id));
    expect(prices!.n).toBe(0);
    const [audits] = await db
      .select({ n: count() })
      .from(auditLog)
      .where(eq(auditLog.actorId, head.id));
    expect(audits!.n).toBe(0);
    const [records] = await db
      .select({ n: count() })
      .from(catalogImports)
      .where(eq(catalogImports.clientKey, input.clientKey));
    expect(records!.n).toBe(0);

    // The same file with nothing failing saves all 30 (the fixture is sound).
    calls.count = 0;
    calls.failAt = Number.POSITIVE_INFINITY;
    expect(await runAction(importProducts, head.id, input)).toMatchObject({ ok: true });
    expect(await db.select().from(products).where(inArray(products.name, names))).toHaveLength(30);
  });
});
