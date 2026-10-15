import { randomUUID } from "node:crypto";

import { and, count, eq, inArray, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { newClientKey } from "@/components/client-key";
import { previewImport } from "@/features/catalog/queries/imports";
import { runAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import {
  auditLog,
  branches,
  catalogImports,
  categories,
  departments,
  priceHistory,
  productVariants,
  products,
} from "@/server/db/schema";

import { insertBranch } from "../../../../tests/helpers/branches";
import {
  insertCategory,
  insertCompany,
  insertProduct,
  insertUnit,
} from "../../../../tests/helpers/catalog";
import { type Value, importSheet, productRow } from "../../../../tests/helpers/imports";
import { describePermissionMatrix } from "../../../../tests/helpers/permission-matrix";
import { insertUser } from "../../../../tests/helpers/users";
import { importDepartments, importProducts } from "./imports";

// build-plan 1.10, Done when: "a file with one bad row saves nothing and names the row and the
// reason; a valid file of 30 products creates 30 products". 04-catalogs.md rules 1 to 4, 7 and 9;
// developer-rules.md rules 3, 8 and 13; plan of 1.10 and its reviews (plan review, correction 2:
// a department name held by an inactive department of the branch). Every fixture is asserted
// (D38); every passing case has the refused data beside it (D40). Names are invented.

const tag = () => randomUUID().slice(0, 8);

function expectOk<T>(result: ActionResult<T>): T {
  expect(result).toMatchObject({ ok: true });
  return (result as { ok: true; data: T }).data;
}

async function catalogRefs() {
  const category = await insertCategory();
  const measure = await insertUnit();
  const company = await insertCompany();
  return { category: category.name, measure: measure.name, company: company.name };
}

function productsInput(rows: Value[][], fileName = "mahsulotlar.xlsx") {
  return { clientKey: newClientKey(), fileName, sheet: importSheet("products", rows) };
}

function departmentsInput(rows: Value[][]) {
  return {
    clientKey: newClientKey(),
    fileName: "bolimlar.xlsx",
    sheet: importSheet("departments", rows),
  };
}

async function productsNamed(names: string[]) {
  return db.select().from(products).where(inArray(products.name, names));
}

async function countOf(
  table: typeof catalogImports | typeof auditLog,
  where: ReturnType<typeof eq>,
) {
  const [row] = await db.select({ n: count() }).from(table).where(where);
  return row!.n;
}

describe("importProducts: all rows or none (04 rule 7; build-plan 1.10, Done when)", () => {
  it("a valid file of 30 products creates 30 products, each as one made by hand", async () => {
    const head = await insertUser("HEAD");
    const refs = await catalogRefs();
    const prefix = `Mahsulot ${tag()}`;
    const names = Array.from({ length: 30 }, (_, at) => `${prefix} ${at + 1}`);
    const rows = names.map((name, at) =>
      productRow(name, refs, { price: at % 2 === 0 ? (at + 1) * 1000 : null }),
    );
    const input = productsInput(rows);
    const saved = expectOk(await runAction(importProducts, head.id, input));
    expect(saved.rows).toBe(30);

    const made = await productsNamed(names);
    expect(made).toHaveLength(30);
    expect(made.every((product) => !product.hasVariants && product.clientKey === null)).toBe(true);
    // Each has its hidden default subtype holding its price (04 rule 1) and a HEAD row for a price
    // (04 rule 4; plan of 1.9, decision 1; plan of 1.10, decision 2, Look first).
    const ids = made.map((product) => product.id);
    const defaults = await db
      .select()
      .from(productVariants)
      .where(inArray(productVariants.productId, ids));
    expect(defaults).toHaveLength(30);
    expect(defaults.every((variant) => variant.isDefault)).toBe(true);
    const first = made.find((product) => product.name === `${prefix} 1`)!;
    expect(first.referencePrice).toBe(1000n);
    const heads = await db
      .select()
      .from(priceHistory)
      .where(
        inArray(
          priceHistory.variantId,
          defaults.map((variant) => variant.id),
        ),
      );
    expect(heads).toHaveLength(15);
    expect(
      heads.every((row) => row.source === "HEAD" && row.setBy === head.id && row.note === null),
    ).toBe(true);
    // One product.create row each (04 rule 9), and one import record with the key.
    const audits = await db
      .select({ n: count() })
      .from(auditLog)
      .where(and(eq(auditLog.action, "product.create"), inArray(auditLog.entityId, ids)));
    expect(audits[0]!.n).toBe(30);
    const [record] = await db
      .select()
      .from(catalogImports)
      .where(eq(catalogImports.clientKey, input.clientKey));
    expect(record).toMatchObject({
      id: saved.importId,
      kind: "PRODUCTS",
      fileName: "mahsulotlar.xlsx",
      rowCount: 30,
      createdBy: head.id,
    });
  });

  it("a file with one bad row saves nothing and names the row and the reason", async () => {
    const head = await insertUser("HEAD");
    const refs = await catalogRefs();
    const prefix = `Mahsulot ${tag()}`;
    const names = Array.from({ length: 30 }, (_, at) => `${prefix} ${at + 1}`);
    const rows = names.map((name) => productRow(name, refs, { price: 5000 }));
    rows.push(productRow(`${prefix} 31`, { ...refs, category: `Yoʻq toifa ${tag()}` }));
    const input = productsInput(rows);

    expect(await runAction(importProducts, head.id, input)).toEqual({
      ok: false,
      error: {
        code: "invalid_input",
        messageKey: "errors.invalidInput",
        fields: { "32:category": "errors.field.unknown" },
      },
    });
    expect(await productsNamed([...names, `${prefix} 31`])).toEqual([]);
    expect(await countOf(catalogImports, eq(catalogImports.clientKey, input.clientKey))).toBe(0);
    expect(await countOf(auditLog, eq(auditLog.actorId, head.id))).toBe(0);
  });

  it("a row the domain refuses is named by the input check, with its kind", async () => {
    const head = await insertUser("HEAD");
    const refs = await catalogRefs();
    const name = `Mahsulot ${tag()}`;
    const result = await runAction(
      importProducts,
      head.id,
      productsInput([productRow(name, refs, { price: 0.5 }), productRow("", refs)]),
    );
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "invalid_input",
        fields: { "2:price": "errors.field.wrongFormat", "3:name": "errors.field.required" },
      },
    });
    expect(await productsNamed([name])).toEqual([]);
  });

  it("a file whose header is not the template's is refused as a whole", async () => {
    const head = await insertUser("HEAD");
    const refs = await catalogRefs();
    const input = productsInput([productRow(`Mahsulot ${tag()}`, refs)]);
    input.sheet.header = [{ kind: "text", text: "Nomi" }];
    expect(await runAction(importProducts, head.id, input)).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { file: "errors.field.notTemplate" } },
    });
  });

  it("the template filled in another language is read (plan of 1.10, decision 10)", async () => {
    const head = await insertUser("HEAD");
    const refs = await catalogRefs();
    const name = `Mahsulot ${tag()}`;
    const input = {
      clientKey: newClientKey(),
      fileName: "ru.xlsx",
      sheet: importSheet("products", [productRow(name, refs, { type: "Услуга" })], "ru"),
    };
    expectOk(await runAction(importProducts, head.id, input));
    expect((await productsNamed([name]))[0]!.type).toBe("SERVICE");
  });
});

describe("importProducts: subtypes (04 rules 1 and 4; progress 1.8, For 1.10)", () => {
  it("the first subtype is the default made real; the others new rows; each price its HEAD row", async () => {
    const head = await insertUser("HEAD");
    const refs = await catalogRefs();
    const name = `Ruchka ${tag()}`;
    // Beside it, a product without subtypes in the same file keeps its hidden default (D40).
    const plain = `Qogʻoz ${tag()}`;
    expectOk(
      await runAction(
        importProducts,
        head.id,
        productsInput([
          productRow(name, refs, { subtype: "Koʻk", price: 2500 }),
          [name, "", "", "", "", "", "Qora", null],
          [name, "", "", "", "", "", "Qizil", "3 000"],
          productRow(plain, refs, { price: 45000 }),
        ]),
      ),
    );
    const [product] = await productsNamed([name]);
    expect(product).toMatchObject({ hasVariants: true, referencePrice: null });
    const variants = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, product!.id))
      .orderBy(productVariants.createdAt, productVariants.name);
    expect(
      variants.map((variant) => [variant.name, variant.isDefault, variant.referencePrice]),
    ).toEqual(
      expect.arrayContaining([
        ["Koʻk", false, 2500n],
        ["Qora", false, null],
        ["Qizil", false, 3000n],
      ]),
    );
    expect(variants).toHaveLength(3);
    // The first is the default made real: its subtype.create row says so.
    const creates = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "subtype.create"),
          inArray(
            auditLog.entityId,
            variants.map((variant) => variant.id),
          ),
        ),
      );
    expect(creates).toHaveLength(3);
    const madeReal = creates.filter((row) => (row.after as { fromDefault?: boolean }).fromDefault);
    expect(madeReal).toHaveLength(1);
    expect(variants.find((variant) => variant.id === madeReal[0]!.entityId)!.name).toBe("Koʻk");
    const heads = await db
      .select({ n: count() })
      .from(priceHistory)
      .where(
        inArray(
          priceHistory.variantId,
          variants.map((variant) => variant.id),
        ),
      );
    expect(heads[0]!.n).toBe(2);
    const [other] = await productsNamed([plain]);
    expect(other).toMatchObject({ hasVariants: false, referencePrice: 45000n });
  });
});

describe("importProducts: the catalog's own rules (04 rules 2 and 3; plan of 1.10, decision 7)", () => {
  it("a name already in the catalog, active or inactive, is refused (D41)", async () => {
    const head = await insertUser("HEAD");
    const refs = await catalogRefs();
    const active = await insertProduct({ name: `Bor ${tag()}` });
    const inactive = await insertProduct({ name: `Nofaol ${tag()}` });
    await db.update(products).set({ isActive: false }).where(eq(products.id, inactive.id));
    const fresh = `Yangi ${tag()}`;
    const result = await runAction(
      importProducts,
      head.id,
      productsInput([
        productRow(fresh, refs),
        productRow(`  ${active.name.toUpperCase()} `, refs),
        productRow(inactive.name, refs),
      ]),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { fields: { "3:name": "errors.field.taken", "4:name": "errors.field.taken" } },
    });
    expect(
      Object.keys((result as { ok: false; error: { fields: object } }).error.fields),
    ).toHaveLength(2);
    expect(await productsNamed([fresh])).toEqual([]);
  });

  it("an inactive or unknown category, measure or company is refused; matched ignoring case and spaces", async () => {
    const head = await insertUser("HEAD");
    const refs = await catalogRefs();
    const offCategory = await insertCategory({ isActive: false });
    const offUnit = await insertUnit({ isActive: false });
    const offCompany = await insertCompany({ isActive: false });
    const ok = `Toʻgʻri ${tag()}`;
    const result = await runAction(
      importProducts,
      head.id,
      productsInput([
        productRow(ok, {
          category: ` ${refs.category.toLowerCase()}  `,
          measure: refs.measure,
          company: refs.company,
        }),
        productRow(`A ${tag()}`, { ...refs, category: offCategory.name }),
        productRow(`B ${tag()}`, { ...refs, measure: offUnit.name }),
        productRow(`C ${tag()}`, { ...refs, company: offCompany.name }),
        productRow(`D ${tag()}`, { ...refs, company: `Yoʻq ${tag()}` }),
      ]),
    );
    expect(result).toMatchObject({
      ok: false,
      error: {
        fields: {
          "3:category": "errors.field.inactive",
          "4:measure": "errors.field.inactive",
          "5:company": "errors.field.inactive",
          "6:company": "errors.field.unknown",
        },
      },
    });
    expect(
      Object.keys((result as { ok: false; error: { fields: object } }).error.fields),
    ).toHaveLength(4);
  });

  it("a measure cell that fits one measure's name and another's short name is refused (Should fix 4)", async () => {
    const head = await insertUser("HEAD");
    const refs = await catalogRefs();
    const word = `qt${tag()}`;
    const named = await insertUnit({ name: word });
    expect(named.name).toBe(word);
    const [short] = await db
      .execute<{ id: string }>(
        sql`insert into units (name, short_name, allow_decimal, created_at)
        values (${`Boshqa ${tag()}`}, ${word.toUpperCase()}, false, now()) returning id`,
      )
      .then((result) => result.rows);
    expect(short).toBeDefined();
    const result = await runAction(
      importProducts,
      head.id,
      productsInput([productRow(`Mahsulot ${tag()}`, { ...refs, measure: word })]),
    );
    expect(result).toMatchObject({
      ok: false,
      error: { fields: { "2:measure": "errors.field.ambiguous" } },
    });
  });

  it("a category deactivated between the preview and the save is refused at the save (decision 5)", async () => {
    const head = await insertUser("HEAD");
    const refs = await catalogRefs();
    const name = `Mahsulot ${tag()}`;
    const input = productsInput([productRow(name, refs)]);
    const preview = await previewImport(head.id, "products", input.sheet);
    expect(preview.errors).toEqual([]);
    await db.update(categories).set({ isActive: false }).where(eq(categories.name, refs.category));
    expect(await runAction(importProducts, head.id, input)).toMatchObject({
      ok: false,
      error: { fields: { "2:category": "errors.field.inactive" } },
    });
    expect(await productsNamed([name])).toEqual([]);
  });
});

describe("importProducts: a safe repeat (developer-rules.md rule 8)", () => {
  it("the same client key twice gives the first result and saves once; another Head gets not found", async () => {
    const head = await insertUser("HEAD");
    const other = await insertUser("HEAD");
    const refs = await catalogRefs();
    const name = `Mahsulot ${tag()}`;
    const input = productsInput([productRow(name, refs)]);
    const first = expectOk(await runAction(importProducts, head.id, input));
    const second = expectOk(await runAction(importProducts, head.id, input));
    expect(second).toEqual({ ...first, written: [] });
    expect(await productsNamed([name])).toHaveLength(1);
    expect(await runAction(importProducts, other.id, input)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });
});

describe("previewImport (04 rule 7: a preview with errors per row)", () => {
  it("shows every row with every error, and writes nothing", async () => {
    const head = await insertUser("HEAD");
    const refs = await catalogRefs();
    const good = `Mahsulot ${tag()}`;
    const sheet = importSheet("products", [
      productRow(good, refs, { price: 1500 }),
      [],
      productRow(`Xato ${tag()}`, { ...refs, measure: `Yoʻq ${tag()}` }, { price: "12.5" }),
    ]);
    const preview = await previewImport(head.id, "products", sheet);
    expect(preview.rows.map((row) => row.row)).toEqual([2, 4]);
    expect(preview.rows[0]!.texts[0]).toBe(good);
    expect(preview.errors).toEqual([
      { row: 4, column: "measure", kind: "unknown" },
      { row: 4, column: "price", kind: "wrongFormat" },
    ]);
    expect(await productsNamed([good])).toEqual([]);
  });

  it("a header that is not the template's is one file error", async () => {
    const head = await insertUser("HEAD");
    const sheet = importSheet("departments", [["TSH", "Oshxona"]]);
    expect((await previewImport(head.id, "products", sheet)).errors).toEqual([
      { row: 0, column: "file", kind: "notTemplate" },
    ]);
  });
});

describe("importDepartments (04 rule 3: names unique inside a branch; decisions 1.6)", () => {
  it("rows of two branches are saved, each with its department.create row", async () => {
    const head = await insertUser("HEAD");
    const first = await insertBranch();
    const second = await insertBranch();
    const rows: Value[][] = [];
    for (let at = 1; at <= 5; at += 1) {
      rows.push([first.code, `Boʻlim ${at}`, "Aliyeva Dilnoza", 998901234567]);
      rows.push([second.code.toLowerCase(), `Boʻlim ${at}`]);
    }
    const saved = expectOk(await runAction(importDepartments, head.id, departmentsInput(rows)));
    expect(saved.rows).toBe(10);
    const made = await db
      .select()
      .from(departments)
      .where(inArray(departments.branchId, [first.id, second.id]));
    expect(made).toHaveLength(10);
    expect(made.find((row) => row.branchId === first.id)).toMatchObject({
      responsibleName: "Aliyeva Dilnoza",
      responsiblePhone: "998901234567",
      clientKey: null,
    });
    const audits = await db
      .select({ n: count() })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "department.create"),
          inArray(
            auditLog.entityId,
            made.map((row) => row.id),
          ),
        ),
      );
    expect(audits[0]!.n).toBe(10);
  });

  it("an unknown or inactive branch, and a name an inactive department holds in that branch, are refused", async () => {
    const head = await insertUser("HEAD");
    const open = await insertBranch();
    const other = await insertBranch();
    const closed = await insertBranch({ isActive: false });
    const name = `Oshxona ${tag()}`;
    // The name is held in `open` and in `other` by inactive departments; beside the refused row, a
    // new name in `open` (row 2) passes the check (D40).
    for (const branch of [open, other]) {
      await db.insert(departments).values({
        branchId: branch.id,
        name,
        isActive: false,
        createdAt: new Date("2031-04-11T05:00:00Z"),
      });
    }
    const fresh = `Kutubxona ${tag()}`;
    const result = await runAction(
      importDepartments,
      head.id,
      departmentsInput([
        [open.code, fresh],
        ["ZZZZ", `Boʻlim ${tag()}`],
        [closed.code, `Boʻlim ${tag()}`],
        [open.code, ` ${name.toUpperCase()} `],
      ]),
    );
    expect(result).toMatchObject({
      ok: false,
      error: {
        fields: {
          "3:branch": "errors.field.unknown",
          "4:branch": "errors.field.branchInactive",
          "5:name": "errors.field.taken",
        },
      },
    });
    // Exactly those three: row 2 is not refused.
    expect(
      Object.keys((result as { ok: false; error: { fields: object } }).error.fields),
    ).toHaveLength(3);
    expect(await db.select().from(departments).where(eq(departments.name, fresh))).toEqual([]);
    // The same name in a branch where nobody holds it passes.
    const third = await insertBranch();
    expectOk(await runAction(importDepartments, head.id, departmentsInput([[third.code, name]])));
  });
});

// 03-roles-and-permissions.md, "Manage catalogs, users, branches, settings": the Head only, the
// branch of the case beside it (permission review of the diff, Must fix 1 and 2).
function answerOf(result: ActionResult<unknown>): void {
  if (result.ok) return;
  const { code } = result.error;
  if (code === "not_found" || code === "forbidden") throw new AuthorizationError(code);
  throw new Error(`Unexpected answer: ${code}`);
}

describePermissionMatrix("importProducts", {
  permission: "catalog.manage",
  async run({ user }) {
    const refs = await catalogRefs();
    answerOf(
      await runAction(
        importProducts,
        user.id,
        productsInput([productRow(`Matritsa ${tag()}`, refs)]),
      ),
    );
  },
});

describePermissionMatrix("importDepartments", {
  permission: "catalog.manage",
  async run({ user, branchId }) {
    const [branch] = await db
      .select({ code: branches.code })
      .from(branches)
      .where(eq(branches.id, branchId));
    answerOf(
      await runAction(
        importDepartments,
        user.id,
        departmentsInput([[branch!.code, `Matritsa ${tag()}`]]),
      ),
    );
  },
});
