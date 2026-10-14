import { and, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { newClientKey } from "@/components/client-key";
import { runAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import { auditLog, categories, products } from "@/server/db/schema";
import { accessOf } from "@/server/files/owners";

import {
  insertCategory,
  insertCompany,
  insertFileRow,
  insertProduct,
  insertUnit,
} from "../../../../tests/helpers/catalog";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { runTogether } from "../../../../tests/helpers/together";
import { insertUser } from "../../../../tests/helpers/users";
import { type ProductUse, productInUse } from "./product-uses";
import { createProduct, setProductActive, updateProduct } from "./products";

// build-plan 1.7, Done when: "a new item is a product unless service is chosen; a duplicate name
// is refused". 04-catalogs.md, Catalogs table (Products and services: "product is the default";
// "Type and measure lock after first use"); rules 2, 3, 6, 9; A7; developer-rules.md rules 6, 8
// and 13; src/server/files/owners.ts (the attaching contract); plan of 1.7 and its review. Every
// fixture is asserted (D38); every passing case has the refused data beside it (D40).

type Product = {
  id: string;
  name: string;
  type: "GOODS" | "SERVICE";
  categoryId: string;
  unitId: string;
  defaultCompanyId: string | null;
  referencePrice: bigint | null;
  description: string | null;
  photoFileId: string | null;
  isActive: boolean;
};

function expectOk<T>(result: ActionResult<T>): T {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
}

function refused(fields: Record<string, string>) {
  return { ok: false, error: { code: "invalid_input", fields } };
}

async function references() {
  const category = await insertCategory();
  const unit = await insertUnit();
  return { categoryId: category.id, unitId: unit.id };
}

async function create(headId: string, input: Record<string, unknown> = {}): Promise<Product> {
  return expectOk(
    (await runAction(createProduct, headId, {
      clientKey: newClientKey(),
      name: `Mahsulot ${newClientKey()}`,
      ...(await references()),
      ...input,
    })) as ActionResult<Product>,
  );
}

function tryCreate(headId: string, input: Record<string, unknown>) {
  return runAction(createProduct, headId, { clientKey: newClientKey(), ...input });
}

function auditRowsOf(entityId: string) {
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entity, "products"), eq(auditLog.entityId, entityId)))
    .orderBy(auditLog.createdAt, auditLog.id);
}

async function rowOf(id: string) {
  const [row] = await db.select().from(products).where(eq(products.id, id));
  return row!;
}

describe("products: the type (04 Catalogs table; A7; build-plan 1.7, Done when)", () => {
  it("a new item is a product unless service is chosen", async () => {
    const head = await insertUser("HEAD");
    const product = await create(head.id);
    const service = await create(head.id, { type: "SERVICE" });
    expect(product.type).toBe("GOODS");
    expect(service.type).toBe("SERVICE");
    expect((await rowOf(product.id)).type).toBe("GOODS");
    expect((await rowOf(service.id)).type).toBe("SERVICE");
  });

  it("an edit that does not send the type keeps a service a service", async () => {
    const head = await insertUser("HEAD");
    const service = await create(head.id, { type: "SERVICE" });
    expectOk(
      await runAction(updateProduct, head.id, { id: service.id, name: `Ta'mir ${service.id}` }),
    );
    expect((await rowOf(service.id)).type).toBe("SERVICE");
  });

  it("a type outside GOODS and SERVICE is refused", async () => {
    const head = await insertUser("HEAD");
    expect(
      await tryCreate(head.id, { name: "Qalam", type: "PRODUCT", ...(await references()) }),
    ).toMatchObject(refused({ type: "errors.field.wrongFormat" }));
  });
});

describe("products: no duplicate names (04 rule 3; build-plan 1.7, Done when)", () => {
  it("a duplicate name is refused, ignoring capital letters and extra spaces", async () => {
    const head = await insertUser("HEAD");
    const name = `Qog'oz A4 ${newClientKey().slice(0, 6)}`;
    await create(head.id, { name });
    const taken = refused({ name: "errors.field.taken" });
    expect(await tryCreate(head.id, { name, ...(await references()) })).toMatchObject(taken);
    expect(
      await tryCreate(head.id, { name: `  ${name.toUpperCase()}  `, ...(await references()) }),
    ).toMatchObject(taken);
    // A different name passes beside it (D40).
    await create(head.id, { name: `${name} 80 g` });
  });

  it("a service cannot take a product's name, nor a name held by an inactive product (D41)", async () => {
    const head = await insertUser("HEAD");
    const name = `Bo'yoq ${newClientKey().slice(0, 6)}`;
    const held = await create(head.id, { name });
    expectOk(await runAction(setProductActive, head.id, { id: held.id, active: false }));
    expect(
      await tryCreate(head.id, { name, type: "SERVICE", ...(await references()) }),
    ).toMatchObject(refused({ name: "errors.field.taken" }));
    // Renaming the inactive product frees the name.
    expectOk(await runAction(updateProduct, head.id, { id: held.id, name: `${name} eski` }));
    await create(head.id, { name, type: "SERVICE" });
  });

  it("a rename into a held name is refused", async () => {
    const head = await insertUser("HEAD");
    const first = await create(head.id);
    const second = await create(head.id);
    expect(
      await runAction(updateProduct, head.id, { id: second.id, name: first.name.toLowerCase() }),
    ).toMatchObject(refused({ name: "errors.field.taken" }));
  });

  it("two creates of one name at once: one is saved, the other refused as taken", async () => {
    const head = await insertUser("HEAD");
    const name = `Marker ${newClientKey().slice(0, 6)}`;
    const refs = await references();
    const outcomes = await runTogether(
      [name, name.toUpperCase()].map((each) => async (meet: () => Promise<void>) => {
        const input = { clientKey: newClientKey(), name: each, ...refs };
        await meet();
        return runAction(createProduct, head.id, input);
      }),
    );
    const answers = outcomes.map((outcome) => {
      expect(outcome.status).toBe("fulfilled");
      return (outcome as PromiseFulfilledResult<ActionResult<Product>>).value;
    });
    expect(answers.filter((answer) => answer.ok)).toHaveLength(1);
    expect(answers.find((answer) => !answer.ok)).toMatchObject(
      refused({ name: "errors.field.taken" }),
    );
  });
});

describe("products: a repeated create (developer-rules.md rule 8)", () => {
  it("the same client key twice gives the first product, one row and one history row", async () => {
    const head = await insertUser("HEAD");
    const clientKey = newClientKey();
    const input = { clientKey, name: `Skotch ${clientKey}`, ...(await references()) };
    const first = expectOk(
      (await runAction(createProduct, head.id, input)) as ActionResult<Product>,
    );
    const again = expectOk(
      (await runAction(createProduct, head.id, input)) as ActionResult<Product>,
    );
    expect(again.id).toBe(first.id);
    expect(await db.select().from(products).where(eq(products.clientKey, clientKey))).toHaveLength(
      1,
    );
    expect(await auditRowsOf(first.id)).toHaveLength(1);
  });
});

describe("products: category, measure and company (04 rule 2; plan of 1.7, decisions 6, 7)", () => {
  it("category and measure are required", async () => {
    const head = await insertUser("HEAD");
    expect(await tryCreate(head.id, { name: `Yelim ${newClientKey()}` })).toMatchObject(
      refused({ categoryId: "errors.field.required", unitId: "errors.field.required" }),
    );
  });

  it("an unknown category, measure or company is not allowed", async () => {
    const head = await insertUser("HEAD");
    const unknown = newClientKey();
    for (const field of ["categoryId", "unitId", "defaultCompanyId"]) {
      expect(
        await tryCreate(head.id, {
          name: `Yelim ${newClientKey()}`,
          ...(await references()),
          [field]: unknown,
        }),
      ).toMatchObject(refused({ [field]: "errors.field.notAllowed" }));
    }
  });

  it("an inactive category, measure or company is refused on create; active ones pass", async () => {
    const head = await insertUser("HEAD");
    const inactive = {
      categoryId: (await insertCategory({ isActive: false })).id,
      unitId: (await insertUnit({ isActive: false })).id,
      defaultCompanyId: (await insertCompany({ isActive: false })).id,
    };
    for (const [field, id] of Object.entries(inactive)) {
      expect(
        await tryCreate(head.id, {
          name: `Yelim ${newClientKey()}`,
          ...(await references()),
          [field]: id,
        }),
      ).toMatchObject(refused({ [field]: "errors.field.inactive" }));
    }
    await create(head.id, { defaultCompanyId: (await insertCompany()).id });
  });

  it("a company of each kind can be the default brand or company (04: 'brand or company')", async () => {
    const head = await insertUser("HEAD");
    for (const kind of ["BRAND", "SUPPLIER", "BOTH"] as const) {
      const company = await insertCompany({ kind });
      const product = await create(head.id, { defaultCompanyId: company.id });
      expect(product.defaultCompanyId).toBe(company.id);
    }
  });

  it("on update: a change to an inactive entry is refused; an unchanged inactive one stays", async () => {
    const head = await insertUser("HEAD");
    const category = await insertCategory();
    const product = await create(head.id, { categoryId: category.id });
    const inactive = await insertCategory({ isActive: false });
    expect(
      await runAction(updateProduct, head.id, { id: product.id, categoryId: inactive.id }),
    ).toMatchObject(refused({ categoryId: "errors.field.inactive" }));
    // The product's own category is deactivated later: the product keeps it and can be edited.
    await db.execute(sql`update categories set is_active = false where id = ${category.id}`);
    expectOk(
      await runAction(updateProduct, head.id, {
        id: product.id,
        categoryId: category.id,
        description: "Eski toifada qoladi",
      }),
    );
    expect((await rowOf(product.id)).categoryId).toBe(category.id);
  });
});

describe("products: the reference price (05 field 10; developer-rules rule 6; decision 2)", () => {
  it("is read from the typed text into a bigint; optional", async () => {
    const head = await insertUser("HEAD");
    const priced = await create(head.id, { referencePrice: "1 250 000" });
    const unpriced = await create(head.id, { referencePrice: "" });
    expect((await rowOf(priced.id)).referencePrice).toBe(1_250_000n);
    expect((await rowOf(unpriced.id)).referencePrice).toBeNull();
  });

  it("0, a negative, a fraction and a value above the maximum are refused", async () => {
    const head = await insertUser("HEAD");
    for (const referencePrice of ["0", "-5", "1.5", "1 000 000 000 000 000"]) {
      expect(
        await tryCreate(head.id, {
          name: `Bo'r ${newClientKey()}`,
          referencePrice,
          ...(await references()),
        }),
      ).toMatchObject(refused({ referencePrice: "errors.field.wrongFormat" }));
    }
  });

  it("an edit that sends a price leaves the price and writes no history row (decision 2)", async () => {
    const head = await insertUser("HEAD");
    const product = await create(head.id, { referencePrice: "1250000" });
    const result = expectOk(
      (await runAction(updateProduct, head.id, {
        id: product.id,
        referencePrice: "900000",
      })) as ActionResult<{ changed: string[] }>,
    );
    expect(result.changed).toEqual([]);
    expect((await rowOf(product.id)).referencePrice).toBe(1_250_000n);
    expect(await auditRowsOf(product.id)).toHaveLength(1);
  });

  it("the create history row keeps the price as decimal text (developer-rules rule 6)", async () => {
    const head = await insertUser("HEAD");
    const product = await create(head.id, { referencePrice: "5000" });
    const [row] = await auditRowsOf(product.id);
    expect(row!.after).toMatchObject({ referencePrice: "5000" });
  });
});

describe("products: the photo (04 rule 6; src/server/files/owners.ts; decision 10)", () => {
  it("an image the Head uploaded and no record holds is attached", async () => {
    const head = await insertUser("HEAD");
    const photo = await insertFileRow(head.id, "image/heic");
    const product = await create(head.id, { photoFileId: photo.id });
    expect((await rowOf(product.id)).photoFileId).toBe(photo.id);
  });

  it("another user's upload, an unknown file and one another product holds are not allowed", async () => {
    const head = await insertUser("HEAD");
    const other = await insertUser("HEAD");
    const held = await insertFileRow(head.id);
    await create(head.id, { photoFileId: held.id });
    for (const fileId of [(await insertFileRow(other.id)).id, newClientKey(), held.id]) {
      expect(
        await tryCreate(head.id, {
          name: `Rasm ${newClientKey()}`,
          photoFileId: fileId,
          ...(await references()),
        }),
      ).toMatchObject(refused({ photoFileId: "errors.field.notAllowed" }));
    }
  });

  it("a PDF is not a photo", async () => {
    const head = await insertUser("HEAD");
    const pdf = await insertFileRow(head.id, "application/pdf");
    expect(
      await tryCreate(head.id, {
        name: `Rasm ${newClientKey()}`,
        photoFileId: pdf.id,
        ...(await references()),
      }),
    ).toMatchObject(refused({ photoFileId: "errors.field.notAPhoto" }));
  });

  it("a replaced photo goes back to its uploader only; the new one is seen by every role", async () => {
    const head = await insertUser("HEAD");
    const first = await insertFileRow(head.id);
    const second = await insertFileRow(head.id);
    const product = await create(head.id, { photoFileId: first.id });
    expect(await accessOf(db, first.id)).toEqual({ permission: "catalog.pick" });
    expectOk(await runAction(updateProduct, head.id, { id: product.id, photoFileId: second.id }));
    expect(await accessOf(db, first.id)).toBeNull();
    expect(await accessOf(db, second.id)).toEqual({ permission: "catalog.pick" });
    expectOk(await runAction(updateProduct, head.id, { id: product.id, photoFileId: "" }));
    expect((await rowOf(product.id)).photoFileId).toBeNull();
  });
});

describe("products: type and measure lock after first use (04 Catalogs table; decision 1)", () => {
  it("not in use (1.7: no use exists): type and measure change", async () => {
    const head = await insertUser("HEAD");
    const product = await create(head.id);
    const unit = await insertUnit();
    expectOk(
      await runAction(updateProduct, head.id, { id: product.id, type: "SERVICE", unitId: unit.id }),
    );
    expect(await rowOf(product.id)).toMatchObject({ type: "SERVICE", unitId: unit.id });
  });

  it("productInUse asks every use and is true when one holds the product", async () => {
    const product = await insertProduct();
    const none: ProductUse = { name: "none", holds: async () => false };
    const holding: ProductUse = { name: "this one", holds: async (_, id) => id === product.id };
    expect(await productInUse(db, product.id)).toBe(false);
    expect(await productInUse(db, product.id, [none])).toBe(false);
    expect(await productInUse(db, product.id, [none, holding])).toBe(true);
    expect(await productInUse(db, (await insertProduct()).id, [none, holding])).toBe(false);
  });
});

describe("products: change history (04 rule 9; decision 11)", () => {
  it("create keeps every field and the names of category, measure and company", async () => {
    const head = await insertUser("HEAD");
    const category = await insertCategory({ name: `Kanselyariya ${newClientKey()}` });
    const unit = await insertUnit({ name: `Dona ${newClientKey()}` });
    const company = await insertCompany({ name: `Brend ${newClientKey()}` });
    const product = await create(head.id, {
      categoryId: category.id,
      unitId: unit.id,
      defaultCompanyId: company.id,
      description: "Oq",
    });
    const rows = await auditRowsOf(product.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "product.create",
      actorId: head.id,
      before: null,
      after: {
        name: product.name,
        type: "GOODS",
        categoryId: category.id,
        category: category.name,
        unitId: unit.id,
        unit: unit.name,
        defaultCompanyId: company.id,
        defaultCompany: company.name,
        referencePrice: null,
        description: "Oq",
        photoFileId: null,
        isActive: true,
      },
    });
  });

  it("an update writes the changed fields with the names before and after; no change, no row", async () => {
    const head = await insertUser("HEAD");
    const product = await create(head.id);
    const category = await insertCategory({ name: `Tozalash ${newClientKey()}` });
    const [before] = await db
      .select({ name: categories.name })
      .from(categories)
      .where(eq(categories.id, product.categoryId));
    expectOk(await runAction(updateProduct, head.id, { id: product.id, categoryId: category.id }));
    expectOk(await runAction(updateProduct, head.id, { id: product.id, name: product.name }));
    const rows = await auditRowsOf(product.id);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      action: "product.update",
      before: { categoryId: product.categoryId, category: before!.name },
      after: { categoryId: category.id, category: category.name },
    });
  });

  it("deactivate and activate, each once; a second click of the same is wrong_status", async () => {
    const head = await insertUser("HEAD");
    const product = await create(head.id);
    expectOk(await runAction(setProductActive, head.id, { id: product.id, active: false }));
    expect(
      await runAction(setProductActive, head.id, { id: product.id, active: false }),
    ).toMatchObject({ ok: false, error: { code: "wrong_status" } });
    expectOk(await runAction(setProductActive, head.id, { id: product.id, active: true }));
    const actions = (await auditRowsOf(product.id)).map((row) => row.action);
    expect(actions).toEqual(["product.create", "product.deactivate", "product.activate"]);
  });
});

function asMatrixAnswer(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const { code } = result.error;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

// "Manage catalogs, users, branches, settings": the Head only (03, Permission matrix).
describePermissionMatrix("createProduct", {
  permission: "catalog.manage",
  async run({ user }) {
    asMatrixAnswer(
      await runAction(createProduct, user.id, {
        clientKey: newClientKey(),
        name: `Matritsa ${newClientKey()}`,
        ...(await references()),
      }),
    );
  },
});

describePermissionMatrix("updateProduct", {
  permission: "catalog.manage",
  async run({ user }) {
    const product = await insertProduct();
    asMatrixAnswer(
      await runAction(updateProduct, user.id, {
        id: product.id,
        name: `Matritsa ${newClientKey()}`,
      }),
    );
  },
});

describePermissionMatrix("setProductActive", {
  permission: "catalog.manage",
  async run({ user }) {
    const product = await insertProduct();
    asMatrixAnswer(await runAction(setProductActive, user.id, { id: product.id, active: false }));
  },
});
