import { describe, expect, it } from "vitest";

import { newClientKey } from "@/components/client-key";
import { runAction } from "@/server/action";

import { advanceClock, setClock } from "../../../../tests/helpers/clock";
import { insertProduct, insertSubtypes } from "../../../../tests/helpers/catalog";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { addPrice } from "../actions/prices";
import { getPriceHistory, listPrices } from "./prices";

// build-plan 1.9: "a price-history view per subtype; under Admin, a Prices list of every subtype
// with its current price". 04-catalogs.md rules 1, 2 and 4; A14; plan of 1.9, decisions 4, 12 and
// 13; developer-rules.md rule 12 (server paging). Every passing case has the data a wrong filter
// would let in beside it (D40).

async function newPrice(userId: string, variantId: string, price: string, note = "Yangi narx") {
  const result = await runAction(addPrice, userId, {
    clientKey: newClientKey(),
    variantId,
    price,
    note,
  });
  expect(result).toMatchObject({ ok: true });
}

describe("listPrices (build-plan 1.9: every subtype with its current price)", () => {
  it("shows every subtype: the default as its product alone, real subtypes by name, with who and when", async () => {
    const head = await insertUser("HEAD");
    const tag = newClientKey().slice(0, 8);
    setClock("2031-05-02T04:00:00Z");
    const plain = await insertProduct({ name: `${tag} Bo'r`, referencePrice: 5_000n });
    const withSubtypes = await insertProduct({ name: `${tag} Qalam` });
    const [blue, red] = await insertSubtypes(withSubtypes.id, [
      { name: "Ko'k", referencePrice: 2_000n },
      { name: "Qizil" },
    ]);
    advanceClock({ days: 3 });
    await newPrice(head.id, plain.defaultVariantId, "6 000");

    const { rows, found } = await listPrices(head.id, { q: tag });
    expect(found).toBe(3);
    expect(rows).toMatchObject([
      {
        variantId: plain.defaultVariantId,
        productName: `${tag} Bo'r`,
        subtypeName: null,
        referencePrice: 6_000n,
        isActive: true,
        setAt: new Date("2031-05-05T04:00:00Z"),
        setByName: head.fullName,
      },
      {
        variantId: blue,
        subtypeName: "Ko'k",
        referencePrice: 2_000n,
        setAt: new Date("2031-05-02T04:00:00Z"),
      },
      { variantId: red, subtypeName: "Qizil", referencePrice: null, setAt: null, setByName: null },
    ]);
    expect(rows[1]!.setByName).toBeTruthy();
    expect(rows[1]!.setByName).not.toBe(head.fullName);
  });

  it("inactive subtypes and products stay, after the active ones (decision 12; 04 rule 2)", async () => {
    const head = await insertUser("HEAD");
    const tag = newClientKey().slice(0, 8);
    const off = await insertProduct({ name: `${tag} A`, isActive: false });
    const on = await insertProduct({ name: `${tag} B` });
    const { rows } = await listPrices(head.id, { q: tag });
    expect(rows.map((row) => [row.variantId, row.isActive])).toEqual([
      [on.defaultVariantId, true],
      [off.defaultVariantId, false],
    ]);
  });

  it("finds a product or a real subtype by part of its name, not the hidden default's 'default'", async () => {
    const head = await insertUser("HEAD");
    const tag = newClientKey().slice(0, 8);
    const product = await insertProduct({ name: `Daftar ${tag}` });
    const [thin] = await insertSubtypes(product.id, [{ name: `Yupqa ${tag}x` }]);
    const other = await insertProduct({ name: `Boshqa ${tag}y` });
    expect((await listPrices(head.id, { q: `${tag}x` })).rows.map((row) => row.variantId)).toEqual([
      thin,
    ]);
    expect((await listPrices(head.id, { q: `Daftar ${tag}` })).found).toBe(1);
    expect((await listPrices(head.id, { q: `${tag}y` })).rows[0]!.variantId).toBe(
      other.defaultVariantId,
    );
    expect((await listPrices(head.id, { q: `${tag} default` })).found).toBe(0);
  });

  it("pages by 25 from the server; a page past the last gives the last (rule 12)", async () => {
    const head = await insertUser("HEAD");
    const tag = newClientKey().slice(0, 8);
    const product = await insertProduct({ name: `Ko'p ${tag}` });
    await insertSubtypes(
      product.id,
      Array.from({ length: 26 }, (_, index) => ({
        name: `Turi ${String(index).padStart(2, "0")}`,
      })),
    );
    const first = await listPrices(head.id, { q: tag });
    expect(first).toMatchObject({ found: 26, page: 1, pages: 2 });
    expect(first.rows).toHaveLength(25);
    const last = await listPrices(head.id, { q: tag, page: 9 });
    expect(last).toMatchObject({ page: 2 });
    expect(last.rows.map((row) => row.subtypeName)).toEqual(["Turi 25"]);
  });
});

describe("getPriceHistory (build-plan 1.9: a price-history view per subtype; 04 rule 4)", () => {
  it("the current price and every row newest first, with note, who and when", async () => {
    const head = await insertUser("HEAD");
    setClock("2031-05-02T04:00:00Z");
    const product = await insertProduct({ referencePrice: 50_000n });
    const other = await insertProduct({ referencePrice: 1_000n });
    advanceClock({ days: 1 });
    await newPrice(head.id, product.defaultVariantId, "60 000", "Oshdi");
    await newPrice(head.id, other.defaultVariantId, "2 000");
    const found = await getPriceHistory(head.id, product.defaultVariantId);
    expect(found).toMatchObject({
      variantId: product.defaultVariantId,
      productId: product.id,
      productName: product.name,
      subtypeName: null,
      isActive: true,
      referencePrice: 60_000n,
      page: 1,
      pages: 1,
    });
    expect(found!.rows).toMatchObject([
      {
        price: 60_000n,
        source: "HEAD",
        note: "Oshdi",
        setByName: head.fullName,
        createdAt: new Date("2031-05-03T04:00:00Z"),
      },
      { price: 50_000n, source: "HEAD", note: null, createdAt: new Date("2031-05-02T04:00:00Z") },
    ]);
  });

  it("a real subtype shows its name; an unknown id or one that is not an id is not found", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct();
    const [white] = await insertSubtypes(product.id, [{ name: "Oq", referencePrice: 3_000n }]);
    expect(await getPriceHistory(head.id, white!)).toMatchObject({
      subtypeName: "Oq",
      referencePrice: 3_000n,
    });
    expect(await getPriceHistory(head.id, newClientKey())).toBeNull();
    expect(await getPriceHistory(head.id, "not-an-id")).toBeNull();
  });
});

describePermissionMatrix("listPrices", {
  permission: "catalog.manage",
  async run({ user }) {
    await listPrices(user.id);
  },
});

describePermissionMatrix("getPriceHistory", {
  permission: "catalog.manage",
  async run({ user }) {
    const product = await insertProduct({ referencePrice: 5_000n });
    await getPriceHistory(user.id, product.defaultVariantId);
  },
});
