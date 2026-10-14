import { describe, expect, it } from "vitest";

import { newClientKey } from "@/components/client-key";
import { CATALOG_PAGE_SIZE } from "@/domain/catalogs";

import {
  insertCategory,
  insertCompany,
  insertProduct,
  insertUnit,
} from "../../../../tests/helpers/catalog";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { countActiveCatalogEntries } from "./catalog-entries";
import { getProduct, listCategoryFilter, listProductChoices, listProducts } from "./products";

// build-plan 1.7: "the list has search, category and type filters and 25 rows per page".
// 04-catalogs.md rule 2 (inactive entries stay in the list and in old records, and leave the
// choices); 11-screens-and-ux.md rule 8 (25 a page); plan of 1.7, decision 12 and its review
// (Should fix 8 and 10). Every passing case has the data a wrong filter would let in beside it
// (D40). Each test file has its own database, so the counts are of this file's rows only.

describe("listProducts: search and filters (build-plan 1.7)", () => {
  it("search finds part of the name, any case, with % and _ as themselves", async () => {
    const head = await insertUser("HEAD");
    const tag = newClientKey().slice(0, 6);
    const wanted = await insertProduct({ name: `Daftar 48 varaq ${tag}` });
    await insertProduct({ name: `Ruchka ${tag}` });
    await insertProduct({ name: `Daftar_${tag}%` });
    const found = await listProducts(head.id, { q: `DAFTAR 48 VARAQ ${tag}` });
    expect(found.rows.map((row) => row.id)).toEqual([wanted.id]);
    const literal = await listProducts(head.id, { q: `_${tag}%` });
    expect(literal.rows.map((row) => row.name)).toEqual([`Daftar_${tag}%`]);
  });

  it("the category filter keeps that category only; another category and an inactive product are beside it", async () => {
    const head = await insertUser("HEAD");
    const category = await insertCategory();
    const other = await insertCategory();
    const active = await insertProduct({ categoryId: category.id });
    const inactive = await insertProduct({ categoryId: category.id, isActive: false });
    await insertProduct({ categoryId: other.id });
    await insertProduct({ categoryId: other.id, type: "SERVICE" });
    const found = await listProducts(head.id, { categoryId: category.id });
    // Active first, the inactive one still listed (04 rule 2).
    expect(found.rows.map((row) => row.id)).toEqual([active.id, inactive.id]);
    expect(found.found).toBe(2);
  });

  it("the type filter keeps products or services; both stand beside each other in one category", async () => {
    const head = await insertUser("HEAD");
    const category = await insertCategory();
    const goods = await insertProduct({ categoryId: category.id });
    const service = await insertProduct({ categoryId: category.id, type: "SERVICE" });
    const inactiveService = await insertProduct({
      categoryId: category.id,
      type: "SERVICE",
      isActive: false,
    });
    const services = await listProducts(head.id, { categoryId: category.id, type: "SERVICE" });
    expect(services.rows.map((row) => row.id)).toEqual([service.id, inactiveService.id]);
    const products = await listProducts(head.id, { categoryId: category.id, type: "GOODS" });
    expect(products.rows.map((row) => row.id)).toEqual([goods.id]);
  });

  it("a filter that is not a category id or a type is ignored", async () => {
    const head = await insertUser("HEAD");
    const everything = await listProducts(head.id);
    const ignored = await listProducts(head.id, { categoryId: "x", type: "PRODUCT" });
    expect(ignored.found).toBe(everything.found);
  });

  it("25 rows a page, active first then by name; a page past the last gives the last (11 rule 8)", async () => {
    const head = await insertUser("HEAD");
    const category = await insertCategory();
    const tag = newClientKey().slice(0, 6);
    for (let index = 0; index < CATALOG_PAGE_SIZE + 2; index += 1) {
      await insertProduct({
        categoryId: category.id,
        name: `Sahifa ${tag} ${String(index).padStart(2, "0")}`,
      });
    }
    const inactive = await insertProduct({
      categoryId: category.id,
      name: `A ${tag}`,
      isActive: false,
    });
    const first = await listProducts(head.id, { categoryId: category.id });
    expect(first.rows).toHaveLength(CATALOG_PAGE_SIZE);
    expect(first.pages).toBe(2);
    expect(first.rows[0]!.name).toBe(`Sahifa ${tag} 00`);
    const last = await listProducts(head.id, { categoryId: category.id, page: 9 });
    expect(last.page).toBe(2);
    expect(last.rows.map((row) => row.id).at(-1)).toBe(inactive.id);
  });

  it("each row carries the names of its category and measure, the photo and the price as a bigint", async () => {
    const head = await insertUser("HEAD");
    const category = await insertCategory({ name: `Oziq-ovqat ${newClientKey()}` });
    const unit = await insertUnit({ name: `Kilogramm ${newClientKey()}` });
    await insertProduct({ categoryId: category.id, unitId: unit.id, referencePrice: 18_500n });
    const [row] = (await listProducts(head.id, { categoryId: category.id })).rows;
    expect(row).toMatchObject({
      categoryName: category.name,
      unitName: unit.name,
      photoFileId: null,
      referencePrice: 18_500n,
      type: "GOODS",
    });
  });
});

describe("getProduct (build-plan 1.7)", () => {
  it("one product with its references and their active flags; an unknown id or no id is null", async () => {
    const head = await insertUser("HEAD");
    const company = await insertCompany({ isActive: false });
    const product = await insertProduct({ defaultCompanyId: company.id, description: "Oq" });
    expect(await getProduct(head.id, product.id)).toMatchObject({
      id: product.id,
      categoryActive: true,
      unitActive: true,
      defaultCompanyId: company.id,
      defaultCompanyName: company.name,
      defaultCompanyActive: false,
      description: "Oq",
    });
    expect(await getProduct(head.id, newClientKey())).toBeNull();
    expect(await getProduct(head.id, "yoq")).toBeNull();
  });
});

describe("the form's choices and the category filter (04 rule 2; review Should fix 10)", () => {
  it("the form offers active entries, and the product's own inactive ones beside them", async () => {
    const head = await insertUser("HEAD");
    const active = await insertCategory();
    const inactive = await insertCategory({ isActive: false });
    const otherInactive = await insertCategory({ isActive: false });
    const plain = await listProductChoices(head.id);
    const ids = plain.categories.map((choice) => choice.id);
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(inactive.id);
    const own = await listProductChoices(head.id, { categoryId: inactive.id });
    const ownIds = own.categories.map((choice) => choice.id);
    expect(ownIds).toContain(inactive.id);
    expect(ownIds).not.toContain(otherInactive.id);
    expect(own.categories.find((choice) => choice.id === inactive.id)!.isActive).toBe(false);
  });

  it("the category filter lists inactive categories too", async () => {
    const head = await insertUser("HEAD");
    const active = await insertCategory();
    const inactive = await insertCategory({ isActive: false });
    const ids = (await listCategoryFilter(head.id)).map((choice) => choice.id);
    expect(ids).toContain(active.id);
    expect(ids).toContain(inactive.id);
  });

  it("/catalog counts active products only", async () => {
    const head = await insertUser("HEAD");
    const before = await countActiveCatalogEntries(head.id);
    await insertProduct();
    await insertProduct({ isActive: false });
    expect((await countActiveCatalogEntries(head.id)).products).toBe(before.products + 1);
  });
});

// "Manage catalogs, users, branches, settings": the Head only (03, Permission matrix).
describePermissionMatrix("listProducts", {
  permission: "catalog.manage",
  run: ({ user }) => listProducts(user.id),
});

describePermissionMatrix("getProduct", {
  permission: "catalog.manage",
  run: ({ user }) => getProduct(user.id, newClientKey()),
});

describePermissionMatrix("listProductChoices", {
  permission: "catalog.manage",
  run: ({ user }) => listProductChoices(user.id),
});

describePermissionMatrix("listCategoryFilter", {
  permission: "catalog.manage",
  run: ({ user }) => listCategoryFilter(user.id),
});
