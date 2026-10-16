import { describe, expect, it } from "vitest";

import { runAction } from "@/server/action";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertCategory, insertProduct, insertUnit } from "../../../../tests/helpers/catalog";
import { addDraft, insertDepartment } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { deleteDraft } from "../../orders/actions/drafts";
import { updateProduct } from "./products";

// 04-catalogs.md, Catalogs table: "Type and measure lock after first use"; plan of 1.7, decision 1
// (Look first); build plan 2.5a, Done when: "a product in a draft refuses a change of type or
// measure". An order of any status on any of the product's subtypes, a draft included, is a use
// (plan of 2.5a, decided item 6, Look first): the drafts here are real ones, made through
// createDraft. The in-use product's other fields pass beside it, and a product without orders
// changes (D40).

async function productInADraft() {
  const product = await insertProduct();
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const added = await addDraft(manager.id, {
    branchId: branch.id,
    variantId: product.defaultVariantId,
    departmentId: (await insertDepartment(branch.id)).id,
  });
  expect(added).toMatchObject({ ok: true });
  const draftId = (added as { ok: true; data: { id: string } }).data.id;
  return { product, manager, draftId };
}

describe("products in use: type and measure are locked (04 Catalogs table; decision 1)", () => {
  it("a product in a draft refuses a change of type or measure as locked; name and category still change", async () => {
    const head = await insertUser("HEAD");
    const { product } = await productInADraft();
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
    await productInADraft();
    const free = await insertProduct();
    const unit = await insertUnit();
    expect(
      await runAction(updateProduct, head.id, { id: free.id, type: "SERVICE", unitId: unit.id }),
    ).toMatchObject({ ok: true, data: { changed: ["type", "unitId"] } });
  });

  it("with its only draft deleted (never submitted), the product changes again (decided item 6)", async () => {
    const head = await insertUser("HEAD");
    const { product, manager, draftId } = await productInADraft();
    expect(await runAction(deleteDraft, manager.id, { id: draftId, version: 1 })).toMatchObject({
      ok: true,
    });
    const unit = await insertUnit();
    expect(
      await runAction(updateProduct, head.id, { id: product.id, unitId: unit.id }),
    ).toMatchObject({ ok: true, data: { changed: ["unitId"] } });
  });
});
