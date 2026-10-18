import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { bought, spendingScene } from "../../../../tests/helpers/analytics";
import { refusalOf } from "../../../../tests/helpers/database-error";

// The constraints of migration 0036_analytics_spending (build-plan 6.3; plan of 6.3, Database
// changes, and its tests line "a repeated purchase_id, each FK, a negative amount"). Each
// forbidden write goes straight to the table with nothing in front (D39), beside the row the guard
// lets through (D40). developer-rules.md rule 5: amount CHECKs, a foreign key on every relation.

const CHECK = "23514";
const FOREIGN = "23503";
const UNIQUE = "23505";

type Row = {
  purchase_id: string;
  order_id: string;
  branch_id: string;
  category_id: string;
  department_id: string;
  owner_id: string;
  supplier_id: string | null;
  amount: string;
};

let valid: Row;

beforeAll(async () => {
  const scene = await spendingScene();
  const record = await bought(scene, { purchasedOn: "2031-05-02" });
  valid = {
    purchase_id: record.purchaseId,
    order_id: record.orderId,
    branch_id: scene.branch.id,
    category_id: scene.category.id,
    department_id: scene.department.id,
    owner_id: scene.manager.id,
    supplier_id: scene.supplier.id,
    amount: "10000",
  };
});

function insertRow(row: Row) {
  return db.execute(sql`
    insert into analytics_spending (purchase_id, order_id, branch_id, purchased_on, category_id,
      department_id, owner_id, supplier_id, amount, variant_id, qty, unit_price, goods, created_at)
    values (${row.purchase_id}, ${row.order_id}, ${row.branch_id}, '2031-05-02',
      ${row.category_id}, ${row.department_id}, ${row.owner_id}, ${row.supplier_id},
      ${row.amount}, (select variant_id from purchases where id = ${valid.purchase_id}), 1, 0, 0,
      '2031-05-02T05:00:00Z')`);
}

describe("analytics_spending", () => {
  it("takes the valid row, an amount of 0 and no supplier", async () => {
    // Deleted again, so the next cases write the same record.
    await insertRow({ ...valid, amount: "0", supplier_id: null });
    await db.execute(sql`delete from analytics_spending`);
  });

  it("refuses a negative amount (analytics_spending_amount_check)", async () => {
    expect(await refusalOf(insertRow({ ...valid, amount: "-1" }))).toMatchObject({
      code: CHECK,
      constraint: "analytics_spending_amount_check",
    });
  });

  it("refuses a second row of one purchase record (the primary key)", async () => {
    await insertRow(valid);
    try {
      expect(await refusalOf(insertRow({ ...valid, amount: "5" }))).toMatchObject({
        code: UNIQUE,
        constraint: "analytics_spending_pkey",
      });
    } finally {
      await db.execute(sql`delete from analytics_spending`);
    }
  });

  it.each([
    ["purchase_id", "analytics_spending_purchase_id_purchases_id_fk"],
    ["order_id", "analytics_spending_order_id_orders_id_fk"],
    ["branch_id", "analytics_spending_branch_id_branches_id_fk"],
    ["category_id", "analytics_spending_category_id_categories_id_fk"],
    ["department_id", "analytics_spending_department_id_departments_id_fk"],
    ["owner_id", "analytics_spending_owner_id_users_id_fk"],
    ["supplier_id", "analytics_spending_supplier_id_companies_id_fk"],
  ] as const)("refuses an unknown %s (%s)", async (column, constraint) => {
    expect(await refusalOf(insertRow({ ...valid, [column]: randomUUID() }))).toMatchObject({
      code: FOREIGN,
      constraint,
    });
  });
});
