import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import {
  insertCategory,
  insertCompany,
  insertFileRow,
  insertProduct,
  insertUnit,
} from "../../../../tests/helpers/catalog";
import { refusalOf } from "../../../../tests/helpers/database-error";
import { insertUser } from "../../../../tests/helpers/users";

// The constraints of migration 0012_products (developer-rules.md rule 5: "Database tests that try
// the forbidden write directly"; D39: every guard on INSERT and on UPDATE, plain SQL with nothing
// in front; D40: each refused write beside an accepted one). 14-data-model.md: products;
// 04-catalogs.md, Catalogs table and rule 3; A7; 05-order-request-form.md, Line field 10 ("Whole
// so'm, more than 0"); plan of 1.7 and its review (Should fix 7).

const AT = "2031-04-11T05:00:00Z";

type Row = {
  name?: string;
  type?: string;
  categoryId?: string;
  unitId?: string;
  photoFileId?: string | null;
  defaultCompanyId?: string | null;
  referencePrice?: string | null;
  description?: string | null;
};

/** One product with plain SQL; the type is left to the database's default unless given. */
async function insert(row: Row = {}): Promise<string> {
  const categoryId = row.categoryId ?? (await insertCategory()).id;
  const unitId = row.unitId ?? (await insertUnit()).id;
  const name = row.name ?? `Mahsulot ${randomUUID()}`;
  const found = await db.execute<{ id: string }>(
    row.type === undefined
      ? sql`insert into products (name, category_id, unit_id, photo_file_id, default_company_id,
              reference_price, description, created_at)
            values (${name}, ${categoryId}, ${unitId}, ${row.photoFileId ?? null},
              ${row.defaultCompanyId ?? null}, ${row.referencePrice ?? null},
              ${row.description ?? null}, ${AT})
            returning id`
      : sql`insert into products (name, type, category_id, unit_id, created_at)
            values (${name}, ${row.type}, ${categoryId}, ${unitId}, ${AT})
            returning id`,
  );
  return found.rows[0]!.id;
}

function update(id: string, column: string, value: string | null) {
  return db.execute(sql`update products set ${sql.identifier(column)} = ${value} where id = ${id}`);
}

describe("products: the type (04 Catalogs table; A7; 14-data-model products.type)", () => {
  it("a new row is GOODS when no type is written", async () => {
    const id = await insert();
    const found = await db.execute<{ type: string }>(
      sql`select type from products where id = ${id}`,
    );
    expect(found.rows[0]!.type).toBe("GOODS");
  });

  it("on INSERT and on UPDATE: GOODS and SERVICE pass, any other value is refused", async () => {
    const service = await insert({ type: "SERVICE" });
    expect(await refusalOf(insert({ type: "PRODUCT" }))).toMatchObject({ code: "22P02" });
    await update(service, "type", "GOODS");
    expect(await refusalOf(update(service, "type", "goods"))).toMatchObject({ code: "22P02" });
  });
});

describe("products: the name is unique ignoring capital letters and extra spaces (04 rule 3)", () => {
  it("on INSERT: ' Paper ' against 'paper' is refused, a different name passes", async () => {
    const name = `Paper ${randomUUID().slice(0, 6)}`;
    await insert({ name });
    expect(await refusalOf(insert({ name: ` ${name.toUpperCase()}  ` }))).toMatchObject({
      code: "23505",
      constraint: "products_name_key",
    });
    await insert({ name: `${name} A4` });
  });

  it("across products and services together (plan of 1.7, decision 9)", async () => {
    const name = `Ta'mir ${randomUUID().slice(0, 6)}`;
    await insert({ name, type: "SERVICE" });
    expect(await refusalOf(insert({ name, type: "GOODS" }))).toMatchObject({
      code: "23505",
      constraint: "products_name_key",
    });
  });

  it("on UPDATE: a rename into a held name is refused, into a free one passes", async () => {
    const held = `Daftar ${randomUUID().slice(0, 6)}`;
    await insert({ name: held });
    const other = await insert();
    expect(await refusalOf(update(other, "name", held.toLowerCase()))).toMatchObject({
      code: "23505",
      constraint: "products_name_key",
    });
    await update(other, "name", `${held} 2`);
  });
});

describe("products: no blank texts (plan of 1.7, decision 6)", () => {
  it.each([
    ["name", "products_name_check"],
    ["description", "products_description_check"],
  ])("on INSERT and on UPDATE: a blank %s is refused", async (column, constraint) => {
    const row = column === "name" ? { name: "   " } : { description: "  " };
    expect(await refusalOf(insert(row))).toMatchObject({ code: "23514", constraint });
    const id = await insert(column === "description" ? { description: "Oq" } : {});
    expect(await refusalOf(update(id, column, " "))).toMatchObject({ code: "23514", constraint });
  });

  it("an empty description is null and passes", async () => {
    const id = await insert({ description: "Izoh" });
    await update(id, "description", null);
  });
});

describe("products: the reference price is whole so'm, more than 0 (05 field 10; rule 6)", () => {
  it("on INSERT: 0 and -1 are refused; 1, a large amount and none pass", async () => {
    for (const referencePrice of ["0", "-1"]) {
      expect(await refusalOf(insert({ referencePrice }))).toMatchObject({
        code: "23514",
        constraint: "products_reference_price_check",
      });
    }
    await insert({ referencePrice: "1" });
    await insert({ referencePrice: "999999999999999" });
    await insert({ referencePrice: null });
  });

  it("on UPDATE: 0 and -1 are refused, 5000 passes", async () => {
    const id = await insert({ referencePrice: "5000" });
    for (const value of ["0", "-1"]) {
      expect(await refusalOf(update(id, "reference_price", value))).toMatchObject({
        code: "23514",
        constraint: "products_reference_price_check",
      });
    }
    await update(id, "reference_price", "6500");
  });

  it("is a bigint column: a fraction is refused", async () => {
    expect(await refusalOf(insert({ referencePrice: "1.5" }))).toMatchObject({ code: "22P02" });
  });
});

describe("products: one holder per photo (src/server/files/owners.ts; plan of 1.7, decision 10)", () => {
  it("on INSERT and on UPDATE: a photo another product holds is refused", async () => {
    const user = await insertUser("HEAD");
    const photo = await insertFileRow(user.id);
    const holder = await insert({ photoFileId: photo.id });
    expect(await refusalOf(insert({ photoFileId: photo.id }))).toMatchObject({
      code: "23505",
      constraint: "products_photo_file_id_key",
    });
    const other = await insert({ photoFileId: (await insertFileRow(user.id)).id });
    expect(await refusalOf(update(other, "photo_file_id", photo.id))).toMatchObject({
      code: "23505",
      constraint: "products_photo_file_id_key",
    });
    // Released by its holder, the photo can be taken by another product.
    await update(holder, "photo_file_id", null);
    await update(other, "photo_file_id", photo.id);
  });
});

describe("products: a foreign key on every relation (developer-rules rule 5)", () => {
  it.each([
    ["category_id", "products_category_id_categories_id_fk"],
    ["unit_id", "products_unit_id_units_id_fk"],
    ["photo_file_id", "products_photo_file_id_files_id_fk"],
    ["default_company_id", "products_default_company_id_companies_id_fk"],
  ])("on INSERT and on UPDATE: an unknown %s is refused", async (column, constraint) => {
    const unknown = randomUUID();
    const row: Row = {
      category_id: { categoryId: unknown },
      unit_id: { unitId: unknown },
      photo_file_id: { photoFileId: unknown },
      default_company_id: { defaultCompanyId: unknown },
    }[column]!;
    expect(await refusalOf(insert(row))).toMatchObject({ code: "23503", constraint });
    const id = await insert();
    expect(await refusalOf(update(id, column, unknown))).toMatchObject({
      code: "23503",
      constraint,
    });
  });

  it("known rows of each relation pass", async () => {
    const user = await insertUser("HEAD");
    await insert({
      photoFileId: (await insertFileRow(user.id)).id,
      defaultCompanyId: (await insertCompany({ kind: "SUPPLIER" })).id,
    });
  });

  it("nothing cascades: a category, measure or company a product uses cannot be deleted (CLAUDE.md rule 11)", async () => {
    const company = await insertCompany();
    const product = await insertProduct({ defaultCompanyId: company.id });
    expect(
      await refusalOf(db.execute(sql`delete from categories where id = ${product.categoryId}`)),
    ).toMatchObject({ code: "23503", constraint: "products_category_id_categories_id_fk" });
    expect(
      await refusalOf(db.execute(sql`delete from units where id = ${product.unitId}`)),
    ).toMatchObject({ code: "23503", constraint: "products_unit_id_units_id_fk" });
    expect(
      await refusalOf(db.execute(sql`delete from companies where id = ${company.id}`)),
    ).toMatchObject({ code: "23503", constraint: "products_default_company_id_companies_id_fk" });
    // An unused company is deleted, so the refusals above are the foreign keys' (D40).
    const unused = await insertCompany();
    await db.execute(sql`delete from companies where id = ${unused.id}`);
  });
});

describe("products: the client key is unique (developer-rules.md rule 8)", () => {
  it("on INSERT and on UPDATE: a held key is refused; rows with no key pass beside it", async () => {
    const key = randomUUID();
    const categoryId = (await insertCategory()).id;
    const unitId = (await insertUnit()).id;
    const insertWithKey = (clientKey: string | null) =>
      db.execute(sql`insert into products (name, category_id, unit_id, client_key, created_at)
        values (${`Kalit ${randomUUID()}`}, ${categoryId}, ${unitId}, ${clientKey}, ${AT})
        returning id`);
    await insertWithKey(key);
    expect(await refusalOf(insertWithKey(key))).toMatchObject({
      code: "23505",
      constraint: "products_client_key_key",
    });
    await insertWithKey(null);
    await insertWithKey(null);
    const other = await insert();
    expect(await refusalOf(update(other, "client_key", key))).toMatchObject({
      code: "23505",
      constraint: "products_client_key_key",
    });
    await update(other, "client_key", randomUUID());
  });
});
