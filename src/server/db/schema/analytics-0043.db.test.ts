import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { bought, decided, moneyOn, spendingScene } from "../../../../tests/helpers/analytics";
import { insertBranch } from "../../../../tests/helpers/branches";
import { refusalOf } from "../../../../tests/helpers/database-error";
import { insertDepartment } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";

// The constraints of migration 0043_analytics_finance (build-plan 6.6a; plan of 6.6a, Database
// changes; review of the plan, Should fix 9): the kind and amount CHECKs and every foreign key of
// analytics_money, and the need CHECK of analytics_orders. Each forbidden write goes straight to
// the table beside the rows the guard lets through (D39, D40). developer-rules.md rule 5.

const CHECK = "23514";
const FOREIGN_KEY = "23503";

type MoneyRow = {
  money_row_id: string;
  order_id: string;
  branch_id: string;
  manager_id: string;
  category_id: string;
  department_id: string;
  kind: string;
  amount: string;
};

let valid: MoneyRow;
let other: { branch: string; department: string; order: string };
let pending: { id: string; branch: string; category: string; department: string; owner: string };

beforeAll(async () => {
  const scene = await spendingScene();
  const finance = await insertUser("FINANCE", { branches: [scene.branch.id] });
  const order = await bought(scene, { purchasedOn: "2031-05-02" });
  const { actionId } = await moneyOn(order, finance.id, {
    amount: 1_000n,
    occurredOn: "2031-05-03",
  });
  const row = await db.execute<{ id: string }>(
    sql`select id from money_rows where money_action_id = ${actionId}`,
  );
  valid = {
    money_row_id: row.rows[0]!.id,
    order_id: order.orderId,
    branch_id: scene.branch.id,
    manager_id: scene.manager.id,
    category_id: scene.category.id,
    department_id: scene.department.id,
    kind: "CASH_GIVEN",
    amount: "1000",
  };
  // Another branch with its own department and order: every key pair is then crossed on purpose.
  const elsewhere = await spendingScene((await insertBranch()).id);
  const theirs = await bought(elsewhere, { purchasedOn: "2031-05-02" });
  other = {
    branch: elsewhere.branch.id,
    department: (await insertDepartment(elsewhere.branch.id)).id,
    order: theirs.orderId,
  };
  const waiting = await decided(scene, "PENDING_HEAD", []);
  pending = {
    id: waiting.id,
    branch: scene.branch.id,
    category: scene.category.id,
    department: scene.department.id,
    owner: scene.manager.id,
  };
});

const insertMoney = (row: MoneyRow) =>
  db.execute(sql`
    insert into analytics_money (money_row_id, order_id, branch_id, manager_id, category_id,
      department_id, kind, amount, occurred_on)
    values (${row.money_row_id}, ${row.order_id}, ${row.branch_id}, ${row.manager_id},
      ${row.category_id}, ${row.department_id}, ${row.kind}, ${row.amount}, '2031-05-03')`);
const clearMoney = () =>
  db.execute(sql`delete from analytics_money where money_row_id = ${valid.money_row_id}`);

async function refusedOnBoth(change: Partial<MoneyRow>, set: string, code: string, name: string) {
  expect(await refusalOf(insertMoney({ ...valid, ...change }))).toMatchObject({
    code,
    constraint: name,
  });
  await insertMoney(valid);
  try {
    expect(
      await refusalOf(
        db.execute(
          sql`update analytics_money set ${sql.raw(set)} where money_row_id = ${valid.money_row_id}`,
        ),
      ),
    ).toMatchObject({ code, constraint: name });
  } finally {
    await clearMoney();
  }
}

describe("analytics_money (plan of 6.6a, decided item 2)", () => {
  it("takes a Cash given, a Cash returned and a Paid back row", async () => {
    for (const kind of ["CASH_GIVEN", "CASH_RETURNED", "PAID_BACK"]) {
      await insertMoney({ ...valid, kind });
      await clearMoney();
    }
  });

  it.each(["BANK_TRANSFER", "CARD_TOPUP", "CARD_RETURNED"])(
    "refuses a %s row, on insert and on update (analytics_money_kind_check)",
    async (kind) => {
      await refusedOnBoth({ kind }, `kind = '${kind}'`, CHECK, "analytics_money_kind_check");
    },
  );

  it.each(["0", "-1"])("refuses an amount of %s, on insert and on update", async (amount) => {
    await refusedOnBoth({ amount }, `amount = ${amount}`, CHECK, "analytics_money_amount_check");
  });

  it("refuses an order of another branch (analytics_money_order_branch_fk)", async () => {
    await refusedOnBoth(
      { order_id: other.order },
      `order_id = '${other.order}'`,
      FOREIGN_KEY,
      "analytics_money_order_branch_fk",
    );
  });

  it("refuses a department of another branch (analytics_money_department_branch_fk)", async () => {
    await refusedOnBoth(
      { department_id: other.department },
      `department_id = '${other.department}'`,
      FOREIGN_KEY,
      "analytics_money_department_branch_fk",
    );
  });

  it.each([
    ["money_row_id", "analytics_money_money_row_id_money_rows_id_fk"],
    ["manager_id", "analytics_money_manager_id_users_id_fk"],
    ["category_id", "analytics_money_category_id_categories_id_fk"],
  ] as const)("refuses a %s that does not exist (%s)", async (column, name) => {
    const missing = randomUUID();
    await refusedOnBoth({ [column]: missing }, `${column} = '${missing}'`, FOREIGN_KEY, name);
  });
});

describe("analytics_orders_cash_needed_check (plan of 6.6a, decided item 11)", () => {
  const insert = (needed: string) =>
    db.execute(sql`
      insert into analytics_orders (order_id, branch_id, status, progress, submitted_on,
        needed_by, category_id, department_id, owner_id, planned_cash, cash_handed, cash_needed)
      values (${pending.id}, ${pending.branch}, 'PENDING_HEAD', 'OPEN', '2031-10-01',
        '2031-10-20', ${pending.category}, ${pending.department}, ${pending.owner}, 50000, 0,
        ${needed})`);
  const clear = () => db.execute(sql`delete from analytics_orders where order_id = ${pending.id}`);

  it("takes a need of 0 and above", async () => {
    for (const needed of ["0", "50000"]) {
      await insert(needed);
      await clear();
    }
  });

  // Migration 0059: the need of the order Cash needed soon leaves out for lack of a price is empty
  // (review of 2.5d-c at bad1f3f, finding 1, Look first).
  it("takes an empty need (migration 0059)", async () => {
    try {
      await db.execute(sql`
        insert into analytics_orders (order_id, branch_id, status, progress, submitted_on,
          needed_by, category_id, department_id, owner_id, planned_cash, cash_handed, cash_needed)
        values (${pending.id}, ${pending.branch}, 'PENDING_HEAD', 'OPEN', '2031-10-01',
          '2031-10-20', ${pending.category}, ${pending.department}, ${pending.owner}, null, 0,
          null)`);
    } finally {
      await clear();
    }
  });

  it("refuses a need below 0, on insert and on update", async () => {
    expect(await refusalOf(insert("-1"))).toMatchObject({
      code: CHECK,
      constraint: "analytics_orders_cash_needed_check",
    });
    await insert("50000");
    try {
      expect(
        await refusalOf(
          db.execute(
            sql`update analytics_orders set cash_needed = -1 where order_id = ${pending.id}`,
          ),
        ),
      ).toMatchObject({ code: CHECK, constraint: "analytics_orders_cash_needed_check" });
    } finally {
      await clear();
    }
  });
});
