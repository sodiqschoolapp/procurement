import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { bought, spendingScene } from "../../../../tests/helpers/analytics";
import { insertBranch } from "../../../../tests/helpers/branches";
import { refusalOf } from "../../../../tests/helpers/database-error";
import { insertDepartment } from "../../../../tests/helpers/orders";

// The constraints of migration 0044_analytics_finance_speed (build-plan 6.6b; plan of 6.6b,
// Database changes): the seconds CHECK and every foreign key of analytics_settlements, and the NOT
// NULL of analytics_spending.has_receipt. Each forbidden write goes straight to the table beside
// the rows the guard lets through (D39, D40). developer-rules.md rule 5.

const CHECK = "23514";
const FOREIGN_KEY = "23503";
const NOT_NULL = "23502";

type SettlementRow = {
  order_id: string;
  branch_id: string;
  sent_at: string;
  closed_at: string;
  seconds: string;
  category_id: string;
  department_id: string;
  owner_id: string;
};

let valid: SettlementRow;
let other: { department: string; order: string };

beforeAll(async () => {
  const scene = await spendingScene();
  const order = await bought(scene, { purchasedOn: "2031-05-02" });
  valid = {
    order_id: order.orderId,
    branch_id: scene.branch.id,
    sent_at: "2031-05-03T05:00:00Z",
    closed_at: "2031-05-04T05:00:00Z",
    seconds: "86400",
    category_id: scene.category.id,
    department_id: scene.department.id,
    owner_id: scene.manager.id,
  };
  // Another branch with its own department and order: every key pair is then crossed on purpose.
  const elsewhere = await spendingScene((await insertBranch()).id);
  const theirs = await bought(elsewhere, { purchasedOn: "2031-05-02" });
  other = {
    department: (await insertDepartment(elsewhere.branch.id)).id,
    order: theirs.orderId,
  };
});

const insert = (row: SettlementRow) =>
  db.execute(sql`
    insert into analytics_settlements (order_id, branch_id, sent_at, closed_at, closed_on,
      seconds, category_id, department_id, owner_id)
    values (${row.order_id}, ${row.branch_id}, ${row.sent_at}, ${row.closed_at}, '2031-05-04',
      ${row.seconds}, ${row.category_id}, ${row.department_id}, ${row.owner_id})`);
const clear = () =>
  db.execute(sql`delete from analytics_settlements where order_id = ${valid.order_id}`);

async function refusedOnBoth(
  change: Partial<SettlementRow>,
  set: string,
  code: string,
  name: string,
) {
  expect(await refusalOf(insert({ ...valid, ...change }))).toMatchObject({
    code,
    constraint: name,
  });
  await insert(valid);
  try {
    expect(
      await refusalOf(
        db.execute(
          sql`update analytics_settlements set ${sql.raw(set)} where order_id = ${valid.order_id}`,
        ),
      ),
    ).toMatchObject({ code, constraint: name });
  } finally {
    await clear();
  }
}

describe("analytics_settlements (plan of 6.6b, decided items 3 and 9)", () => {
  it("takes a settlement, one closed the moment it was sent, and a second one of the same order", async () => {
    await insert(valid);
    // A second settlement after a Reopen: another close of the same order.
    await insert({
      ...valid,
      sent_at: "2031-05-10T05:00:00Z",
      closed_at: "2031-05-10T05:00:00Z",
      seconds: "0",
    });
    await clear();
  });

  it("refuses a close before its send, on insert and on update (analytics_settlements_seconds_check)", async () => {
    await refusedOnBoth(
      { closed_at: "2031-05-03T04:59:59Z" },
      `closed_at = '2031-05-03T04:59:59Z'`,
      CHECK,
      "analytics_settlements_seconds_check",
    );
  });

  it("refuses seconds below 0, on insert and on update (analytics_settlements_seconds_check)", async () => {
    await refusedOnBoth(
      { seconds: "-1" },
      "seconds = -1",
      CHECK,
      "analytics_settlements_seconds_check",
    );
  });

  it("refuses an order of another branch (analytics_settlements_order_branch_fk)", async () => {
    await refusedOnBoth(
      { order_id: other.order },
      `order_id = '${other.order}'`,
      FOREIGN_KEY,
      "analytics_settlements_order_branch_fk",
    );
  });

  it("refuses a department of another branch (analytics_settlements_department_branch_fk)", async () => {
    await refusedOnBoth(
      { department_id: other.department },
      `department_id = '${other.department}'`,
      FOREIGN_KEY,
      "analytics_settlements_department_branch_fk",
    );
  });

  it.each([
    ["category_id", "analytics_settlements_category_id_categories_id_fk"],
    ["owner_id", "analytics_settlements_owner_id_users_id_fk"],
  ] as const)("refuses a %s that does not exist (%s)", async (column, name) => {
    const missing = randomUUID();
    await refusedOnBoth({ [column]: missing }, `${column} = '${missing}'`, FOREIGN_KEY, name);
  });
});

describe("analytics_spending.has_receipt (plan of 6.6b, decided item 4)", () => {
  it("is NOT NULL", async () => {
    const scene = await spendingScene();
    const order = await bought(scene, { purchasedOn: "2031-05-02" });
    expect(
      await refusalOf(
        db.execute(sql`
          insert into analytics_spending (purchase_id, order_id, branch_id, purchased_on,
            category_id, department_id, owner_id, amount, variant_id, qty, unit_price, goods,
            created_at, has_receipt)
          values (${order.purchaseId}, ${order.orderId}, ${scene.branch.id}, '2031-05-02',
            ${scene.category.id}, ${scene.department.id}, ${scene.manager.id}, 0,
            ${order.variantId}, 1, 0, 0, '2031-05-02T05:00:00Z', null)`),
      ),
    ).toMatchObject({ code: NOT_NULL, column: "has_receipt" });
  });
});
