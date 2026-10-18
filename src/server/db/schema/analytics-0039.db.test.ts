import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { bought, spendingScene } from "../../../../tests/helpers/analytics";
import { refusalOf } from "../../../../tests/helpers/database-error";

// The constraints of migration 0039_analytics_managers (build-plan 6.4c; plan of 6.4c, Database
// changes, and its tests line "every CHECK and FK of migration 0039 refused on insert and on
// update with nothing in front (D39)"). Each forbidden write goes straight to the table beside the
// row the guard lets through (D40). developer-rules.md rule 5: amount CHECKs, a foreign key on
// every relation.

const CHECK = "23514";
const FOREIGN = "23503";
const NOWHERE = "00000000-0000-4000-8000-000000000000";

type Ids = {
  order: string;
  branch: string;
  category: string;
  department: string;
  owner: string;
  supplier: string;
  purchase: string;
};
let ids: Ids;

beforeAll(async () => {
  const scene = await spendingScene();
  const record = await bought(scene, { purchasedOn: "2031-05-02", cancelled: true });
  ids = {
    order: record.orderId,
    branch: scene.branch.id,
    category: scene.category.id,
    department: scene.department.id,
    owner: scene.manager.id,
    supplier: scene.supplier.id,
    purchase: record.purchaseId,
  };
});

describe("analytics_cancelled", () => {
  type Cancelled = Partial<Record<keyof Ids, string>> & { amount?: string };
  const insert = (row: Cancelled = {}) =>
    db.execute(sql`
      insert into analytics_cancelled (purchase_id, order_id, branch_id, cancelled_on,
        category_id, department_id, owner_id, supplier_id, amount)
      values (${row.purchase ?? ids.purchase}, ${row.order ?? ids.order},
        ${row.branch ?? ids.branch}, '2031-05-02', ${row.category ?? ids.category},
        ${row.department ?? ids.department}, ${row.owner ?? ids.owner},
        ${row.supplier ?? ids.supplier}, ${row.amount ?? "0"})`);
  const clear = () =>
    db.execute(sql`delete from analytics_cancelled where purchase_id = ${ids.purchase}`);

  it("takes a valid row (a gift: amount 0)", async () => {
    await insert();
    await clear();
  });

  it("refuses an amount below 0 on insert and on update", async () => {
    expect(await refusalOf(insert({ amount: "-1" }))).toMatchObject({
      code: CHECK,
      constraint: "analytics_cancelled_amount_check",
    });
    await insert();
    try {
      expect(
        await refusalOf(
          db.execute(
            sql`update analytics_cancelled set amount = -1 where purchase_id = ${ids.purchase}`,
          ),
        ),
      ).toMatchObject({ code: CHECK, constraint: "analytics_cancelled_amount_check" });
    } finally {
      await clear();
    }
  });

  it.each([
    ["purchase", "analytics_cancelled_purchase_id_purchases_id_fk"],
    ["order", "analytics_cancelled_order_id_orders_id_fk"],
    ["branch", "analytics_cancelled_branch_id_branches_id_fk"],
    ["category", "analytics_cancelled_category_id_categories_id_fk"],
    ["department", "analytics_cancelled_department_id_departments_id_fk"],
    ["owner", "analytics_cancelled_owner_id_users_id_fk"],
    ["supplier", "analytics_cancelled_supplier_id_companies_id_fk"],
  ] as const)("refuses an unknown %s", async (column, constraint) => {
    expect(await refusalOf(insert({ [column]: NOWHERE }))).toMatchObject({
      code: FOREIGN,
      constraint,
    });
  });
});

describe("analytics_cash", () => {
  type Cash = Partial<Record<keyof Ids, string>> & { count?: string };
  const insert = (row: Cash = {}) =>
    db.execute(sql`
      insert into analytics_cash (order_id, branch_id, owner_id, category_id, department_id,
        cash_count, since)
      values (${row.order ?? ids.order}, ${row.branch ?? ids.branch}, ${row.owner ?? ids.owner},
        ${row.category ?? ids.category}, ${row.department ?? ids.department},
        ${row.count ?? "1"}, '2031-05-02')`);
  const clear = () => db.execute(sql`delete from analytics_cash where order_id = ${ids.order}`);

  it("takes a count above 0 and one below 0 (held and owed, 08 Money ledger)", async () => {
    await insert({ count: "50000" });
    await clear();
    await insert({ count: "-25000" });
    await clear();
  });

  it("refuses a count of 0 on insert and on update", async () => {
    expect(await refusalOf(insert({ count: "0" }))).toMatchObject({
      code: CHECK,
      constraint: "analytics_cash_cash_count_check",
    });
    await insert();
    try {
      expect(
        await refusalOf(
          db.execute(sql`update analytics_cash set cash_count = 0 where order_id = ${ids.order}`),
        ),
      ).toMatchObject({ code: CHECK, constraint: "analytics_cash_cash_count_check" });
    } finally {
      await clear();
    }
  });

  it.each([
    ["order", "analytics_cash_order_id_orders_id_fk"],
    ["branch", "analytics_cash_branch_id_branches_id_fk"],
    ["owner", "analytics_cash_owner_id_users_id_fk"],
    ["category", "analytics_cash_category_id_categories_id_fk"],
    ["department", "analytics_cash_department_id_departments_id_fk"],
  ] as const)("refuses an unknown %s", async (column, constraint) => {
    expect(await refusalOf(insert({ [column]: NOWHERE }))).toMatchObject({
      code: FOREIGN,
      constraint,
    });
  });
});
