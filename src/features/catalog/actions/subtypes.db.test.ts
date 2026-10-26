import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { newClientKey } from "@/components/client-key";
import { runAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import {
  auditLog,
  orders,
  priceHistory,
  productVariants,
  products,
  stockBalances,
} from "@/server/db/schema";
import { accessOf } from "@/server/files/owners";

import {
  insertCategory,
  insertFileRow,
  insertProduct,
  insertSubtypes,
  insertUnit,
} from "../../../../tests/helpers/catalog";
import { insertBranch } from "../../../../tests/helpers/branches";
import { insertOrder } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { receive } from "../../../../tests/helpers/stock-documents";
import { runTogether } from "../../../../tests/helpers/together";
import { insertUser } from "../../../../tests/helpers/users";
import { createProduct, updateProduct } from "./products";
import { createSubtype, setSubtypeActive, updateSubtype } from "./subtypes";

// build-plan 1.8, Done when: "every product has at least one subtype at all times; a product
// without subtypes shows none on screen and has one row". 04-catalogs.md, Catalogs table
// (Subtypes); rules 1, 3, 4, 9; open question 18; developer-rules.md rules 6 and 8;
// src/server/files/owners.ts (the attaching contract); plan of 1.8 and its reviews. Every fixture
// is asserted (D38); every passing case has the refused data beside it (D40).

type Created = {
  entry: {
    id: string;
    productId: string;
    name: string;
    referencePrice: bigint | null;
    photoFileId: string | null;
    isActive: boolean;
  };
};

function expectOk<T>(result: ActionResult<T>): T {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
}

function refused(fields: Record<string, string>) {
  return { ok: false, error: { code: "invalid_input", fields } };
}

function tryAdd(headId: string, productId: string, input: Record<string, unknown> = {}) {
  return runAction(createSubtype, headId, {
    clientKey: newClientKey(),
    productId,
    name: `Turi ${newClientKey().slice(0, 8)}`,
    // Asked only on a product without subtypes (04 rule 1; D64); ignored on one with subtypes.
    existingName: `Mavjud ${newClientKey().slice(0, 8)}`,
    ...input,
  }) as Promise<ActionResult<Created>>;
}

async function add(headId: string, productId: string, input: Record<string, unknown> = {}) {
  return expectOk(await tryAdd(headId, productId, input)).entry;
}

async function rowsOf(productId: string) {
  return db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, productId))
    .orderBy(productVariants.createdAt, productVariants.id);
}

async function productRow(id: string) {
  const [row] = await db.select().from(products).where(eq(products.id, id));
  return row!;
}

function auditRowsOf(entity: string, entityId: string) {
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entity, entity), eq(auditLog.entityId, entityId)))
    .orderBy(auditLog.createdAt, auditLog.id);
}

describe("the hidden default subtype (04 rule 1; build-plan 1.8, Done when)", () => {
  it("a new product has exactly one subtype row, hidden, holding the product's price", async () => {
    const head = await insertUser("HEAD");
    const category = await insertCategory();
    const unit = await insertUnit();
    const product = expectOk(
      await runAction(createProduct, head.id, {
        clientKey: newClientKey(),
        name: `Qog'oz ${newClientKey()}`,
        categoryId: category.id,
        unitId: unit.id,
        referencePrice: "50 000",
      }),
    ) as { id: string };
    const rows = await rowsOf(product.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "default", isDefault: true, referencePrice: 50_000n });
    expect((await productRow(product.id)).hasVariants).toBe(false);
    // Creating a product writes no row of its own for the default (decision 9).
    expect(await auditRowsOf("product_variants", rows[0]!.id)).toHaveLength(0);
  });
});

describe("adding subtypes to a product that had none (04 rule 1; D64, replacing decisions 1.8 item 1, Look first)", () => {
  it("the existing items are named: the default keeps its id and price under that name, the new subtype is a new row; the second adds a row", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct({ referencePrice: 50_000n });
    const a4 = await add(head.id, product.id, { name: "A4", existingName: "A5" });
    expect(a4.id).not.toBe(product.defaultVariantId);
    expect(a4).toMatchObject({ name: "A4", referencePrice: null });
    expect(await rowsOf(product.id)).toHaveLength(2);
    expect((await rowsOf(product.id))[0]).toMatchObject({
      id: product.defaultVariantId,
      name: "A5",
      isDefault: false,
      referencePrice: 50_000n,
    });
    expect((await productRow(product.id)).hasVariants).toBe(true);
    const a3 = await add(head.id, product.id, { name: "A3" });
    expect(a3.referencePrice).toBeNull();
    expect((await rowsOf(product.id)).map((row) => row.name)).toEqual(["A5", "A4", "A3"]);
  });

  it("04 rule 1 from the catalog page: 'black' added to 'Pen' (40 in stock, two orders, a reference price, a photo) naming 'blue' leaves the stock, both orders, the price and the photo on the default id; 'black' is a new row with no stock (build-plan 1.12b and 1.12c, Done when; D64)", async () => {
    const head = await insertUser("HEAD");
    const branch = await insertBranch();
    const manager = await insertUser("MANAGER", { branches: [branch.id] });
    const penPhoto = await insertFileRow(head.id);
    const pen = await insertProduct({ referencePrice: 3_000n, photoFileId: penPhoto.id });
    const [defaultBefore] = await db
      .select({ photoFileId: productVariants.photoFileId })
      .from(productVariants)
      .where(eq(productVariants.id, pen.defaultVariantId));
    await receive(branch.id, pen.defaultVariantId, "40", 2_500n, head.id);
    const first = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PENDING_HEAD",
      variantId: pen.defaultVariantId,
    });
    const second = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      variantId: pen.defaultVariantId,
    });
    const blackPhoto = await insertFileRow(head.id);
    const black = await add(head.id, pen.id, {
      name: "black",
      existingName: "blue",
      referencePrice: "3 500",
      photoFileId: blackPhoto.id,
    });
    expect(black.id).not.toBe(pen.defaultVariantId);
    expect((await rowsOf(pen.id))[0]).toMatchObject({
      id: pen.defaultVariantId,
      name: "blue",
      isDefault: false,
      referencePrice: 3_000n,
      // The default's own photo field is untouched (empty: it shows the product's, plan of 1.8,
      // decided item 8), and the product keeps its photo; the Head's photo is the new row's only.
      photoFileId: defaultBefore!.photoFileId,
    });
    expect(defaultBefore!.photoFileId).toBeNull();
    expect((await productRow(pen.id)).photoFileId).toBe(penPhoto.id);
    // The price history stays on the default; "black" has only its own HEAD row (04 rule 4).
    expect(
      await db
        .select({ price: priceHistory.price, source: priceHistory.source })
        .from(priceHistory)
        .where(eq(priceHistory.variantId, pen.defaultVariantId)),
    ).toEqual([{ price: 3_000n, source: "HEAD" }]);
    expect(
      await db
        .select({ price: priceHistory.price, source: priceHistory.source })
        .from(priceHistory)
        .where(eq(priceHistory.variantId, black.id)),
    ).toEqual([{ price: 3_500n, source: "HEAD" }]);
    for (const order of [first, second]) {
      const [row] = await db
        .select({ variantId: orders.variantId })
        .from(orders)
        .where(eq(orders.id, order.id));
      expect(row!.variantId).toBe(pen.defaultVariantId);
    }
    const [stock] = await db
      .select({ qty: stockBalances.qty })
      .from(stockBalances)
      .where(
        and(
          eq(stockBalances.branchId, branch.id),
          eq(stockBalances.variantId, pen.defaultVariantId),
        ),
      );
    expect(stock!.qty).toBe("40.000");
    // "black" is a new row: no stock of its own, its own photo and price.
    expect(
      await db
        .select({ qty: stockBalances.qty })
        .from(stockBalances)
        .where(eq(stockBalances.variantId, black.id)),
    ).toEqual([]);
    // The Head's own add writes no added_by: it is not on the Head's list (04 rule 8).
    expect((await rowsOf(pen.id))[1]).toMatchObject({
      id: black.id,
      name: "black",
      addedBy: null,
      photoFileId: blackPhoto.id,
      referencePrice: 3_500n,
    });
  });

  it("the existing items' name is required on the first subtype and must differ from the new one", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct({ referencePrice: 50_000n });
    expect(await tryAdd(head.id, product.id, { name: "A4", existingName: null })).toMatchObject(
      refused({ existingName: "errors.field.required" }),
    );
    expect(await tryAdd(head.id, product.id, { name: "A4", existingName: " a4 " })).toMatchObject(
      refused({ existingName: "errors.field.taken" }),
    );
    expect(await rowsOf(product.id)).toMatchObject([{ isDefault: true, name: "default" }]);
    expect((await productRow(product.id)).hasVariants).toBe(false);
  });

  it("history: the default's row shows it named for the existing items, the new row is a plain create, and the product shows hasVariants", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct({ referencePrice: 50_000n });
    const a4 = await add(head.id, product.id, { name: "A4", existingName: "A5" });
    const [named] = await auditRowsOf("product_variants", product.defaultVariantId);
    expect(named).toMatchObject({
      action: "subtype.create",
      actorId: head.id,
      before: {
        productId: product.id,
        product: product.name,
        name: "default",
        referencePrice: "50000",
      },
      after: {
        productId: product.id,
        product: product.name,
        name: "A5",
        referencePrice: "50000",
        isActive: true,
        fromDefault: true,
      },
    });
    expect((await auditRowsOf("product_variants", a4.id))[0]).toMatchObject({
      action: "subtype.create",
      before: null,
      after: { name: "A4", referencePrice: null },
    });
    const productRows = await auditRowsOf("products", product.id);
    expect(productRows).toHaveLength(1);
    expect(productRows[0]).toMatchObject({
      action: "product.update",
      before: { hasVariants: false },
      after: { hasVariants: true },
    });
    // A later subtype leaves the product's history alone.
    await add(head.id, product.id, { name: "A3" });
    expect(await auditRowsOf("products", product.id)).toHaveLength(1);
  });

  it("'Default' is a valid first name (decision 6)", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct();
    expect((await add(head.id, product.id, { name: "Default" })).name).toBe("Default");
  });
});

describe("the subtype's reference price (04 rule 4; decisions 2 and 4, Look first)", () => {
  it("default at 50 000 and the first subtype sent at 60 000: the new row takes 60 000 with its HEAD row, the default keeps 50 000 (D64)", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct({ referencePrice: 50_000n });
    const a4 = await add(head.id, product.id, { name: "A4", referencePrice: "60 000" });
    expect(a4.referencePrice).toBe(60_000n);
    expect(
      await db.select().from(priceHistory).where(eq(priceHistory.variantId, a4.id)),
    ).toMatchObject([{ price: 60_000n, source: "HEAD", setBy: head.id }]);
    expect((await rowsOf(product.id))[0]).toMatchObject({
      id: product.defaultVariantId,
      referencePrice: 50_000n,
    });
  });

  it("default empty and the first subtype sent at 60 000: the new row at 60 000, the default still empty", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct({ referencePrice: null });
    expect((await add(head.id, product.id, { referencePrice: "60 000" })).referencePrice).toBe(
      60_000n,
    );
    expect((await rowsOf(product.id))[0]).toMatchObject({
      id: product.defaultVariantId,
      referencePrice: null,
    });
  });

  it("a later subtype without a price has none: no fallback to the product's (decision 4)", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct({ referencePrice: 50_000n });
    await add(head.id, product.id);
    expect((await add(head.id, product.id)).referencePrice).toBeNull();
    expect((await add(head.id, product.id, { referencePrice: "7 500" })).referencePrice).toBe(
      7_500n,
    );
  });

  it("the price is whole so'm, more than 0, read by the one parser (developer-rules rule 6)", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct();
    await add(head.id, product.id);
    for (const referencePrice of ["0", "-5", "1.5", "12abc"]) {
      expect(await tryAdd(head.id, product.id, { referencePrice })).toMatchObject({
        ok: false,
        error: { code: "invalid_input" },
      });
    }
  });

  it("an update cannot change the price: a sent one is dropped (decision 2)", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct({ referencePrice: 50_000n });
    await add(head.id, product.id, { name: "A3", existingName: "A4" });
    expectOk(
      await runAction(updateSubtype, head.id, {
        id: product.defaultVariantId,
        name: "A4 80 g",
        referencePrice: "1",
      }),
    );
    expect((await rowsOf(product.id))[0]).toMatchObject({
      name: "A4 80 g",
      referencePrice: 50_000n,
    });
  });
});

describe("names are unique inside a product (04 rule 3)", () => {
  it("a duplicate inside the product is refused; the same name in another product is accepted", async () => {
    const head = await insertUser("HEAD");
    const one = await insertProduct();
    const two = await insertProduct();
    await add(head.id, one.id, { name: "Paper A4" });
    expect(await tryAdd(head.id, one.id, { name: "  paper   a4 " })).toMatchObject(
      refused({ name: "errors.field.taken" }),
    );
    await add(head.id, two.id, { name: "Paper A4" });
  });

  it("a rename into a sibling's name is refused, into another product's is accepted", async () => {
    const head = await insertUser("HEAD");
    const one = await insertProduct();
    const two = await insertProduct();
    await add(head.id, one.id, { name: "Ko'k" });
    const red = await add(head.id, one.id, { name: "Qizil" });
    await add(head.id, two.id, { name: "Yashil" });
    expect(await runAction(updateSubtype, head.id, { id: red.id, name: "KO'K" })).toMatchObject(
      refused({ name: "errors.field.taken" }),
    );
    expectOk(await runAction(updateSubtype, head.id, { id: red.id, name: "Yashil" }));
  });

  it("two creates at once with one name in one product: one subtype, the other taken", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct();
    await add(head.id, product.id);
    const outcomes = await runTogether(
      ["Sariq", "SARIQ"].map((name) => async (meet: () => Promise<void>) => {
        const input = { clientKey: newClientKey(), productId: product.id, name };
        await meet();
        return runAction(createSubtype, head.id, input);
      }),
    );
    const answers = outcomes.map((outcome) => {
      expect(outcome.status).toBe("fulfilled");
      return (outcome as PromiseFulfilledResult<ActionResult<Created>>).value;
    });
    expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
    expect(answers.find((answer) => !answer.ok)).toMatchObject(
      refused({ name: "errors.field.taken" }),
    );
  });

  it("two first subtypes of one product at once: one names the default, both are new rows (spec review, Should fix 2; D64)", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct({ referencePrice: 50_000n });
    const outcomes = await runTogether(
      ["Birinchi", "Ikkinchi"].map((name) => async (meet: () => Promise<void>) => {
        const input = {
          clientKey: newClientKey(),
          productId: product.id,
          name,
          existingName: "Eski",
        };
        await meet();
        return runAction(createSubtype, head.id, input);
      }),
    );
    const answers = outcomes.map((outcome) => {
      expect(outcome.status).toBe("fulfilled");
      return (outcome as PromiseFulfilledResult<ActionResult<Created>>).value;
    });
    expect(answers.every((answer) => answer.ok)).toBe(true);
    const rows = await rowsOf(product.id);
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.isDefault)).toHaveLength(0);
    expect(rows.find((row) => row.id === product.defaultVariantId)!.name).toBe("Eski");
    expect(rows.filter((row) => row.id === product.defaultVariantId)).toHaveLength(1);
    expect(rows.find((row) => row.id === product.defaultVariantId)!.referencePrice).toBe(50_000n);
    expect((await productRow(product.id)).hasVariants).toBe(true);
  });

  it("a rename racing a create with one name: a field error, never the index's 23505", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct();
    await add(head.id, product.id);
    const other = await add(head.id, product.id, { name: "Eski" });
    const outcomes = await runTogether<ActionResult<unknown>>([
      async (meet: () => Promise<void>) => {
        const input = { clientKey: newClientKey(), productId: product.id, name: "Oq" };
        await meet();
        return runAction(createSubtype, head.id, input);
      },
      async (meet: () => Promise<void>) => {
        await meet();
        return runAction(updateSubtype, head.id, { id: other.id, name: "oq" });
      },
    ]);
    const answers = outcomes.map((outcome) => {
      expect(outcome.status).toBe("fulfilled");
      return (outcome as PromiseFulfilledResult<ActionResult<unknown>>).value;
    });
    expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
    expect(answers.find((answer) => !answer.ok)).toMatchObject(
      refused({ name: "errors.field.taken" }),
    );
  });
});

describe("photos: one holder per file (owners.ts contract; decision 8)", () => {
  it("a subtype's photo is seen through catalog.pick and is a held file", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct();
    const photo = await insertFileRow(head.id);
    expect(await accessOf(db, photo.id)).toBeNull();
    await add(head.id, product.id, { photoFileId: photo.id });
    expect(await accessOf(db, photo.id)).toEqual({ permission: "catalog.pick" });
  });

  it("a file a product or another subtype holds, or another user's upload, is refused", async () => {
    const head = await insertUser("HEAD");
    const other = await insertUser("HEAD");
    const productPhoto = await insertFileRow(head.id);
    const product = await insertProduct({ photoFileId: productPhoto.id });
    const subtypePhoto = await insertFileRow(head.id);
    await add(head.id, product.id, { photoFileId: subtypePhoto.id });
    const notAllowed = refused({ photoFileId: "errors.field.notAllowed" });
    expect(await tryAdd(head.id, product.id, { photoFileId: productPhoto.id })).toMatchObject(
      notAllowed,
    );
    expect(await tryAdd(head.id, product.id, { photoFileId: subtypePhoto.id })).toMatchObject(
      notAllowed,
    );
    const theirs = await insertFileRow(other.id);
    expect(await tryAdd(head.id, product.id, { photoFileId: theirs.id })).toMatchObject(notAllowed);
    // A free file of the actor passes beside them (D40); a PDF is not a photo.
    await add(head.id, product.id, { photoFileId: (await insertFileRow(head.id)).id });
    const pdf = await insertFileRow(head.id, "application/pdf");
    expect(await tryAdd(head.id, product.id, { photoFileId: pdf.id })).toMatchObject(
      refused({ photoFileId: "errors.field.notAPhoto" }),
    );
  });

  it("the reverse: createProduct and updateProduct refuse a file a subtype holds (Should fix 4)", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct();
    const photo = await insertFileRow(head.id);
    await add(head.id, product.id, { photoFileId: photo.id });
    const category = await insertCategory();
    const unit = await insertUnit();
    const notAllowed = refused({ photoFileId: "errors.field.notAllowed" });
    expect(
      await runAction(createProduct, head.id, {
        clientKey: newClientKey(),
        name: `Rasmli ${newClientKey()}`,
        categoryId: category.id,
        unitId: unit.id,
        photoFileId: photo.id,
      }),
    ).toMatchObject(notAllowed);
    expect(
      await runAction(updateProduct, head.id, { id: product.id, photoFileId: photo.id }),
    ).toMatchObject(notAllowed);
  });
});

describe("deactivating and the default row (decision 3, Look first; 04 rule 2)", () => {
  it("the last active subtype is refused, with an inactive sibling and another product's active one beside it", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct();
    const [kept, sibling] = await insertSubtypes(product.id, [{}, { isActive: false }]);
    expect(sibling).toBeDefined();
    const elsewhere = await insertProduct();
    await insertSubtypes(elsewhere.id, [{}, {}]);
    expect(await runAction(setSubtypeActive, head.id, { id: kept!, active: false })).toMatchObject({
      ok: false,
      error: { code: "wrong_status" },
    });
  });

  it("with another active sibling it passes, the same data beside it (D40)", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct();
    const [first] = await insertSubtypes(product.id, [{}, {}, { isActive: false }]);
    const elsewhere = await insertProduct();
    await insertSubtypes(elsewhere.id, [{}]);
    const result = expectOk(
      await runAction(setSubtypeActive, head.id, { id: first!, active: false }),
    ) as { isActive: boolean };
    expect(result.isActive).toBe(false);
    const rows = await auditRowsOf("product_variants", first!);
    expect(rows.at(-1)).toMatchObject({
      action: "subtype.deactivate",
      before: { productId: product.id, product: product.name, isActive: true },
      after: { productId: product.id, product: product.name, isActive: false },
    });
    expectOk(await runAction(setSubtypeActive, head.id, { id: first!, active: true }));
    expect((await auditRowsOf("product_variants", first!)).at(-1)).toMatchObject({
      action: "subtype.activate",
    });
  });

  it("the default row is not found to update and to setActive", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct();
    const notFound = { ok: false, error: { code: "not_found" } };
    expect(
      await runAction(updateSubtype, head.id, { id: product.defaultVariantId, name: "Ko'rinadi" }),
    ).toMatchObject(notFound);
    expect(
      await runAction(setSubtypeActive, head.id, { id: product.defaultVariantId, active: false }),
    ).toMatchObject(notFound);
    expect((await rowsOf(product.id))[0]).toMatchObject({ name: "default", isActive: true });
  });

  it("an update writes its row with the product and the photo's file name", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct();
    const sub = await add(head.id, product.id, { name: "Birinchi" });
    const photo = await insertFileRow(head.id);
    expectOk(await runAction(updateSubtype, head.id, { id: sub.id, photoFileId: photo.id }));
    expect((await auditRowsOf("product_variants", sub.id)).at(-1)).toMatchObject({
      action: "subtype.update",
      before: { productId: product.id, product: product.name, photoFileId: null, photo: null },
      after: {
        productId: product.id,
        product: product.name,
        photoFileId: photo.id,
        photo: "rasm.jpg",
      },
    });
  });
});

describe("an inactive or unknown product (decision 5)", () => {
  it("an inactive product takes no new subtype; an unknown one is not allowed", async () => {
    const head = await insertUser("HEAD");
    const inactive = await insertProduct({ isActive: false });
    expect(await tryAdd(head.id, inactive.id)).toMatchObject(
      refused({ productId: "errors.field.inactive" }),
    );
    expect(await tryAdd(head.id, newClientKey())).toMatchObject(
      refused({ productId: "errors.field.notAllowed" }),
    );
    const active = await insertProduct();
    await add(head.id, active.id);
  });

  it("the subtypes of an inactive product can still be renamed (D41)", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct();
    const sub = await add(head.id, product.id, { name: "Band" });
    await db.update(products).set({ isActive: false }).where(eq(products.id, product.id));
    expectOk(await runAction(updateSubtype, head.id, { id: sub.id, name: "Bo'sh" }));
  });
});

describe("the same client key twice (developer-rules rule 8)", () => {
  it("gives the first subtype and writes nothing more", async () => {
    const head = await insertUser("HEAD");
    const product = await insertProduct();
    const input = {
      clientKey: newClientKey(),
      productId: product.id,
      name: "Bir marta",
      existingName: "Avvalgi",
    };
    const first = expectOk(
      (await runAction(createSubtype, head.id, input)) as ActionResult<Created>,
    );
    const again = expectOk(
      (await runAction(createSubtype, head.id, input)) as ActionResult<Created>,
    );
    expect(again.entry).toEqual(first.entry);
    // The new row and the default named for the existing items; the key is on the new row only.
    expect(await rowsOf(product.id)).toHaveLength(2);
    expect(first.entry.id).not.toBe(product.defaultVariantId);
    expect(await auditRowsOf("product_variants", first.entry.id)).toHaveLength(1);
  });
});

function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const { code } = result.error;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

// "Manage catalogs, users, branches, settings": the Head only (03, Permission matrix).
describePermissionMatrix("createSubtype", {
  permission: "catalog.manage",
  async run({ user }) {
    const product = await insertProduct();
    asMatrixAnswer(
      await runAction(createSubtype, user.id, {
        clientKey: newClientKey(),
        productId: product.id,
        name: `Matritsa ${newClientKey()}`,
        existingName: "Mavjud",
      }),
    );
  },
});

describePermissionMatrix("updateSubtype", {
  permission: "catalog.manage",
  async run({ user }) {
    const product = await insertProduct();
    const [id] = await insertSubtypes(product.id, [{}]);
    asMatrixAnswer(
      await runAction(updateSubtype, user.id, { id: id!, name: `Matritsa ${newClientKey()}` }),
    );
  },
});

describePermissionMatrix("setSubtypeActive", {
  permission: "catalog.manage",
  async run({ user }) {
    const product = await insertProduct();
    const [id] = await insertSubtypes(product.id, [{}, {}]);
    asMatrixAnswer(await runAction(setSubtypeActive, user.id, { id: id!, active: false }));
  },
});
