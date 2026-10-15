import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sql } from "drizzle-orm";
import pg from "pg";
import { describe, expect, inject, it } from "vitest";

import { db } from "@/server/db/client";

import { MIGRATIONS_FOLDER, applyMigrations } from "../../../../scripts/apply-migrations.mjs";
import { insertPasswordUser } from "../../auth/password-user.mjs";
import { insertProduct, insertSubtypes, priceSetter } from "../../../../tests/helpers/catalog";
import { refusalOf } from "../../../../tests/helpers/database-error";
import { inventedUser } from "../../../../tests/helpers/invented";
import { createTestDatabase, dropTestDatabase } from "../../../../tests/helpers/test-database";

// The constraints of migration 0014_price_history (developer-rules.md rule 5: "Database tests that
// try the forbidden write directly"; rule 7; D39: every refused branch reached by plain SQL with
// nothing in front; D40: each pass case carries the data a wrong guard would refuse).
// 14-data-model.md: price_history; 04-catalogs.md rule 4 ("older prices stay in the price
// history"); plan of 1.9, decisions 1, 2, 3, 10 and the reviews of its plan (spec review Must fix
// 1, Should fix 1 to 4; plan review correction 2).

const AT = "2031-04-11T05:00:00Z";
const RECORDED = { code: "23514", constraint: "price_recorded" };
const APPEND_ONLY = { code: "23514", constraint: "price_history_append_only" };

type Row = {
  variantId: string;
  price?: string;
  source?: string;
  note?: string | null;
  setBy?: string;
  purchaseId?: string | null;
  clientKey?: string | null;
};

async function insertRow(row: Row) {
  const setBy = row.setBy ?? (await priceSetter());
  return db.execute<{ id: string }>(sql`insert into price_history
      (variant_id, price, source, note, set_by, purchase_id, client_key, created_at)
    values (${row.variantId}, ${row.price ?? "1000"}, ${row.source ?? "PURCHASE"},
      ${row.note ?? null}, ${setBy}, ${row.source === "HEAD" ? (row.purchaseId ?? null) : row.purchaseId === undefined ? randomUUID() : row.purchaseId},
      ${row.clientKey ?? null}, ${AT})
    returning id`);
}

/** A new price and its HEAD row in one statement: what addPrice writes. */
async function setPrice(variantId: string, price: string) {
  const setBy = await priceSetter();
  return db.execute(sql`with v as (update product_variants set reference_price = ${price}
      where id = ${variantId} returning id)
    insert into price_history (variant_id, price, source, set_by, created_at)
      select id, ${price}, 'HEAD', ${setBy}, ${AT} from v`);
}

async function priceOf(variantId: string) {
  const found = await db.execute<{ reference_price: string | null }>(
    sql`select reference_price from product_variants where id = ${variantId}`,
  );
  return found.rows[0]!.reference_price;
}

describe("price_history: columns (14-data-model.md, price_history; developer-rules rule 6)", () => {
  it("price: 0 and -1 are refused; 1 passes", async () => {
    const { defaultVariantId } = await insertProduct();
    for (const price of ["0", "-1"]) {
      expect(await refusalOf(insertRow({ variantId: defaultVariantId, price }))).toMatchObject({
        code: "23514",
        constraint: "price_history_price_check",
      });
    }
    await insertRow({ variantId: defaultVariantId, price: "1" });
  });

  it("note: blank is refused; empty (null) and a text pass (decision 1)", async () => {
    const { defaultVariantId } = await insertProduct();
    expect(await refusalOf(insertRow({ variantId: defaultVariantId, note: "   " }))).toMatchObject({
      code: "23514",
      constraint: "price_history_note_check",
    });
    await insertRow({ variantId: defaultVariantId, note: null });
    await insertRow({ variantId: defaultVariantId, note: "Yetkazib beruvchi narxi" });
  });

  it("source and purchase: a HEAD row names no purchase, a PURCHASE row names one (decision 10)", async () => {
    const { defaultVariantId } = await insertProduct({ referencePrice: 1000n });
    const refused = { code: "23514", constraint: "price_history_purchase_check" };
    expect(
      await refusalOf(
        insertRow({
          variantId: defaultVariantId,
          source: "HEAD",
          price: "1000",
          purchaseId: randomUUID(),
        }),
      ),
    ).toMatchObject(refused);
    expect(
      await refusalOf(
        insertRow({ variantId: defaultVariantId, source: "PURCHASE", purchaseId: null }),
      ),
    ).toMatchObject(refused);
    // Beside them: a PURCHASE row with its purchase and a HEAD row of the current price pass.
    await insertRow({ variantId: defaultVariantId, source: "PURCHASE", purchaseId: randomUUID() });
    await insertRow({ variantId: defaultVariantId, source: "HEAD", price: "1000" });
  });

  it("source: a value outside the enum is refused", async () => {
    const { defaultVariantId } = await insertProduct();
    expect(
      await refusalOf(insertRow({ variantId: defaultVariantId, source: "IMPORT" })),
    ).toMatchObject({ code: "22P02" });
  });

  it("foreign keys: an unknown subtype or an unknown user is refused", async () => {
    const { defaultVariantId } = await insertProduct();
    expect(await refusalOf(insertRow({ variantId: randomUUID() }))).toMatchObject({
      code: "23503",
      constraint: "price_history_variant_id_product_variants_id_fk",
    });
    expect(
      await refusalOf(insertRow({ variantId: defaultVariantId, setBy: randomUUID() })),
    ).toMatchObject({ code: "23503", constraint: "price_history_set_by_users_id_fk" });
    await insertRow({ variantId: defaultVariantId });
  });

  it("client key: a held one is refused; rows with no key pass beside it (rule 8)", async () => {
    const { defaultVariantId } = await insertProduct();
    const key = randomUUID();
    await insertRow({ variantId: defaultVariantId, clientKey: key });
    expect(
      await refusalOf(insertRow({ variantId: defaultVariantId, clientKey: key })),
    ).toMatchObject({ code: "23505", constraint: "price_history_client_key_key" });
    await insertRow({ variantId: defaultVariantId });
    await insertRow({ variantId: defaultVariantId });
  });
});

describe("price_history is append-only (decision 3, Look first; 04 rule 4; rule 7)", () => {
  it("UPDATE, DELETE and TRUNCATE are refused", async () => {
    const { defaultVariantId } = await insertProduct({ referencePrice: 5000n });
    const [row] = (
      await db.execute<{ id: string }>(
        sql`select id from price_history where variant_id = ${defaultVariantId}`,
      )
    ).rows;
    expect(
      await refusalOf(db.execute(sql`update price_history set note = 'x' where id = ${row!.id}`)),
    ).toMatchObject(APPEND_ONLY);
    expect(
      await refusalOf(db.execute(sql`delete from price_history where id = ${row!.id}`)),
    ).toMatchObject(APPEND_ONLY);
    expect(await refusalOf(db.execute(sql`truncate price_history`))).toMatchObject(APPEND_ONLY);
    const left = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from price_history where id = ${row!.id}`,
    );
    expect(left.rows[0]!.count).toBe(1);
  });
});

describe("price_recorded: the reference price is the newest HEAD row's (decision 2, Look first)", () => {
  it("(a) a subtype inserted with a price and no row is refused, also when another subtype has a row of that price", async () => {
    const product = await insertProduct();
    const [first] = await insertSubtypes(product.id, [{ referencePrice: 70_000n }]);
    expect(await priceOf(first!)).toBe("70000");
    expect(
      await refusalOf(
        db.execute(sql`insert into product_variants (product_id, name, reference_price, created_at)
          values (${product.id}, ${`Turi ${randomUUID()}`}, 70000, ${AT})`),
      ),
    ).toMatchObject(RECORDED);
  });

  it("(b) a price changed to an older row's price is refused, as is one only another subtype's row matches", async () => {
    const product = await insertProduct();
    const [a, b] = await insertSubtypes(product.id, [
      { referencePrice: 50_000n },
      { referencePrice: 90_000n },
    ]);
    await setPrice(a!, "60000");
    // 50 000 is in A's history, but not its newest HEAD row.
    expect(
      await refusalOf(
        db.execute(sql`update product_variants set reference_price = 50000 where id = ${a}`),
      ),
    ).toMatchObject(RECORDED);
    // 90 000 is B's newest row, not A's: rows are matched by subtype (plan review, correction 2).
    expect(
      await refusalOf(
        db.execute(sql`update product_variants set reference_price = 90000 where id = ${a}`),
      ),
    ).toMatchObject(RECORDED);
    expect(await priceOf(a!)).toBe("60000");
    expect(await priceOf(b!)).toBe("90000");
  });

  it("(c) a price set back to empty is refused", async () => {
    const { defaultVariantId } = await insertProduct({ referencePrice: 5000n });
    expect(
      await refusalOf(
        db.execute(
          sql`update product_variants set reference_price = null where id = ${defaultVariantId}`,
        ),
      ),
    ).toMatchObject(RECORDED);
    expect(await priceOf(defaultVariantId)).toBe("5000");
  });

  it("(d) a HEAD row inserted without the price change is refused; a PURCHASE row of another price is not checked", async () => {
    const { defaultVariantId } = await insertProduct({ referencePrice: 5000n });
    expect(
      await refusalOf(insertRow({ variantId: defaultVariantId, source: "HEAD", price: "7000" })),
    ).toMatchObject(RECORDED);
    await insertRow({ variantId: defaultVariantId, source: "PURCHASE", price: "7000" });
    expect(await priceOf(defaultVariantId)).toBe("5000");
  });

  it("a change with its row passes; two prices at one frozen moment are ordered by seq (spec review, Must fix 1)", async () => {
    const product = await insertProduct();
    const [a, b] = await insertSubtypes(product.id, [
      { referencePrice: 50_000n },
      { referencePrice: 40_000n },
    ]);
    const setBy = await priceSetter();
    // Both rows of A carry the same moment; the later one by seq is current.
    await db.transaction(async (tx) => {
      for (const price of ["60000", "70000"]) {
        await tx.execute(
          sql`update product_variants set reference_price = ${price} where id = ${a}`,
        );
        await tx.execute(sql`insert into price_history (variant_id, price, source, set_by, created_at)
          values (${a}, ${price}, 'HEAD', ${setBy}, ${AT})`);
      }
    });
    // Beside it, B gets a newer row of another price (D40).
    await setPrice(b!, "80000");
    expect(await priceOf(a!)).toBe("70000");
    expect(await priceOf(b!)).toBe("80000");
    const rows = await db.execute<{ price: string }>(
      sql`select price from price_history where variant_id = ${a} order by seq desc`,
    );
    expect(rows.rows.map((row) => row.price)).toEqual(["70000", "60000", "50000"]);
  });

  it("the row may come first and the price after, in one transaction (deferred)", async () => {
    const { defaultVariantId } = await insertProduct({ referencePrice: 5000n });
    const setBy = await priceSetter();
    await db.transaction(async (tx) => {
      await tx.execute(sql`insert into price_history (variant_id, price, source, set_by, created_at)
        values (${defaultVariantId}, 6000, 'HEAD', ${setBy}, ${AT})`);
      await tx.execute(
        sql`update product_variants set reference_price = 6000 where id = ${defaultVariantId}`,
      );
    });
    expect(await priceOf(defaultVariantId)).toBe("6000");
  });
});

// The backfill (progress 1.7 and 1.8, "For 1.9"; plan of 1.9, decision 1; spec review, Should fix
// 1 and 2): drizzle/ cut at 0013, rows written there, then the whole folder.
describe("migration 0014: every price set before it gets its HEAD row", () => {
  function cutAt(tag: string) {
    const cut = mkdtempSync(join(tmpdir(), `migrations-${tag.slice(0, 4)}-`));
    cpSync(MIGRATIONS_FOLDER, cut, { recursive: true });
    const journalPath = join(cut, "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    const index = journal.entries.findIndex((entry: { tag: string }) => entry.tag === tag);
    expect(index).toBeGreaterThan(0);
    journal.entries = journal.entries.slice(0, index + 1);
    writeFileSync(journalPath, JSON.stringify(journal));
    return cut;
  }

  async function withDatabaseAt0013(work: (client: pg.Client, url: string) => Promise<void>) {
    const serverUrl = inject("databaseServerUrl");
    const cut = cutAt("0013_product_variants");
    const database = await createTestDatabase(serverUrl, { fromTemplate: false });
    const client = new pg.Client({ connectionString: database.url });
    try {
      await applyMigrations(database.url, cut);
      await client.connect();
      await work(client, database.url);
    } finally {
      await client.end();
      await dropTestDatabase(serverUrl, database.name);
      rmSync(cut, { recursive: true, force: true });
    }
  }

  async function head(client: pg.Client, at: string) {
    const query = (text: string, values: unknown[]) => client.query(text, values);
    const { id } = await insertPasswordUser(
      query,
      inventedUser("HEAD"),
      "invented-password",
      new Date(at),
    );
    return id as string;
  }

  /** A product with its default, priced or not, in one transaction (the shape trigger of 0013). */
  async function product(client: pg.Client, price: number | null) {
    await client.query("begin");
    const category = await client.query(
      `insert into categories (name, created_at) values ($1, $2) returning id`,
      [`Toifa ${randomUUID()}`, AT],
    );
    const unit = await client.query(
      `insert into units (name, short_name, allow_decimal, created_at)
        values ($1, $2, false, $3) returning id`,
      [`O'lchov ${randomUUID()}`, randomUUID().slice(0, 8), AT],
    );
    const made = await client.query(
      `insert into products (name, category_id, unit_id, reference_price, created_at)
        values ($1, $2, $3, $4, $5) returning id`,
      [`Mahsulot ${randomUUID()}`, category.rows[0].id, unit.rows[0].id, price, AT],
    );
    const variant = await client.query(
      `insert into product_variants (product_id, name, is_default, reference_price, created_at)
        values ($1, 'default', true, $2, $3) returning id`,
      [made.rows[0].id, price, AT],
    );
    await client.query("commit");
    return { productId: made.rows[0].id as string, variantId: variant.rows[0].id as string };
  }

  async function auditRow(
    client: pg.Client,
    row: {
      actor: string;
      action: string;
      entity: string;
      entityId: string;
      at: string;
      before?: object | null;
      after: object;
    },
  ) {
    await client.query(
      `insert into audit_log (actor_id, action, entity, entity_id, before, after, created_at)
        values ($1, $2, $3, $4, $5, $6, $7)`,
      [row.actor, row.action, row.entity, row.entityId, row.before ?? null, row.after, row.at],
    );
  }

  /** The default made real (1.8): `is_default` false and `has_variants` true, with a price or not. */
  async function convert(client: pg.Client, productId: string, variantId: string, price?: number) {
    await client.query("begin");
    await client.query(
      `update product_variants set is_default = false, name = $2,
        reference_price = coalesce($3, reference_price) where id = $1`,
      [variantId, `Turi ${randomUUID()}`, price ?? null],
    );
    await client.query(`update products set has_variants = true where id = $1`, [productId]);
    await client.query("commit");
  }

  it("credits each price to the audit row that set it, the first subtype that kept the default's price to the product's", async () => {
    await withDatabaseAt0013(async (client, url) => {
      const oldest = await head(client, "2031-01-01T00:00:00Z");
      const other = await head(client, "2031-02-01T00:00:00Z");
      const at = (day: number) => `2031-03-${String(day).padStart(2, "0")}T06:00:00.000Z`;

      // P1: a product created at 50 000.
      const p1 = await product(client, 50000);
      await auditRow(client, {
        actor: other,
        action: "product.create",
        entity: "products",
        entityId: p1.productId,
        at: at(1),
        after: { referencePrice: "50000" },
      });
      // P2: created at 40 000; its first subtype kept the price (the conversion by another Head).
      const p2 = await product(client, 40000);
      await auditRow(client, {
        actor: other,
        action: "product.create",
        entity: "products",
        entityId: p2.productId,
        at: at(2),
        after: { referencePrice: "40000" },
      });
      await convert(client, p2.productId, p2.variantId);
      await auditRow(client, {
        actor: oldest,
        action: "subtype.create",
        entity: "product_variants",
        entityId: p2.variantId,
        at: at(3),
        before: { name: "default", referencePrice: "40000" },
        after: { referencePrice: "40000", fromDefault: true },
      });
      // P3: created with no price; its first subtype took 30 000.
      const p3 = await product(client, null);
      await auditRow(client, {
        actor: other,
        action: "product.create",
        entity: "products",
        entityId: p3.productId,
        at: at(4),
        after: { referencePrice: null },
      });
      await convert(client, p3.productId, p3.variantId, 30000);
      await auditRow(client, {
        actor: oldest,
        action: "subtype.create",
        entity: "product_variants",
        entityId: p3.variantId,
        at: at(5),
        before: { name: "default", referencePrice: null },
        after: { referencePrice: "30000", fromDefault: true },
      });
      // P3 also gets a new subtype at 20 000 and one with no price.
      const second = await client.query(
        `insert into product_variants (product_id, name, reference_price, created_at)
          values ($1, $2, 20000, $3) returning id`,
        [p3.productId, `Turi ${randomUUID()}`, at(6)],
      );
      await auditRow(client, {
        actor: other,
        action: "subtype.create",
        entity: "product_variants",
        entityId: second.rows[0].id,
        at: at(6),
        after: { referencePrice: "20000" },
      });
      const unpriced = await client.query(
        `insert into product_variants (product_id, name, created_at) values ($1, $2, $3) returning id`,
        [p3.productId, `Turi ${randomUUID()}`, at(7)],
      );
      // P4: a price with no audit row at all: the subtype's own time and the oldest Head.
      const p4 = await product(client, 10000);

      await applyMigrations(url);
      const rows = await client.query(
        `select variant_id, price, source, note, set_by, purchase_id, created_at
          from price_history order by seq`,
      );
      const byVariant = new Map(rows.rows.map((row) => [row.variant_id, row]));
      expect(rows.rows).toHaveLength(5);
      const expectRow = (variantId: string, price: string, setBy: string, when: string) =>
        expect(byVariant.get(variantId)).toMatchObject({
          price,
          source: "HEAD",
          note: null,
          set_by: setBy,
          purchase_id: null,
          created_at: new Date(when),
        });
      expectRow(p1.variantId, "50000", other, at(1));
      expectRow(p2.variantId, "40000", other, at(2));
      expectRow(p3.variantId, "30000", oldest, at(5));
      expectRow(second.rows[0].id, "20000", other, at(6));
      expectRow(p4.variantId, "10000", oldest, AT);
      expect(byVariant.has(unpriced.rows[0].id)).toBe(false);
    });
  });

  it("an empty database migrates; a price with no audit row and no Head refuses the migration", async () => {
    await withDatabaseAt0013(async (client, url) => {
      await applyMigrations(url);
      const count = await client.query(`select count(*)::int as count from price_history`);
      expect(count.rows[0].count).toBe(0);
    });
    await withDatabaseAt0013(async (client, url) => {
      await product(client, 10000);
      await expect(applyMigrations(url)).rejects.toThrow(/no Head to credit/);
      const tables = await client.query(`select to_regclass('price_history') as found`);
      expect(tables.rows[0].found).toBeNull();
    });
  });
});
