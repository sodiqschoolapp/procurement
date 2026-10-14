import { describe, expect, it, vi } from "vitest";

import { runAction } from "@/server/action";

import { insertCategory, insertProduct, insertUnit } from "../../../../tests/helpers/catalog";
import { insertUser } from "../../../../tests/helpers/users";

// 04-catalogs.md, Catalogs table: "Type and measure lock after first use"; plan of 1.7, decision 1
// (Look first). No use exists in 1.7 (PRODUCT_USES is empty), so the uses are replaced here by a
// set of products held as used, and updateProduct's guard runs its refusal through the wrapper
// (spec review of the diff, Should fix 1). The in-use product's other fields pass beside it (D40).

const used = vi.hoisted(() => new Set<string>());
vi.mock("./product-uses", () => ({
  PRODUCT_USES: [],
  productInUse: async (_tx: unknown, productId: string) => used.has(productId),
}));

const { updateProduct } = await import("./products");

describe("products in use: type and measure are locked (04 Catalogs table; decision 1)", () => {
  it("a change of type or measure is refused as locked; name and category still change", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct();
    used.add(product.id);
    const unit = await insertUnit();
    expect(
      await runAction(updateProduct, head.id, {
        id: product.id,
        type: "SERVICE",
        unitId: unit.id,
      }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        fields: { type: "errors.field.locked", unitId: "errors.field.locked" },
      },
    });
    const category = await insertCategory();
    expect(
      await runAction(updateProduct, head.id, {
        id: product.id,
        name: `${product.name} yangi`,
        categoryId: category.id,
        // Unchanged values are no change, so they are not locked.
        type: "GOODS",
        unitId: product.unitId,
      }),
    ).toMatchObject({ ok: true, data: { changed: ["name", "categoryId"] } });
  });

  it("a product not in use beside it changes its type and measure", async () => {
    const head = await insertUser("HEAD");
    used.add((await insertProduct()).id);
    const free = await insertProduct();
    const unit = await insertUnit();
    expect(
      await runAction(updateProduct, head.id, { id: free.id, type: "SERVICE", unitId: unit.id }),
    ).toMatchObject({ ok: true, data: { changed: ["type", "unitId"] } });
  });
});
