import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

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
import { searchDraftProducts } from "@/features/orders/queries/draft-picker";

import { setManagerRight, insertBranch } from "../../../../tests/helpers/branches";
import {
  insertCategory,
  insertCompany,
  insertFileRow,
  insertProduct,
  insertSubtypes,
  insertUnit,
} from "../../../../tests/helpers/catalog";
import { addDraft, insertDepartment, insertOrder } from "../../../../tests/helpers/orders";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { receive } from "../../../../tests/helpers/stock-documents";
import { insertUser } from "../../../../tests/helpers/users";
import { listUncheckedAdded } from "../queries/manager-adds";
import {
  type ProductAdd,
  type SubtypeAdd,
  addProductWhileOrdering,
  addSubtypeWhileOrdering,
  markAddedChecked,
  subtypeAddShown,
} from "./manager-adds";

// 04-catalogs.md rule 8 ("Managers add products and subtypes"), rule 3 ("No duplicates"), rule 2;
// 03-roles-and-permissions.md (Manager rights: ADD_PRODUCTS; Permission matrix); 15 S22;
// developer-rules.md rule 8; build-plan 1.12b and its plan. Every fixture is asserted (D38); every
// passing case has the refused data beside it (D40).

/** A refusal of the matrix as the generator reads it; any other answer fails the case. */
function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const code = result.error.code;
  if (code === "forbidden" || code === "not_found") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

function expectOk<T>(result: ActionResult<T>): T {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
}

const tag = () => randomUUID().slice(0, 8);

async function scene() {
  const branch = await insertBranch();
  const manager = await insertUser("MANAGER", { branches: [branch.id] });
  const head = await insertUser("HEAD");
  const category = await insertCategory();
  const unit = await insertUnit();
  return { branch, manager, head, category, unit };
}

function addProduct(userId: string, input: Record<string, unknown>) {
  return runAction(addProductWhileOrdering, userId, {
    clientKey: randomUUID(),
    ...input,
  }) as Promise<ActionResult<ProductAdd>>;
}

function addSubtype(userId: string, input: Record<string, unknown>) {
  return runAction(addSubtypeWhileOrdering, userId, {
    clientKey: randomUUID(),
    ...input,
  }) as Promise<ActionResult<SubtypeAdd>>;
}

async function productRow(id: string) {
  const [row] = await db.select().from(products).where(eq(products.id, id));
  return row!;
}

async function variantRow(id: string) {
  const [row] = await db.select().from(productVariants).where(eq(productVariants.id, id));
  return row!;
}

async function productCount(name: string) {
  const rows = await db.select({ id: products.id }).from(products).where(eq(products.name, name));
  return rows.length;
}

describe("S22: a Manager adds what is missing (15-quality-and-acceptance.md; 04 rule 8)", () => {
  it("the marker, the existing notebook offered, the first subtype of Pen, the Head's list, the right off", async () => {
    const { branch, manager, head, unit } = await scene();
    const stationery = await insertCategory({ name: `Stationery ${tag()}` });
    const suffix = tag();

    // "Marker, black", not in the catalog, added as a product in Stationery, in pcs.
    const markerName = `Marker, black ${suffix}`;
    const marker = expectOk(
      await addProduct(manager.id, {
        name: markerName,
        categoryId: stationery.id,
        unitId: unit.id,
      }),
    );
    expect(marker.outcome).toBe("made");
    if (marker.outcome !== "made") return;
    const markerRow = await productRow(marker.productId);
    expect(markerRow).toMatchObject({
      name: markerName,
      type: "GOODS",
      categoryId: stationery.id,
      unitId: unit.id,
      referencePrice: null,
      addedBy: manager.id,
      checkedAt: null,
    });
    expect(
      await db.select().from(priceHistory).where(eq(priceHistory.variantId, marker.variantId)),
    ).toEqual([]);
    // On the draft at once, with no price suggested and no price hint.
    const markerDraft = expectOk(
      await addDraft(manager.id, {
        branchId: branch.id,
        variantId: marker.variantId,
        departmentId: (await insertDepartment(branch.id)).id,
      }),
    );
    expect(markerDraft).toMatchObject({ merged: false });
    const [markerHit] = await searchDraftProducts(manager.id, {
      branchId: branch.id,
      q: markerName,
    });
    expect(markerHit!.subtypes).toMatchObject([
      { id: marker.variantId, referencePrice: null, suggestedPrice: null },
    ]);

    // "daftar 48 VARAQ" while "Daftar 48 varaq" exists: the existing one is offered.
    const notebook = await insertProduct({ name: `Daftar 48 varaq ${suffix}` });
    const offered = expectOk(
      await addProduct(manager.id, {
        name: `daftar  48 VARAQ ${suffix.toUpperCase()}`,
        categoryId: stationery.id,
        unitId: unit.id,
      }),
    );
    expect(offered).toEqual({
      outcome: "exists",
      productId: notebook.id,
      name: `Daftar 48 varaq ${suffix}`,
      isActive: true,
    });
    expect(await productCount(`daftar  48 VARAQ ${suffix.toUpperCase()}`)).toBe(0);

    // "black" added to "Pen", which had no subtypes, 40 in stock and two orders; the existing
    // ones named "blue".
    const pen = await insertProduct({ name: `Pen ${suffix}`, referencePrice: 3000n });
    const penPhoto = await insertFileRow(head.id);
    await db
      .update(productVariants)
      .set({ photoFileId: penPhoto.id })
      .where(eq(productVariants.id, pen.defaultVariantId));
    await receive(branch.id, pen.defaultVariantId, "40", 2500n, head.id);
    const first = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PURCHASING",
      variantId: pen.defaultVariantId,
    });
    const second = await insertOrder({
      branchId: branch.id,
      ownerId: manager.id,
      status: "PENDING_HEAD",
      variantId: pen.defaultVariantId,
    });
    const black = expectOk(
      await addSubtype(manager.id, { productId: pen.id, name: "black", existingName: "blue" }),
    );
    expect(black.outcome).toBe("made");
    if (black.outcome !== "made") return;
    expect(black.variantId).not.toBe(pen.defaultVariantId);

    const blue = await variantRow(pen.defaultVariantId);
    expect(blue).toMatchObject({
      name: "blue",
      isDefault: false,
      referencePrice: 3000n,
      photoFileId: penPhoto.id,
      addedBy: null,
      clientKey: null,
    });
    expect((await productRow(pen.id)).hasVariants).toBe(true);
    const ordersNow = await db
      .select({ id: orders.id, variantId: orders.variantId })
      .from(orders)
      .where(eq(orders.variantId, pen.defaultVariantId));
    expect(ordersNow.map((row) => row.id).toSorted()).toEqual([first.id, second.id].toSorted());
    const [stock] = await db
      .select({ qty: stockBalances.qty, variantId: stockBalances.variantId })
      .from(stockBalances)
      .where(
        and(
          eq(stockBalances.branchId, branch.id),
          eq(stockBalances.variantId, pen.defaultVariantId),
        ),
      );
    expect(stock!.qty).toBe("40.000");
    expect(await variantRow(black.variantId)).toMatchObject({
      productId: pen.id,
      name: "black",
      isDefault: false,
      referencePrice: null,
      addedBy: manager.id,
    });
    // The new draft uses "Pen · black", with no suggested price.
    const [penHit] = await searchDraftProducts(manager.id, {
      branchId: branch.id,
      q: `Pen ${suffix}`,
    });
    expect(penHit!.subtypes).toMatchObject([
      { id: black.variantId, name: "black", inStock: "0", suggestedPrice: null },
      { id: pen.defaultVariantId, name: "blue", inStock: "40", suggestedPrice: 3000n },
    ]);

    // The Head's home lists the marker and "black", not "blue", until marked checked.
    const listed = await listUncheckedAdded(head.id, { limit: 200 });
    const ids = listed.rows.map((row) => row.id);
    expect(ids).toEqual(expect.arrayContaining([marker.productId, black.variantId]));
    expect(ids).not.toContain(pen.defaultVariantId);
    expect(ids).not.toContain(notebook.id);
    expectOk(
      await runAction(markAddedChecked, head.id, {
        productIds: [marker.productId],
        subtypeIds: [black.variantId],
      }),
    );
    const after = (await listUncheckedAdded(head.id, { limit: 200 })).rows.map((row) => row.id);
    expect(after).not.toContain(marker.productId);
    expect(after).not.toContain(black.variantId);

    // With the right off the server refuses the add.
    await setManagerRight(manager.id, "ADD_PRODUCTS", false);
    expect(
      await addProduct(manager.id, {
        name: `Marker, red ${suffix}`,
        categoryId: stationery.id,
        unitId: unit.id,
      }),
    ).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(await addSubtype(manager.id, { productId: pen.id, name: "red" })).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
    expect(await productCount(`Marker, red ${suffix}`)).toBe(0);
  });
});

describe("addProductWhileOrdering (04 rule 8: a new product)", () => {
  it("03 Manager rights: a Manager with ADD_PRODUCTS off is refused; Principal and Finance are refused", async () => {
    const { branch, manager, category, unit } = await scene();
    await setManagerRight(manager.id, "ADD_PRODUCTS", false);
    const principal = await insertUser("PRINCIPAL", { branches: [branch.id] });
    const finance = await insertUser("FINANCE", { branches: [branch.id] });
    for (const user of [manager, principal, finance]) {
      const name = `Yo'q ${tag()}`;
      expect(
        await addProduct(user.id, { name, categoryId: category.id, unitId: unit.id }),
      ).toMatchObject({ ok: false, error: { code: "forbidden" } });
      expect(await productCount(name)).toBe(0);
    }
    // Another Manager of the branch with the right on adds (D40).
    const colleague = await insertUser("MANAGER", { branches: [branch.id] });
    expect(
      (
        await addProduct(colleague.id, {
          name: `Bor ${tag()}`,
          categoryId: category.id,
          unitId: unit.id,
        })
      ).ok,
    ).toBe(true);
  });

  it("developer-rules rule 8: the same browser id twice makes one product and gives the first result", async () => {
    const { manager, category, unit } = await scene();
    const clientKey = randomUUID();
    const name = `Takror ${tag()}`;
    const input = { clientKey, name, categoryId: category.id, unitId: unit.id };
    const first = expectOk(await addProduct(manager.id, input));
    const again = expectOk(await addProduct(manager.id, input));
    expect(again).toEqual(first);
    expect(await productCount(name)).toBe(1);
  });

  it("04 rule 3: a name differing only in capitals and spaces is refused and the existing entry is returned; an inactive one is named and stays inactive", async () => {
    const { manager, category, unit } = await scene();
    const suffix = tag();
    const active = await insertProduct({ name: `Qog'oz A4 ${suffix}` });
    const inactive = await insertProduct({ name: `Skrepka ${suffix}`, isActive: false });
    expect(
      expectOk(
        await addProduct(manager.id, {
          name: `  qog'oz   a4 ${suffix} `,
          categoryId: category.id,
          unitId: unit.id,
        }),
      ),
    ).toEqual({
      outcome: "exists",
      productId: active.id,
      name: `Qog'oz A4 ${suffix}`,
      isActive: true,
    });
    expect(
      expectOk(
        await addProduct(manager.id, {
          name: `SKREPKA ${suffix}`,
          categoryId: category.id,
          unitId: unit.id,
        }),
      ),
    ).toEqual({
      outcome: "exists",
      productId: inactive.id,
      name: `Skrepka ${suffix}`,
      isActive: false,
    });
    expect((await productRow(inactive.id)).isActive).toBe(false);
    // Nothing written: no audit row for either name.
    const rows = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.actorId, manager.id), eq(auditLog.action, "product.create")));
    expect(rows).toEqual([]);
  });

  it("04 rule 8: no reference price, brand or description is taken from a Manager", async () => {
    const { manager, category, unit } = await scene();
    const company = await insertCompany();
    const made = expectOk(
      await addProduct(manager.id, {
        name: `Narxsiz ${tag()}`,
        type: "SERVICE",
        categoryId: category.id,
        unitId: unit.id,
        referencePrice: "5000",
        defaultCompanyId: company.id,
        description: "Tavsif",
      }),
    );
    expect(made.outcome).toBe("made");
    const row = await productRow(made.productId);
    expect(row).toMatchObject({
      type: "SERVICE",
      referencePrice: null,
      defaultCompanyId: null,
      description: null,
    });
  });

  it("04 rule 2: an inactive category or measure is refused", async () => {
    const { manager, category, unit } = await scene();
    const oldCategory = await insertCategory({ isActive: false });
    const oldUnit = await insertUnit({ isActive: false });
    expect(
      await addProduct(manager.id, {
        name: `Eski ${tag()}`,
        categoryId: oldCategory.id,
        unitId: unit.id,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { categoryId: "errors.field.inactive" } },
    });
    expect(
      await addProduct(manager.id, {
        name: `Eski ${tag()}`,
        categoryId: category.id,
        unitId: oldUnit.id,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { unitId: "errors.field.inactive" } },
    });
  });

  it("the photo is the Manager's own upload: another person's is refused, their own is taken", async () => {
    const { manager, head, category, unit } = await scene();
    const othersPhoto = await insertFileRow(head.id);
    expect(
      await addProduct(manager.id, {
        name: `Rasm ${tag()}`,
        categoryId: category.id,
        unitId: unit.id,
        photoFileId: othersPhoto.id,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { photoFileId: "errors.field.notAllowed" } },
    });
    const own = await insertFileRow(manager.id);
    const made = expectOk(
      await addProduct(manager.id, {
        name: `Rasm ${tag()}`,
        categoryId: category.id,
        unitId: unit.id,
        photoFileId: own.id,
      }),
    );
    expect(made.outcome === "made" && (await productRow(made.productId)).photoFileId).toBe(own.id);
  });

  it("04 rule 8: the Head's own add writes no added_by and stays off the Head's list", async () => {
    const { head, category, unit } = await scene();
    const made = expectOk(
      await addProduct(head.id, {
        name: `Rahbar ${tag()}`,
        categoryId: category.id,
        unitId: unit.id,
      }),
    );
    expect(made.outcome).toBe("made");
    if (made.outcome !== "made") return;
    expect((await productRow(made.productId)).addedBy).toBeNull();
    const ids = (await listUncheckedAdded(head.id, { limit: 200 })).rows.map((row) => row.id);
    expect(ids).not.toContain(made.productId);
    // The audit row of the create is written, as for the Head's own create (04 rule 9).
    const audit = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, made.productId), eq(auditLog.action, "product.create")));
    expect(audit).toHaveLength(1);
  });
});

describe("addSubtypeWhileOrdering (04 rule 8: a new subtype)", () => {
  it("developer-rules rule 8: on a product without subtypes the same id twice makes one new subtype and returns it, never the renamed default", async () => {
    const { manager } = await scene();
    const product = await insertProduct();
    const clientKey = randomUUID();
    const input = { clientKey, productId: product.id, name: "96 varaq", existingName: "48 varaq" };
    const first = subtypeAddShown(expectOk(await addSubtype(manager.id, input)));
    const again = subtypeAddShown(expectOk(await addSubtype(manager.id, input)));
    expect(first.outcome).toBe("made");
    expect(again).toEqual(first);
    expect(first.outcome === "made" && first.variantId).not.toBe(product.defaultVariantId);
    expect(first.outcome === "made" && first.name).toBe("96 varaq");
    const rows = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, product.id));
    expect(rows).toHaveLength(2);
    expect((await variantRow(product.defaultVariantId)).clientKey).toBeNull();
  });

  it("developer-rules rule 8: on a product with subtypes the same id twice makes one subtype", async () => {
    const { manager } = await scene();
    const product = await insertProduct();
    await insertSubtypes(product.id, [{ name: "qizil" }]);
    const input = { clientKey: randomUUID(), productId: product.id, name: "yashil" };
    const first = subtypeAddShown(expectOk(await addSubtype(manager.id, input)));
    expect(subtypeAddShown(expectOk(await addSubtype(manager.id, input)))).toEqual(first);
    const rows = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, product.id));
    expect(rows.map((row) => row.name).toSorted()).toEqual(["qizil", "yashil"]);
  });

  it("04 rule 3: a subtype name the product holds, in other capitals and spaces, is returned; an inactive one is named and stays inactive", async () => {
    const { manager } = await scene();
    const product = await insertProduct();
    const [red, green] = await insertSubtypes(product.id, [
      { name: "Qizil" },
      { name: "Yashil", isActive: false },
    ]);
    // The same name under another product does not count.
    const other = await insertProduct();
    await insertSubtypes(other.id, [{ name: "Ko'k" }]);
    expect(
      expectOk(await addSubtype(manager.id, { productId: product.id, name: " qizil " })),
    ).toEqual({
      outcome: "exists",
      productId: product.id,
      variantId: red,
      name: "Qizil",
      isActive: true,
    });
    expect(
      expectOk(await addSubtype(manager.id, { productId: product.id, name: "YASHIL" })),
    ).toEqual({
      outcome: "exists",
      productId: product.id,
      variantId: green,
      name: "Yashil",
      isActive: false,
    });
    expect((await variantRow(green!)).isActive).toBe(false);
    expect(
      expectOk(await addSubtype(manager.id, { productId: product.id, name: "ko'k" })).outcome,
    ).toBe("made");
  });

  it("04 rule 8: on a product without subtypes the existing items' name is required and must differ from the new one", async () => {
    const { manager } = await scene();
    const product = await insertProduct();
    expect(await addSubtype(manager.id, { productId: product.id, name: "black" })).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { existingName: "errors.field.required" } },
    });
    expect(
      await addSubtype(manager.id, {
        productId: product.id,
        name: "black",
        existingName: " BLACK ",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { existingName: "errors.field.taken" } },
    });
    const default_ = await variantRow(product.defaultVariantId);
    expect(default_).toMatchObject({ isDefault: true, name: "default" });
  });

  it("decided item 7: on a product with subtypes the existing name is ignored and no subtype is renamed", async () => {
    const { manager } = await scene();
    const product = await insertProduct();
    const [red] = await insertSubtypes(product.id, [{ name: "qizil" }]);
    const made = expectOk(
      await addSubtype(manager.id, {
        productId: product.id,
        name: "sariq",
        existingName: "boshqa",
      }),
    );
    expect(made.outcome).toBe("made");
    expect((await variantRow(red!)).name).toBe("qizil");
  });

  it("04 rule 8: a Manager cannot set a price or edit an existing entry through the action", async () => {
    const { manager } = await scene();
    const product = await insertProduct({ referencePrice: 4000n });
    const [kept] = await insertSubtypes(product.id, [{ name: "eski", referencePrice: 4500n }]);
    const before = await variantRow(kept!);
    const made = expectOk(
      await addSubtype(manager.id, {
        productId: product.id,
        name: "yangi",
        referencePrice: "9000",
      }),
    );
    expect(made.outcome === "made" && (await variantRow(made.variantId)).referencePrice).toBeNull();
    // The existing name, sent with other fields, changes nothing.
    expect(
      expectOk(
        await addSubtype(manager.id, { productId: product.id, name: "ESKI", referencePrice: "1" }),
      ).outcome,
    ).toBe("exists");
    expect(await variantRow(kept!)).toEqual(before);
  });

  it("04 rule 2: an inactive product takes no new subtype", async () => {
    const { manager } = await scene();
    const product = await insertProduct({ isActive: false });
    expect(
      await addSubtype(manager.id, { productId: product.id, name: "yangi", existingName: "eski" }),
    ).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { productId: "errors.field.inactive" } },
    });
  });

  it("04 rule 9: the history keeps the default named for the existing items and the new subtype", async () => {
    const { manager } = await scene();
    const product = await insertProduct();
    const made = expectOk(
      await addSubtype(manager.id, {
        productId: product.id,
        name: "96 varaq",
        existingName: "48 varaq",
      }),
    );
    if (made.outcome !== "made") throw new Error("not made");
    const [named] = await db
      .select()
      .from(auditLog)
      .where(
        and(eq(auditLog.entityId, product.defaultVariantId), eq(auditLog.action, "subtype.create")),
      );
    expect(named).toMatchObject({
      before: { name: "default" },
      after: { name: "48 varaq", fromDefault: true },
    });
    const [created] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, made.variantId), eq(auditLog.action, "subtype.create")));
    expect(created).toMatchObject({ before: null, after: { name: "96 varaq" } });
    const [change] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, product.id), eq(auditLog.action, "product.update")));
    expect(change).toMatchObject({ before: { hasVariants: false }, after: { hasVariants: true } });
  });
});

describe("markAddedChecked (04 rule 8: until the Head marks them checked)", () => {
  async function added() {
    const { manager, head, category, unit } = await scene();
    const made = expectOk(
      await addProduct(manager.id, {
        name: `Yangi ${tag()}`,
        categoryId: category.id,
        unitId: unit.id,
      }),
    );
    const product = await insertProduct();
    await insertSubtypes(product.id, [{ name: "a" }]);
    const sub = expectOk(await addSubtype(manager.id, { productId: product.id, name: "b" }));
    if (made.outcome !== "made" || sub.outcome !== "made") throw new Error("not made");
    return { head, manager, productId: made.productId, subtypeId: sub.variantId };
  }

  it("marks one or many checked, with an audit row each", async () => {
    const { head, productId, subtypeId } = await added();
    expectOk(
      await runAction(markAddedChecked, head.id, {
        productIds: [productId],
        subtypeIds: [subtypeId],
      }),
    );
    expect((await productRow(productId)).checkedAt).not.toBeNull();
    expect((await variantRow(subtypeId)).checkedAt).not.toBeNull();
    const rows = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.actorId, head.id)));
    expect(rows.map((row) => [row.action, row.entityId]).toSorted()).toEqual(
      [
        ["product.check", productId],
        ["subtype.check", subtypeId],
      ].toSorted(),
    );
  });

  it("is all or nothing: an already checked or a Head-made entry refuses the whole action", async () => {
    const { head, productId, subtypeId } = await added();
    const headMade = await insertProduct();
    expect(
      await runAction(markAddedChecked, head.id, {
        productIds: [productId, headMade.id],
        subtypeIds: [subtypeId],
      }),
    ).toMatchObject({ ok: false, error: { code: "wrong_status" } });
    expect((await productRow(productId)).checkedAt).toBeNull();
    expect((await variantRow(subtypeId)).checkedAt).toBeNull();
    expectOk(await runAction(markAddedChecked, head.id, { productIds: [productId] }));
    expect(
      await runAction(markAddedChecked, head.id, {
        productIds: [productId],
        subtypeIds: [subtypeId],
      }),
    ).toMatchObject({ ok: false, error: { code: "wrong_status" } });
    expect((await variantRow(subtypeId)).checkedAt).toBeNull();
  });

  it("an unknown id is not found and nothing is written", async () => {
    const { head, productId } = await added();
    expect(
      await runAction(markAddedChecked, head.id, { productIds: [productId, randomUUID()] }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect((await productRow(productId)).checkedAt).toBeNull();
  });
});

describePermissionMatrix("addProductWhileOrdering", {
  permission: "catalog.add",
  async run({ user }) {
    const category = await insertCategory();
    const unit = await insertUnit();
    const result = await addProduct(user.id, {
      name: `Matritsa ${tag()}`,
      categoryId: category.id,
      unitId: unit.id,
    });
    asMatrixAnswer(result);
  },
});

describePermissionMatrix("addSubtypeWhileOrdering", {
  permission: "catalog.add",
  async run({ user }) {
    const product = await insertProduct();
    const result = await addSubtype(user.id, {
      productId: product.id,
      name: "yangi",
      existingName: "eski",
    });
    asMatrixAnswer(result);
  },
});

describePermissionMatrix("markAddedChecked", {
  permission: "catalog.manage",
  async run({ user }) {
    const { manager, category, unit } = await scene();
    const made = expectOk(
      await addProduct(manager.id, {
        name: `Belgi ${tag()}`,
        categoryId: category.id,
        unitId: unit.id,
      }),
    );
    if (made.outcome !== "made") throw new Error("not made");
    const result = await runAction(markAddedChecked, user.id, { productIds: [made.productId] });
    asMatrixAnswer(result);
  },
});

describePermissionMatrix("listUncheckedAdded", {
  permission: "catalog.manage",
  run: ({ user }) => listUncheckedAdded(user.id, { limit: 5 }),
});
