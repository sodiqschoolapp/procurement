import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sql } from "drizzle-orm";
import pg from "pg";
import { describe, expect, inject, it } from "vitest";

import { db } from "@/server/db/client";

import { MIGRATIONS_FOLDER, applyMigrations } from "../../../../scripts/apply-migrations.mjs";
import {
  insertCategory,
  insertFileRow,
  insertProduct,
  insertSubtypes,
  insertUnit,
} from "../../../../tests/helpers/catalog";
import { refusalOf } from "../../../../tests/helpers/database-error";
import { createTestDatabase, dropTestDatabase } from "../../../../tests/helpers/test-database";
import { insertUser } from "../../../../tests/helpers/users";

// The constraints of migration 0013_product_variants (developer-rules.md rule 5; D39: every guard
// on INSERT and on UPDATE, plain SQL with nothing in front; D40: each refused write beside an
// accepted one). 14-data-model.md: product_variants; 04-catalogs.md rule 1 ("Inside the database
// every product has at least one subtype"), rule 3 ("Subtype names are unique inside a product");
// CLAUDE.md rule 11; plan of 1.8 and its reviews (Must fix 1; correction 4: each refusal names
// its error and constraint).

const AT = "2031-04-11T05:00:00Z";

type Variant = {
  productId: string;
  name?: string;
  isDefault?: boolean;
  photoFileId?: string | null;
  referencePrice?: string | null;
  lastPurchasePrice?: string | null;
  clientKey?: string | null;
};

function insertVariant(row: Variant) {
  return db.execute<{ id: string }>(sql`insert into product_variants
      (product_id, name, is_default, photo_file_id, reference_price, last_purchase_price,
       client_key, created_at)
    values (${row.productId}, ${row.name ?? `Turi ${randomUUID()}`}, ${row.isDefault ?? false},
      ${row.photoFileId ?? null}, ${row.referencePrice ?? null}, ${row.lastPurchasePrice ?? null},
      ${row.clientKey ?? null}, ${AT})
    returning id`);
}

function updateVariant(id: string, column: string, value: string | boolean | null) {
  return db.execute(
    sql`update product_variants set ${sql.identifier(column)} = ${value} where id = ${id}`,
  );
}

/** A product that has real subtypes: its default made real and one more row. */
async function productWithSubtypes() {
  const product = await insertProduct();
  const [first, second] = await insertSubtypes(product.id, [{}, {}]);
  return { productId: product.id, first: first!, second: second! };
}

const SHAPE = { code: "23514", constraint: "product_variants_shape" };

describe("product_variants: every product has at least one subtype at all times (04 rule 1)", () => {
  it("a product written without a subtype is refused at commit; with its default it passes", async () => {
    const categoryId = (await insertCategory()).id;
    const unitId = (await insertUnit()).id;
    const product = (name: string) =>
      sql`insert into products (name, category_id, unit_id, created_at)
        values (${name}, ${categoryId}, ${unitId}, ${AT}) returning id`;
    expect(await refusalOf(db.execute(product(`Yolg'iz ${randomUUID()}`)))).toMatchObject(SHAPE);
    const found = await db.execute<{
      id: string;
    }>(sql`with p as (${product(`Juft ${randomUUID()}`)}),
        v as (insert into product_variants (product_id, name, is_default, created_at)
          select id, 'default', true, ${AT} from p)
      select id from p`);
    const rows = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from product_variants where product_id = ${found.rows[0]!.id}`,
    );
    expect(rows.rows[0]!.count).toBe(1);
  });

  it("a product without subtypes has exactly one row, the hidden default (build-plan 1.8 Done when)", async () => {
    const product = await insertProduct({ referencePrice: 50_000n });
    const rows = await db.execute<{ name: string; is_default: boolean; reference_price: string }>(
      sql`select name, is_default, reference_price from product_variants
        where product_id = ${product.id}`,
    );
    expect(rows.rows).toEqual([{ name: "default", is_default: true, reference_price: "50000" }]);
  });

  it("no subtype is ever deleted, the default or a real one (CLAUDE.md rule 11)", async () => {
    const plain = await insertProduct();
    const { first } = await productWithSubtypes();
    for (const id of [plain.defaultVariantId, first]) {
      expect(
        await refusalOf(db.execute(sql`delete from product_variants where id = ${id}`)),
      ).toMatchObject({ code: "23514", constraint: "product_variants_no_delete" });
    }
  });

  it("without subtypes: a second row is refused, the default turned real alone is refused", async () => {
    const product = await insertProduct();
    expect(await refusalOf(insertVariant({ productId: product.id }))).toMatchObject(SHAPE);
    expect(
      await refusalOf(updateVariant(product.defaultVariantId, "is_default", false)),
    ).toMatchObject(SHAPE);
    // The same write with has_variants in one transaction is the conversion, and passes (D40).
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`update product_variants set is_default = false, name = 'A4'
          where id = ${product.defaultVariantId}`,
      );
      await tx.execute(sql`update products set has_variants = true where id = ${product.id}`);
    });
  });

  it("has_variants flipped alone is refused either way", async () => {
    const plain = await insertProduct();
    expect(
      await refusalOf(
        db.execute(sql`update products set has_variants = true where id = ${plain.id}`),
      ),
    ).toMatchObject(SHAPE);
    const { productId } = await productWithSubtypes();
    expect(
      await refusalOf(
        db.execute(sql`update products set has_variants = false where id = ${productId}`),
      ),
    ).toMatchObject(SHAPE);
    // A product with subtypes takes more real rows (D40).
    await insertVariant({ productId });
  });

  it("on INSERT: a default row into a product with subtypes is refused at commit (spec review, Should fix 1a)", async () => {
    const { productId } = await productWithSubtypes();
    expect(await refusalOf(insertVariant({ productId, isDefault: true }))).toMatchObject(SHAPE);
    // A real row into it passes beside it (D40).
    await insertVariant({ productId });
  });

  it("on INSERT: a product with only a real row and has_variants false is refused at commit (Should fix 1b)", async () => {
    const categoryId = (await insertCategory()).id;
    const unitId = (await insertUnit()).id;
    const withRow = (name: string, isDefault: boolean) =>
      db.execute(sql`with p as (insert into products (name, category_id, unit_id, created_at)
          values (${name}, ${categoryId}, ${unitId}, ${AT}) returning id),
        v as (insert into product_variants (product_id, name, is_default, created_at)
          select id, 'A4', ${isDefault}, ${AT} from p)
        select id from p`);
    expect(await refusalOf(withRow(`Faqat haqiqiy ${randomUUID()}`, false))).toMatchObject(SHAPE);
    await withRow(`Yashirin bilan ${randomUUID()}`, true);
  });

  it("a second default for one product is refused by the partial unique index", async () => {
    const product = await insertProduct();
    expect(
      await refusalOf(insertVariant({ productId: product.id, isDefault: true })),
    ).toMatchObject({ code: "23505", constraint: "product_variants_default_key" });
  });

  it("a real subtype never becomes the default again (plan review, Must fix 1)", async () => {
    const { first } = await productWithSubtypes();
    expect(await refusalOf(updateVariant(first, "is_default", true))).toMatchObject({
      code: "23514",
      constraint: "product_variants_default_once",
    });
  });

  it("a subtype never moves to another product, even one with subtypes (Must fix 1)", async () => {
    const from = await productWithSubtypes();
    const to = await productWithSubtypes();
    expect(await refusalOf(updateVariant(from.second, "product_id", to.productId))).toMatchObject({
      code: "23514",
      constraint: "product_variants_product_fixed",
    });
    // An update of another column passes (D40).
    await updateVariant(from.second, "name", `Yangi ${randomUUID()}`);
  });
});

describe("product_variants: names unique inside a product (04 rule 3)", () => {
  it("on INSERT: ' Paper  A4 ' against 'paper a4' clashes; the same name in another product passes", async () => {
    const one = await productWithSubtypes();
    const two = await productWithSubtypes();
    const name = `Paper A4 ${randomUUID().slice(0, 6)}`;
    await insertVariant({ productId: one.productId, name });
    expect(
      await refusalOf(
        insertVariant({
          productId: one.productId,
          name: ` ${name.replace(" ", "  ").toLowerCase()} `,
        }),
      ),
    ).toMatchObject({ code: "23505", constraint: "product_variants_product_name_key" });
    await insertVariant({ productId: two.productId, name });
  });

  it("on UPDATE: a rename into a sibling's name clashes; into another product's passes", async () => {
    const one = await productWithSubtypes();
    const two = await productWithSubtypes();
    const name = `Paper A3 ${randomUUID().slice(0, 6)}`;
    await updateVariant(two.first, "name", name);
    await updateVariant(one.first, "name", name);
    expect(await refusalOf(updateVariant(one.second, "name", name.toUpperCase()))).toMatchObject({
      code: "23505",
      constraint: "product_variants_product_name_key",
    });
  });

  it("on INSERT and on UPDATE: a blank name is refused", async () => {
    const { productId, first } = await productWithSubtypes();
    const refused = { code: "23514", constraint: "product_variants_name_check" };
    expect(await refusalOf(insertVariant({ productId, name: "   " }))).toMatchObject(refused);
    expect(await refusalOf(updateVariant(first, "name", " "))).toMatchObject(refused);
  });
});

describe("product_variants: money columns are whole so'm, more than 0 (developer-rules rule 6)", () => {
  it.each(["reference_price", "last_purchase_price"])(
    "on INSERT and on UPDATE: %s 0 and -1 are refused, 1 and empty pass",
    async (column) => {
      const { productId, first } = await productWithSubtypes();
      const constraint = `product_variants_${column}_check`;
      const key = column === "reference_price" ? "referencePrice" : "lastPurchasePrice";
      for (const value of ["0", "-1"]) {
        expect(await refusalOf(insertVariant({ productId, [key]: value }))).toMatchObject({
          code: "23514",
          constraint,
        });
        expect(await refusalOf(updateVariant(first, column, value))).toMatchObject({
          code: "23514",
          constraint,
        });
      }
      await insertVariant({ productId, [key]: "1" });
      await updateVariant(first, column, "5000");
      await updateVariant(first, column, null);
    },
  );
});

describe("product_variants: one holder per photo, foreign keys, client key", () => {
  it("on INSERT and on UPDATE: a photo another subtype holds is refused", async () => {
    const user = await insertUser("HEAD");
    const photo = await insertFileRow(user.id);
    const { productId, first, second } = await productWithSubtypes();
    await updateVariant(first, "photo_file_id", photo.id);
    const refused = { code: "23505", constraint: "product_variants_photo_file_id_key" };
    expect(await refusalOf(insertVariant({ productId, photoFileId: photo.id }))).toMatchObject(
      refused,
    );
    expect(await refusalOf(updateVariant(second, "photo_file_id", photo.id))).toMatchObject(
      refused,
    );
    await updateVariant(second, "photo_file_id", (await insertFileRow(user.id)).id);
  });

  it("an unknown product or photo is refused by its foreign key", async () => {
    const { productId, first } = await productWithSubtypes();
    expect(await refusalOf(insertVariant({ productId: randomUUID() }))).toMatchObject({
      code: "23503",
      constraint: "product_variants_product_id_products_id_fk",
    });
    const photoKey = { code: "23503", constraint: "product_variants_photo_file_id_files_id_fk" };
    expect(await refusalOf(insertVariant({ productId, photoFileId: randomUUID() }))).toMatchObject(
      photoKey,
    );
    expect(await refusalOf(updateVariant(first, "photo_file_id", randomUUID()))).toMatchObject(
      photoKey,
    );
  });

  it("on INSERT and on UPDATE: a held client key is refused; rows without one pass", async () => {
    const { productId, first } = await productWithSubtypes();
    const key = randomUUID();
    await insertVariant({ productId, clientKey: key });
    const refused = { code: "23505", constraint: "product_variants_client_key_key" };
    expect(await refusalOf(insertVariant({ productId, clientKey: key }))).toMatchObject(refused);
    expect(await refusalOf(updateVariant(first, "client_key", key))).toMatchObject(refused);
    await insertVariant({ productId });
    await insertVariant({ productId });
  });
});

describe("migration 0013: products made before it get their default subtype (plan review, Should fix 7)", () => {
  it("a product written under 0012 has one default row with its price after 0013", async () => {
    const serverUrl = inject("databaseServerUrl");
    // drizzle/ cut at 0012: the SQL files and the journal entries up to it.
    const cut = mkdtempSync(join(tmpdir(), "migrations-0012-"));
    cpSync(MIGRATIONS_FOLDER, cut, { recursive: true });
    const journalPath = join(cut, "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    const index = journal.entries.findIndex(
      (entry: { tag: string }) => entry.tag === "0012_products",
    );
    expect(index).toBeGreaterThan(0);
    journal.entries = journal.entries.slice(0, index + 1);
    writeFileSync(journalPath, JSON.stringify(journal));

    const database = await createTestDatabase(serverUrl, { fromTemplate: false });
    const client = new pg.Client({ connectionString: database.url });
    try {
      await applyMigrations(database.url, cut);
      await client.connect();
      const category = await client.query(
        `insert into categories (name, created_at) values ('Kantselyariya', $1) returning id`,
        [AT],
      );
      const unit = await client.query(
        `insert into units (name, short_name, allow_decimal, created_at)
          values ('Dona', 'dona', false, $1) returning id`,
        [AT],
      );
      const product = await client.query(
        `insert into products (name, category_id, unit_id, reference_price, created_at)
          values ('Qog''oz', $1, $2, 50000, $3) returning id`,
        [category.rows[0].id, unit.rows[0].id, AT],
      );
      await applyMigrations(database.url);
      const rows = await client.query(
        `select name, is_default, reference_price from product_variants where product_id = $1`,
        [product.rows[0].id],
      );
      expect(rows.rows).toEqual([{ name: "default", is_default: true, reference_price: "50000" }]);
    } finally {
      await client.end();
      await dropTestDatabase(serverUrl, database.name);
      rmSync(cut, { recursive: true, force: true });
    }
  });
});
