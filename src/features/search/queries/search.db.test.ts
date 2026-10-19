import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { SEARCH_GROUP_MAX } from "@/domain/search";

import { insertBranch } from "../../../../tests/helpers/branches";
import {
  insertCategory,
  insertCompany,
  insertProduct,
  insertSubtypes,
} from "../../../../tests/helpers/catalog";
import { insertOrder } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { searchEverything } from "./search";

// The search of Ctrl+K (11-screens-and-ux.md rule 9; build-plan 6.10: "limited to what the user
// may see"; 03-roles-and-permissions.md rule 1; plan of 6.10). Each test searches its own tag, so
// the rows of other tests stay out of the Head's results. The matrix rows are in
// ./search-matrix.db.test.ts.

/** A counter no other test uses, 6 digits (05 Order number: four digits or more). */
function counter(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}

async function twoBranches() {
  const a = await insertBranch();
  const b = await insertBranch();
  const managerA = await insertUser("MANAGER", { branches: [a.id] });
  const managerB = await insertUser("MANAGER", { branches: [b.id] });
  const principalB = await insertUser("PRINCIPAL", { branches: [b.id] });
  const head = await insertUser("HEAD");
  return { a, b, managerA, managerB, principalB, head };
}

const numbers = async (userId: string, q: string) =>
  (await searchEverything(userId, q)).orders.map((order) => order.number);

describe("searchEverything: orders behind the branch wall (03 rule 1; build-plan 6.10)", () => {
  it("an order number of another branch gives no result", async () => {
    const { b, managerA, managerB } = await twoBranches();
    const number = `${b.code}-26-${counter()}`;
    await insertOrder({ branchId: b.id, ownerId: managerB.id, status: "PENDING_HEAD", number });
    expect(await numbers(managerA.id, number)).toEqual([]);
    expect(await numbers(managerB.id, number)).toEqual([number]);
  });

  it("one text matching an order of each branch: each sees its own, the Head both (D40)", async () => {
    const { a, b, managerA, managerB, principalB, head } = await twoBranches();
    const tail = `26-${counter()}`;
    const numberA = `${a.code}-${tail}`;
    const numberB = `${b.code}-${tail}`;
    await insertOrder({
      branchId: a.id,
      ownerId: managerA.id,
      status: "PURCHASING",
      number: numberA,
    });
    await insertOrder({ branchId: b.id, ownerId: managerB.id, status: "CLOSED", number: numberB });
    expect(await numbers(managerA.id, tail)).toEqual([numberA]);
    expect(await numbers(principalB.id, tail)).toEqual([numberB]);
    expect((await numbers(head.id, tail)).sort()).toEqual([numberA, numberB].sort());
  });

  it("the draft wall: a taken-back Draft that keeps its number is not found, the order beside it is", async () => {
    const { a, managerA, head } = await twoBranches();
    const tail = `26-${counter()}`;
    const kept = `${a.code}-${tail}`;
    const shown = `${a.code}-${tail}1`;
    await insertOrder({ branchId: a.id, ownerId: managerA.id, status: "DRAFT", number: kept });
    await insertOrder({ branchId: a.id, ownerId: managerA.id, status: "REJECTED", number: shown });
    expect(await numbers(managerA.id, tail)).toEqual([shown]);
    expect(await numbers(head.id, tail)).toEqual([shown]);
  });

  it("finds part of the number in any case, with the order's product, revision and status", async () => {
    const { a, managerA } = await twoBranches();
    const count = counter();
    const number = `${a.code}-26-${count}`;
    const product = await insertProduct();
    await insertOrder({
      branchId: a.id,
      ownerId: managerA.id,
      status: "PENDING_PRINCIPAL",
      number,
      revision: 2,
      variantId: product.defaultVariantId,
    });
    const [found] = (await searchEverything(managerA.id, `${a.code.toLowerCase()}-26-${count}`))
      .orders;
    expect(found).toMatchObject({
      number,
      revision: 2,
      status: "PENDING_PRINCIPAL",
      branchCode: a.code,
      productName: product.name,
      subtypeName: null,
    });
    expect(await numbers(managerA.id, count.slice(1))).toEqual([number]);
  });

  it("`%` and `_` are matched as themselves", async () => {
    const { a, managerA } = await twoBranches();
    await insertOrder({
      branchId: a.id,
      ownerId: managerA.id,
      status: "PENDING_HEAD",
      number: `${a.code}-26-${counter()}`,
    });
    expect(await numbers(managerA.id, `${a.code}%`)).toEqual([]);
    expect(await numbers(managerA.id, `${a.code}_26`)).toEqual([]);
  });

  it(`gives at most ${SEARCH_GROUP_MAX} orders, the newest number first`, async () => {
    const { a, managerA } = await twoBranches();
    const base = 100000 + Math.floor(Math.random() * 800000);
    const made: string[] = [];
    for (let step = 0; step < SEARCH_GROUP_MAX + 1; step += 1) {
      const number = `${a.code}-27-${base + step}`;
      made.push(number);
      await insertOrder({ branchId: a.id, ownerId: managerA.id, status: "PENDING_HEAD", number });
    }
    expect(await numbers(managerA.id, `${a.code}-27-`)).toEqual(
      made.reverse().slice(0, SEARCH_GROUP_MAX),
    );
  });
});

describe("searchEverything: products and suppliers (11 rule 9; 04 rules 1 and 2)", () => {
  it("finds a product by its name and a real subtype by its name, never the default's stored name", async () => {
    const { managerA } = await twoBranches();
    const tag = randomUUID().slice(0, 8);
    const category = await insertCategory({ name: `Turkum ${tag}` });
    const plain = await insertProduct({ name: `Qog'oz ${tag}`, categoryId: category.id });
    const service = await insertProduct({ name: `Yetkazish ${tag}`, type: "SERVICE" });
    const sized = await insertProduct({ name: `Ruchka ${tag}x` });
    const [blue] = await insertSubtypes(sized.id, [{ name: `Ko'k ${tag}y` }]);

    const found = (await searchEverything(managerA.id, tag)).products;
    expect(found.map((row) => row.id)).toEqual([
      plain.defaultVariantId,
      blue,
      service.defaultVariantId,
    ]);
    expect(found[0]).toMatchObject({
      productName: plain.name,
      subtypeName: null,
      type: "GOODS",
      categoryName: category.name,
      isActive: true,
    });
    expect(found[2]).toMatchObject({ type: "SERVICE" });
    expect((await searchEverything(managerA.id, `${tag}y`)).products.map((row) => row.id)).toEqual([
      blue,
    ]);
    expect(
      (await searchEverything(managerA.id, `default`)).products.some(
        (row) => row.id === plain.defaultVariantId,
      ),
    ).toBe(false);
  });

  it("an inactive product is found and marked", async () => {
    const { managerA } = await twoBranches();
    const tag = randomUUID().slice(0, 8);
    const product = await insertProduct({ name: `Eski ${tag}`, isActive: false });
    expect((await searchEverything(managerA.id, tag)).products).toEqual([
      expect.objectContaining({ id: product.defaultVariantId, isActive: false }),
    ]);
  });

  it("lists suppliers (SUPPLIER and BOTH), never a brand only; an inactive one is marked", async () => {
    const { principalB } = await twoBranches();
    const tag = randomUUID().slice(0, 8);
    const both = await insertCompany({ name: `A ${tag}`, kind: "BOTH" });
    await insertCompany({ name: `B ${tag}`, kind: "BRAND" });
    const supplier = await insertCompany({ name: `C ${tag}`, kind: "SUPPLIER", isActive: false });
    expect((await searchEverything(principalB.id, tag)).suppliers).toEqual([
      { id: both.id, name: both.name, isActive: true },
      { id: supplier.id, name: supplier.name, isActive: false },
    ]);
  });
});

describe("searchEverything: what it reads (developer-rules rule 13; plan of 6.10, decided item 6)", () => {
  it("fewer than 2 characters gives nothing", async () => {
    const { a, managerA } = await twoBranches();
    await insertOrder({
      branchId: a.id,
      ownerId: managerA.id,
      status: "PENDING_HEAD",
      number: `${a.code}-26-${counter()}`,
    });
    expect(await searchEverything(managerA.id, " 2 ")).toEqual({
      orders: [],
      products: [],
      suppliers: [],
    });
  });

  it("a text over 200 characters, or not a string, gives nothing and no error", async () => {
    const { managerA } = await twoBranches();
    const empty = { orders: [], products: [], suppliers: [] };
    expect(await searchEverything(managerA.id, "a".repeat(201))).toEqual(empty);
    expect(await searchEverything(managerA.id, { q: "26" })).toEqual(empty);
    expect(await searchEverything(managerA.id, undefined)).toEqual(empty);
  });
});
