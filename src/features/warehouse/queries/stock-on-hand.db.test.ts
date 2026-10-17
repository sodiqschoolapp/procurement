import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { setClock } from "../../../../tests/helpers/clock";
import { insertCategory, insertProduct, insertSubtypes } from "../../../../tests/helpers/catalog";
import { insertUser } from "../../../../tests/helpers/users";
import { listStockOnHand } from "./stock-on-hand";

// Stock on hand (09-warehouse.md, Stock screens: Stock on hand; 11-screens-and-ux.md rule 8; 03
// Permission matrix "See orders, stock and reports"; plan of 5.2). The balances are written
// straight into stock_balances, as the movements of 3.1 leave them. Every product name carries the
// test's own tag, and each list searches for it, so the rows of other tests stay out of the Head's
// list of every branch. The matrix rows are in ./stock-on-hand-matrix.db.test.ts.

const AT = "2031-06-02T07:00:00Z";

async function insertBalance(branchId: string, variantId: string, qty: string, avgCost = 0n) {
  await db.execute(sql`
    insert into stock_balances (branch_id, variant_id, qty, avg_cost, created_at, updated_at)
    values (${branchId}, ${variantId}, ${qty}, ${avgCost.toString()}, ${AT}, ${AT})`);
}

function tagged() {
  return `Ombor${randomUUID().slice(0, 8)}`;
}

const keys = (page: Awaited<ReturnType<typeof listStockOnHand>>) =>
  page.rows.map((row) => `${row.branchCode} ${row.productName}`);

async function scene() {
  setClock(AT);
  const tag = tagged();
  const a = await insertBranch();
  const b = await insertBranch();
  const c = await insertBranch();
  const product = await insertProduct({ name: `${tag} daftar` });
  // The same subtype in every branch: each branch's stock is its own (09, first paragraph).
  for (const branch of [a, b, c])
    await insertBalance(branch.id, product.defaultVariantId, "4", 100n);
  return { tag, a, b, c, product };
}

describe("listStockOnHand, the branch wall (03 matrix: See orders, stock and reports)", () => {
  it("Done when: a Principal sees only their branch's stock, and another branch is Not found", async () => {
    const s = await scene();
    const principal = await insertUser("PRINCIPAL", { branches: [s.a.id] });
    expect(keys(await listStockOnHand(principal.id, { q: s.tag }))).toEqual([
      `${s.a.code} ${s.tag} daftar`,
    ]);
    expect(keys(await listStockOnHand(principal.id, { q: s.tag, branch: s.a.id }))).toEqual([
      `${s.a.code} ${s.tag} daftar`,
    ]);
    await expect(listStockOnHand(principal.id, { q: s.tag, branch: s.b.id })).rejects.toEqual(
      new AuthorizationError("not_found"),
    );
  });

  it("a Manager or Finance user of two branches sees both, and the Head every branch", async () => {
    const s = await scene();
    const both = [s.a, s.b].map((branch) => `${branch.code} ${s.tag} daftar`).sort();
    const manager = await insertUser("MANAGER", { branches: [s.a.id, s.b.id] });
    const finance = await insertUser("FINANCE", { branches: [s.a.id, s.b.id] });
    expect(keys(await listStockOnHand(manager.id, { q: s.tag })).sort()).toEqual(both);
    expect(keys(await listStockOnHand(finance.id, { q: s.tag })).sort()).toEqual(both);
    expect(keys(await listStockOnHand(manager.id, { q: s.tag, branch: s.b.id }))).toEqual([
      `${s.b.code} ${s.tag} daftar`,
    ]);
    const head = await insertUser("HEAD");
    expect(keys(await listStockOnHand(head.id, { q: s.tag })).sort()).toEqual(
      [s.a, s.b, s.c].map((branch) => `${branch.code} ${s.tag} daftar`).sort(),
    );
  });
});

describe("listStockOnHand, the rows (09 Stock on hand and Stock value)", () => {
  it("never lists a service, even with a balance row beside a product's (09; Definitions: Stock)", async () => {
    const s = await scene();
    // Everything but the type lets the service in: the same branch, category, search and a stock.
    const service = await insertProduct({
      name: `${s.tag} yetkazish`,
      type: "SERVICE",
      categoryId: s.product.categoryId,
    });
    await insertBalance(s.a.id, service.defaultVariantId, "3", 100n);
    const head = await insertUser("HEAD");
    expect(keys(await listStockOnHand(head.id, { q: s.tag, branch: s.a.id }))).toEqual([
      `${s.a.code} ${s.tag} daftar`,
    ]);
  });

  it("reads the value as stockValue() gives it, keeps a stock of 0, and hides the default subtype's name", async () => {
    setClock(AT);
    const tag = tagged();
    const branch = await insertBranch();
    const plain = await insertProduct({ name: `${tag} a qalam` });
    const paper = await insertProduct({ name: `${tag} b qog'oz` });
    const [a4, a5] = await insertSubtypes(paper.id, [{ name: "A4" }, { name: "A5" }]);
    await insertBalance(branch.id, plain.defaultVariantId, "2.5", 1001n);
    await insertBalance(branch.id, a4!, "1.250", 3999n);
    await insertBalance(branch.id, a5!, "0", 0n);
    const head = await insertUser("HEAD");
    const page = await listStockOnHand(head.id, { q: tag });
    expect(
      page.rows.map(({ productName, subtypeName, quantity, value }) => ({
        productName,
        subtypeName,
        quantity,
        value,
      })),
    ).toEqual([
      // 2.5 × 1 001 = 2 502.5 and 1.250 × 3 999 = 4 998.75, both up (decided item 1).
      { productName: `${tag} a qalam`, subtypeName: null, quantity: "2.500", value: 2503n },
      { productName: `${tag} b qog'oz`, subtypeName: "A4", quantity: "1.250", value: 4999n },
      // A stock of 0 stays listed (decided item 3).
      { productName: `${tag} b qog'oz`, subtypeName: "A5", quantity: "0.000", value: 0n },
    ]);
  });

  it("finds part of a product's or a subtype's name, any case, with % and _ as themselves", async () => {
    setClock(AT);
    const tag = tagged();
    const branch = await insertBranch();
    const pen = await insertProduct({ name: `${tag} Ruchka 50%` });
    const paper = await insertProduct({ name: `${tag} qog'oz` });
    const [glossy] = await insertSubtypes(paper.id, [{ name: `Yaltiroq_${tag}` }]);
    const other = await insertProduct({ name: `Boshqa ${randomUUID().slice(0, 8)}` });
    for (const variant of [pen.defaultVariantId, glossy!, other.defaultVariantId]) {
      await insertBalance(branch.id, variant, "1");
    }
    const head = await insertUser("HEAD");
    const found = async (q: string) =>
      (await listStockOnHand(head.id, { q, branch: branch.id })).rows.map((row) => row.variantId);
    expect(await found(`${tag} ruchka`)).toEqual([pen.defaultVariantId]);
    expect(await found(`${tag.toLowerCase()} RUCHKA 50%`)).toEqual([pen.defaultVariantId]);
    expect(await found(`yaltiroq_${tag}`)).toEqual([glossy!]);
    // `_` is matched as itself, not as any one letter.
    expect(await found(`yaltiroqX${tag}`)).toEqual([]);
    expect(await found(`${tag} Ruchka 5%`)).toEqual([]);
  });

  it("never matches the hidden default subtype by its stored name (review of the plan, correction 1)", async () => {
    setClock(AT);
    const branch = await insertBranch();
    // Only the hidden subtype's stored name "default" could match: the product's name does not.
    const product = await insertProduct({ name: `Daftar ${randomUUID().slice(0, 8)}` });
    await insertBalance(branch.id, product.defaultVariantId, "1");
    const head = await insertUser("HEAD");
    const page = await listStockOnHand(head.id, { q: "default", branch: branch.id });
    expect(page.rows).toEqual([]);
    // The same row is found by its product's name, so only the subtype's name kept it out.
    const byName = await listStockOnHand(head.id, { q: "Daftar", branch: branch.id });
    expect(byName.rows.map((row) => row.variantId)).toEqual([product.defaultVariantId]);
  });

  it("keeps only the chosen category's stock; a category that is not an id is ignored", async () => {
    setClock(AT);
    const tag = tagged();
    const branch = await insertBranch();
    const stationery = await insertCategory();
    const kept = await insertProduct({ name: `${tag} a`, categoryId: stationery.id });
    const left = await insertProduct({ name: `${tag} b` });
    await insertBalance(branch.id, kept.defaultVariantId, "1");
    await insertBalance(branch.id, left.defaultVariantId, "1");
    const head = await insertUser("HEAD");
    const ids = async (category: string) =>
      (await listStockOnHand(head.id, { q: tag, category })).rows.map((row) => row.variantId);
    expect(await ids(stationery.id)).toEqual([kept.defaultVariantId]);
    expect(await ids("not-an-id")).toEqual([kept.defaultVariantId, left.defaultVariantId]);
  });

  it("pages 25 rows; a page past the last gives the last (11 rule 8)", async () => {
    setClock(AT);
    const tag = tagged();
    const branch = await insertBranch();
    const category = await insertCategory();
    for (let index = 0; index < 26; index += 1) {
      const product = await insertProduct({
        name: `${tag} ${String(index).padStart(2, "0")}`,
        categoryId: category.id,
      });
      await insertBalance(branch.id, product.defaultVariantId, "1");
    }
    const head = await insertUser("HEAD");
    const first = await listStockOnHand(head.id, { q: tag }, 1);
    expect([first.rows.length, first.page, first.pages, first.found]).toEqual([25, 1, 2, 26]);
    const last = await listStockOnHand(head.id, { q: tag }, 9);
    expect([last.page, last.rows.map((row) => row.productName)]).toEqual([2, [`${tag} 25`]]);
  });
});
