import { randomUUID } from "node:crypto";

import { count, eq, inArray } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { newClientKey } from "@/components/client-key";
import { runAction } from "@/server/action";
import { db } from "@/server/db/client";
import { auditLog, catalogImports, priceHistory, productVariants } from "@/server/db/schema";

import { insertProduct } from "../../../../tests/helpers/catalog";
import { importSheet } from "../../../../tests/helpers/imports";
import { insertUser } from "../../../../tests/helpers/users";

// developer-rules.md rule 3 ("If any step fails, nothing is saved"; its table: "Database tests: a
// failing step leaves nothing saved"); build-plan 1.11; plan of 1.11, Tests, and its spec review,
// Should fix 5. No real input reaches a failure once every row is checked, so the shared price
// writer is replaced (as import-rollback.db.test.ts replaces insertProduct), in two ways:
// (a) the last row's write throws; (b) the last row sets `reference_price` without its HEAD row,
// which the deferred check `price_recorded` of migration 0014 refuses at the commit. Either way no
// earlier row's price, history row, audit row or the import record remains.

const mode = vi.hoisted(() => ({ count: 0, failAt: Number.POSITIVE_INFINITY, how: "throw" }));

vi.mock("./price-rows", async (importOriginal) => {
  const original = await importOriginal<typeof import("./price-rows")>();
  return {
    ...original,
    async setHeadPrice(...args: Parameters<typeof original.setHeadPrice>) {
      mode.count += 1;
      if (mode.count === mode.failAt) {
        if (mode.how === "throw") throw new Error("Invented failure after earlier rows.");
        const [tx, , price] = args;
        await tx
          .update(productVariants)
          .set({ referencePrice: price.price })
          .where(eq(productVariants.id, price.variantId));
        return { id: randomUUID(), createdAt: new Date(0) };
      }
      return original.setHeadPrice(...args);
    },
  };
});

const { importPrices } = await import("./imports");

async function fiveProducts() {
  const prefix = `Narx ${randomUUID().slice(0, 8)}`;
  const made = [];
  for (let at = 1; at <= 5; at += 1) {
    made.push(await insertProduct({ name: `${prefix} ${at}`, referencePrice: 1_000n }));
  }
  return made;
}

async function nothingRemains(
  made: Awaited<ReturnType<typeof fiveProducts>>,
  headId: string,
  clientKey: string,
) {
  const ids = made.map((product) => product.defaultVariantId);
  const prices = await db
    .select({ price: productVariants.referencePrice })
    .from(productVariants)
    .where(inArray(productVariants.id, ids));
  expect(prices.map((row) => row.price)).toEqual(ids.map(() => 1_000n));
  const [history] = await db
    .select({ n: count() })
    .from(priceHistory)
    .where(inArray(priceHistory.variantId, ids));
  expect(history!.n).toBe(5);
  const [audits] = await db
    .select({ n: count() })
    .from(auditLog)
    .where(eq(auditLog.actorId, headId));
  expect(audits!.n).toBe(0);
  const [imports] = await db
    .select({ n: count() })
    .from(catalogImports)
    .where(eq(catalogImports.clientKey, clientKey));
  expect(imports!.n).toBe(0);
}

describe("importPrices: a failure at the last row leaves nothing (developer-rules.md rule 3)", () => {
  for (const how of ["throw", "no history row"] as const) {
    it(`(${how === "throw" ? "a" : "b"}) the last row's write ${how === "throw" ? "throws" : "skips its HEAD row and the commit is refused"}`, async () => {
      const head = await insertUser("HEAD");
      const made = await fiveProducts();
      const input = {
        clientKey: newClientKey(),
        fileName: "narxlar.xlsx",
        sheet: importSheet(
          "prices",
          made.map((product) => [product.name, null, 2_000, "Yangi narx"]),
        ),
      };
      mode.count = 0;
      mode.failAt = 5;
      mode.how = how;

      expect(await runAction(importPrices, head.id, input)).toMatchObject({
        ok: false,
        error: { code: "unexpected" },
      });
      expect(mode.count).toBe(5);
      await nothingRemains(made, head.id, input.clientKey);
    });
  }
});
