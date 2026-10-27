import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { bought, spendingScene } from "../../../../tests/helpers/analytics";
import { refusalOf } from "../../../../tests/helpers/database-error";

// The constraints of migration 0058_unpriced_outcomes (build plan 2.5d-c; plan of 2.5d-c,
// Database changes, decided item 1, Look first): the ended orders without a planned price. Each
// forbidden write goes straight to the table with nothing in front (D39), beside the row the guard
// lets through (D40). developer-rules.md rule 5: amount CHECKs, a foreign key on every relation.

const CHECK = "23514";
const FOREIGN = "23503";
const UNIQUE = "23505";
const NOT_NULL = "23502";

type Row = {
  order_id: string;
  branch_id: string;
  ended_on: string | null;
  category_id: string;
  department_id: string | null;
  owner_id: string;
  actual: string;
};

let valid: Row;
let otherBranch: string;

beforeAll(async () => {
  const scene = await spendingScene();
  const record = await bought(scene, {
    purchasedOn: "2031-05-02",
    progress: "DONE",
    plannedPrice: null,
  });
  valid = {
    order_id: record.orderId,
    branch_id: scene.branch.id,
    ended_on: "2031-05-02",
    category_id: scene.category.id,
    department_id: scene.department.id,
    owner_id: scene.manager.id,
    actual: "10000",
  };
  otherBranch = (await spendingScene()).branch.id;
});

function insertRow(row: Row) {
  return db.execute(sql`
    insert into analytics_unpriced (order_id, branch_id, ended_on, category_id, department_id,
      owner_id, actual)
    values (${row.order_id}, ${row.branch_id}, ${row.ended_on}, ${row.category_id},
      ${row.department_id}, ${row.owner_id}, ${row.actual})`);
}

describe("analytics_unpriced", () => {
  it("takes the valid row, an actual of 0 and no department", async () => {
    await insertRow({ ...valid, actual: "0", department_id: null });
    await db.execute(sql`delete from analytics_unpriced where order_id = ${valid.order_id}`);
  });

  it("refuses a negative actual (analytics_unpriced_actual_check)", async () => {
    expect(await refusalOf(insertRow({ ...valid, actual: "-1" }))).toMatchObject({
      code: CHECK,
      constraint: "analytics_unpriced_actual_check",
    });
  });

  it("refuses an empty day it ended on", async () => {
    expect(await refusalOf(insertRow({ ...valid, ended_on: null }))).toMatchObject({
      code: NOT_NULL,
    });
  });

  it("refuses a second row of one order (the primary key)", async () => {
    await insertRow(valid);
    try {
      expect(await refusalOf(insertRow({ ...valid, actual: "5" }))).toMatchObject({
        code: UNIQUE,
        constraint: "analytics_unpriced_pkey",
      });
    } finally {
      await db.execute(sql`delete from analytics_unpriced where order_id = ${valid.order_id}`);
    }
  });

  it("refuses the order under another branch (analytics_unpriced_order_branch_fk)", async () => {
    expect(await refusalOf(insertRow({ ...valid, branch_id: otherBranch }))).toMatchObject({
      code: FOREIGN,
      constraint: "analytics_unpriced_order_branch_fk",
    });
  });

  it.each([
    ["order_id", "analytics_unpriced_order_id_orders_id_fk"],
    ["branch_id", "analytics_unpriced_branch_id_branches_id_fk"],
    ["category_id", "analytics_unpriced_category_id_categories_id_fk"],
    ["department_id", "analytics_unpriced_department_id_departments_id_fk"],
    ["owner_id", "analytics_unpriced_owner_id_users_id_fk"],
  ] as const)("refuses an unknown %s (%s)", async (column, constraint) => {
    expect(await refusalOf(insertRow({ ...valid, [column]: randomUUID() }))).toMatchObject({
      code: FOREIGN,
      constraint,
    });
  });
});
