import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { insertProduct, insertSubtypes } from "../../../../tests/helpers/catalog";
import { refusalOf } from "../../../../tests/helpers/database-error";
import { insertUser } from "../../../../tests/helpers/users";

// The constraints of migration 0055_manager_adds (04-catalogs.md rule 8; 14-data-model.md,
// products and product_variants: added_by, checked_at; developer-rules.md rule 5; D39: each guard
// on INSERT and on UPDATE, plain SQL with nothing in front; D40: each refused write beside an
// accepted one). Only an entry a Manager added is marked checked; added_by is a user.

const AT = "2026-10-25T10:00:00Z";

describe("products: added_by and checked_at (0055)", () => {
  it("on INSERT: checked_at without added_by is refused; with it, it passes; an unknown user is refused", async () => {
    const manager = await insertUser("MANAGER");
    const base = await insertProduct();
    const insert = (addedBy: string | null, checkedAt: string | null) =>
      db.execute(sql`
        insert into products (name, category_id, unit_id, added_by, checked_at, has_variants, created_at)
        select ${`Tekshir ${randomUUID().slice(0, 8)}`}, category_id, unit_id, ${addedBy}::uuid,
               ${checkedAt}::timestamptz, true, ${AT}
          from products where id = ${base.id}`);
    expect(await refusalOf(insert(null, AT))).toMatchObject({
      code: "23514",
      constraint: "products_checked_at_check",
    });
    expect(await refusalOf(insert(randomUUID(), null))).toMatchObject({
      code: "23503",
      constraint: "products_added_by_users_id_fk",
    });
    // A product with no subtype row fails the deferred shape check only at commit, so the
    // accepted insert runs inside a transaction that adds its default row.
    await db.transaction(async (tx) => {
      const name = `Tekshir ${randomUUID().slice(0, 8)}`;
      await tx.execute(sql`
        insert into products (name, category_id, unit_id, added_by, checked_at, created_at)
        select ${name}, category_id, unit_id, ${manager.id}, ${AT}, ${AT}
          from products where id = ${base.id}`);
      await tx.execute(sql`
        insert into product_variants (product_id, name, is_default, created_at)
        select id, 'default', true, ${AT} from products where name = ${name}`);
    });
  });

  it("on UPDATE: checked_at on a product no Manager added is refused; an unknown added_by is refused; with added_by it passes", async () => {
    const manager = await insertUser("MANAGER");
    const product = await insertProduct();
    expect(
      await refusalOf(
        db.execute(sql`update products set checked_at = ${AT} where id = ${product.id}`),
      ),
    ).toMatchObject({ code: "23514", constraint: "products_checked_at_check" });
    expect(
      await refusalOf(
        db.execute(sql`update products set added_by = ${randomUUID()} where id = ${product.id}`),
      ),
    ).toMatchObject({ code: "23503", constraint: "products_added_by_users_id_fk" });
    await db.execute(
      sql`update products set added_by = ${manager.id}, checked_at = ${AT} where id = ${product.id}`,
    );
  });
});

describe("product_variants: added_by and checked_at (0055)", () => {
  it("on INSERT: checked_at without added_by is refused; an unknown user is refused; with added_by it passes", async () => {
    const manager = await insertUser("MANAGER");
    const product = await insertProduct();
    await insertSubtypes(product.id, [{ name: "bir" }]);
    const insert = (name: string, addedBy: string | null, checkedAt: string | null) =>
      db.execute(sql`
        insert into product_variants (product_id, name, added_by, checked_at, created_at)
        values (${product.id}, ${name}, ${addedBy}::uuid, ${checkedAt}::timestamptz, ${AT})`);
    expect(await refusalOf(insert("ikki", null, AT))).toMatchObject({
      code: "23514",
      constraint: "product_variants_checked_at_check",
    });
    expect(await refusalOf(insert("ikki", randomUUID(), null))).toMatchObject({
      code: "23503",
      constraint: "product_variants_added_by_users_id_fk",
    });
    await insert("ikki", manager.id, AT);
  });

  it("on UPDATE: checked_at without added_by is refused; an unknown added_by is refused; with added_by it passes", async () => {
    const manager = await insertUser("MANAGER");
    const product = await insertProduct();
    const [id] = await insertSubtypes(product.id, [{ name: "bir" }]);
    expect(
      await refusalOf(
        db.execute(sql`update product_variants set checked_at = ${AT} where id = ${id!}`),
      ),
    ).toMatchObject({ code: "23514", constraint: "product_variants_checked_at_check" });
    expect(
      await refusalOf(
        db.execute(sql`update product_variants set added_by = ${randomUUID()} where id = ${id!}`),
      ),
    ).toMatchObject({ code: "23503", constraint: "product_variants_added_by_users_id_fk" });
    await db.execute(
      sql`update product_variants set added_by = ${manager.id}, checked_at = ${AT} where id = ${id!}`,
    );
  });
});
