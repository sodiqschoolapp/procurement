import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { refusalOf } from "../../../../tests/helpers/database-error";
import { insertItem } from "../../../../tests/helpers/orders";

// The constraints of migration 0035_stock_minimums (build-plan 5.10; plan of 5.10, Database
// changes; review of the plan, must fix 2). Each forbidden write goes straight to the table with
// nothing in front (D39), on insert and on update, beside the write the guard lets through (D40).
// Spec: 14-data-model.md, stock_minimums "KEY (branch_id, variant_id)"; developer-rules.md rule 5
// (amount CHECKs, a foreign key on every relation); plan of 5.10, decided item 1 (a minimum is
// above 0, none is null).

const AT = "2031-05-03T05:00:00Z";
const CHECK = "23514";
const FOREIGN = "23503";
const UNIQUE = "23505";

let branchId: string;

beforeAll(async () => {
  branchId = (await insertBranch()).id;
});

function insertMinimum(variantId: string, minQty: string | null, branch = branchId) {
  return db.execute(sql`
    insert into stock_minimums (branch_id, variant_id, min_qty, created_at, updated_at)
    values (${branch}, ${variantId}, ${minQty}, ${AT}, ${AT})`);
}

describe("stock_minimums_min_qty_check: a minimum is above 0 (decided item 1)", () => {
  it("refuses 0 and a negative on insert; takes 0.001 and null", async () => {
    const refused = { code: CHECK, constraint: "stock_minimums_min_qty_check" };
    expect(await refusalOf(insertMinimum((await insertItem()).variantId, "0"))).toMatchObject(
      refused,
    );
    expect(await refusalOf(insertMinimum((await insertItem()).variantId, "-1"))).toMatchObject(
      refused,
    );
    await insertMinimum((await insertItem()).variantId, "0.001");
    await insertMinimum((await insertItem()).variantId, null);
  });

  it("and on update", async () => {
    const { variantId } = await insertItem();
    await insertMinimum(variantId, "2");
    expect(
      await refusalOf(
        db.execute(sql`update stock_minimums set min_qty = 0
          where branch_id = ${branchId} and variant_id = ${variantId}`),
      ),
    ).toMatchObject({ code: CHECK, constraint: "stock_minimums_min_qty_check" });
    await db.execute(sql`update stock_minimums set min_qty = null
      where branch_id = ${branchId} and variant_id = ${variantId}`);
  });
});

describe("the key and the foreign keys (14 stock_minimums; developer-rules.md rule 5)", () => {
  it("one row per branch and subtype; the same subtype in another branch is its own row", async () => {
    const { variantId } = await insertItem();
    await insertMinimum(variantId, "2");
    expect(await refusalOf(insertMinimum(variantId, "3"))).toMatchObject({
      code: UNIQUE,
      constraint: "stock_minimums_pkey",
    });
    await insertMinimum(variantId, "3", (await insertBranch()).id);
  });

  it("refuses an unknown branch and an unknown subtype, on insert and on update", async () => {
    const { variantId } = await insertItem();
    expect(await refusalOf(insertMinimum(variantId, "2", randomUUID()))).toMatchObject({
      code: FOREIGN,
      constraint: "stock_minimums_branch_id_branches_id_fk",
    });
    expect(await refusalOf(insertMinimum(randomUUID(), "2"))).toMatchObject({
      code: FOREIGN,
      constraint: "stock_minimums_variant_id_product_variants_id_fk",
    });
    await insertMinimum(variantId, "2");
    expect(
      await refusalOf(
        db.execute(sql`update stock_minimums set variant_id = ${randomUUID()}
          where branch_id = ${branchId} and variant_id = ${variantId}`),
      ),
    ).toMatchObject({
      code: FOREIGN,
      constraint: "stock_minimums_variant_id_product_variants_id_fk",
    });
    expect(
      await refusalOf(
        db.execute(sql`update stock_minimums set branch_id = ${randomUUID()}
          where branch_id = ${branchId} and variant_id = ${variantId}`),
      ),
    ).toMatchObject({ code: FOREIGN, constraint: "stock_minimums_branch_id_branches_id_fk" });
  });
});
