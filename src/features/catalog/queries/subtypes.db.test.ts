import { describe, expect, it } from "vitest";

import {
  insertCategory,
  insertProduct,
  insertSubtypes,
  insertUnit,
} from "../../../../tests/helpers/catalog";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { getProduct, listProducts } from "./products";
import { getSubtype, listSubtypes } from "./subtypes";

// build-plan 1.8, Done when: "a product without subtypes shows none on screen and has one row".
// 04-catalogs.md, Catalogs table (Subtypes), rules 1 and 2; plan of 1.8, decisions 2 and 4 (Look
// first: the price shown) and the plan review (Must fix 2). Every passing case has the data a
// wrong filter would let in beside it (D40).

describe("listSubtypes (04 rule 1; build-plan 1.8, Done when)", () => {
  it("a product without subtypes shows none, though it has its hidden row", async () => {
    const head = await insertUser("HEAD");
    const plain = await insertProduct();
    const other = await insertProduct();
    await insertSubtypes(other.id, [{}]);
    expect(await listSubtypes(head.id, plain.id)).toEqual([]);
  });

  it("lists the product's real subtypes only, active first then by name", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct({ referencePrice: 50_000n });
    const [a4, a3, old] = await insertSubtypes(product.id, [
      { name: "A4" },
      { name: "A3", referencePrice: 60_000n },
      { name: "A0", isActive: false },
    ]);
    const elsewhere = await insertProduct();
    await insertSubtypes(elsewhere.id, [{ name: "A2" }]);
    const rows = await listSubtypes(head.id, product.id);
    expect(rows.map((row) => row.id)).toEqual([a3, a4, old]);
    expect(rows.map((row) => row.referencePrice)).toEqual([60_000n, 50_000n, null]);
  });

  it("an id that is not an id gives none", async () => {
    const head = await insertUser("HEAD");
    expect(await listSubtypes(head.id, "x")).toEqual([]);
  });
});

describe("getSubtype: a real subtype of the named product only", () => {
  it("the default row, another product's subtype and a bad id are null", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct();
    const plain = await insertProduct();
    const [id] = await insertSubtypes(product.id, [{ name: "Ko'k" }]);
    expect(await getSubtype(head.id, product.id, id!)).toMatchObject({
      id,
      name: "Ko'k",
      productId: product.id,
      productName: product.name,
    });
    expect(await getSubtype(head.id, plain.id, plain.defaultVariantId)).toBeNull();
    expect(await getSubtype(head.id, plain.id, id!)).toBeNull();
    expect(await getSubtype(head.id, product.id, "x")).toBeNull();
  });
});

describe("the products' price from 1.8 on (decisions 2 and 4, Look first; plan review, Must fix 2)", () => {
  it("without subtypes the default's price; with subtypes none, and the count of subtypes", async () => {
    const head = await insertUser("HEAD");
    const category = await insertCategory();
    const unit = await insertUnit();
    const plain = await insertProduct({
      categoryId: category.id,
      unitId: unit.id,
      referencePrice: 50_000n,
    });
    const split = await insertProduct({
      categoryId: category.id,
      unitId: unit.id,
      referencePrice: 40_000n,
    });
    await insertSubtypes(split.id, [{}, {}, { isActive: false }]);
    const list = await listProducts(head.id, { categoryId: category.id });
    const byId = new Map(list.rows.map((row) => [row.id, row]));
    expect(byId.get(plain.id)).toMatchObject({
      referencePrice: 50_000n,
      hasVariants: false,
      subtypeCount: 0,
    });
    expect(byId.get(split.id)).toMatchObject({
      referencePrice: null,
      hasVariants: true,
      subtypeCount: 3,
    });
    expect(await getProduct(head.id, split.id)).toMatchObject({
      referencePrice: null,
      hasVariants: true,
    });
    expect(await getProduct(head.id, plain.id)).toMatchObject({ referencePrice: 50_000n });
  });
});

describePermissionMatrix("listSubtypes", {
  permission: "catalog.manage",
  async run({ user }) {
    const product = await insertProduct();
    await listSubtypes(user.id, product.id);
  },
});

describePermissionMatrix("getSubtype", {
  permission: "catalog.manage",
  async run({ user }) {
    const product = await insertProduct();
    const [id] = await insertSubtypes(product.id, [{}]);
    await getSubtype(user.id, product.id, id!);
  },
});
