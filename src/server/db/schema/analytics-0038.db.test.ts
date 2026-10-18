import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { bought, decided, spendingScene } from "../../../../tests/helpers/analytics";
import { refusalOf } from "../../../../tests/helpers/database-error";

// The constraints of migration 0038_analytics_prices_steps (build-plan 6.4b; plan of 6.4b,
// Database changes, and its tests line "every CHECK and FK of migration 0038 refused on insert and
// update with nothing in front (D39), the all-null-or-all-set CHECK in each half-filled case").
// Each forbidden write goes straight to the table beside the row the guard lets through (D40).
// developer-rules.md rule 5: amount CHECKs, enums, a foreign key on every relation.

const CHECK = "23514";
const FOREIGN = "23503";
const NOT_NULL = "23502";
const ENUM = "22P02";
const NOWHERE = "00000000-0000-4000-8000-000000000000";

type Ids = {
  order: string;
  branch: string;
  category: string;
  department: string;
  owner: string;
  purchase: string;
};
let ids: Ids;

beforeAll(async () => {
  const scene = await spendingScene();
  const record = await bought(scene, { purchasedOn: "2031-05-02" });
  ids = {
    order: record.orderId,
    branch: scene.branch.id,
    category: scene.category.id,
    department: scene.department.id,
    owner: scene.manager.id,
    purchase: record.purchaseId,
  };
});

describe("analytics_spending, the columns of 6.4b", () => {
  type Spending = { variant: string; qty: string; unitPrice: string; goods: string };
  const valid = (): Spending => ({
    variant: `(select variant_id from purchases where id = '${ids.purchase}')`,
    qty: "1",
    unitPrice: "0",
    goods: "0",
  });
  const insert = (row: Spending) =>
    db.execute(sql`
      insert into analytics_spending (purchase_id, order_id, branch_id, purchased_on,
        category_id, department_id, owner_id, amount, variant_id, qty, unit_price, goods,
        created_at)
      values (${ids.purchase}, ${ids.order}, ${ids.branch}, '2031-05-02', ${ids.category},
        ${ids.department}, ${ids.owner}, 0, ${sql.raw(row.variant)}, ${row.qty},
        ${row.unitPrice}, ${row.goods}, '2031-05-02T05:00:00Z')`);

  it("takes a valid row (a gift: price 0, goods 0)", async () => {
    await insert(valid());
    await db.execute(sql`delete from analytics_spending where purchase_id = ${ids.purchase}`);
  });

  it.each([
    ["qty", { qty: "0" }, "analytics_spending_qty_check"],
    ["unit_price", { unitPrice: "-1" }, "analytics_spending_unit_price_check"],
    ["goods", { goods: "-1" }, "analytics_spending_goods_check"],
  ])("refuses on insert a %s out of range", async (_, change, constraint) => {
    expect(await refusalOf(insert({ ...valid(), ...change }))).toMatchObject({
      code: CHECK,
      constraint,
    });
  });

  it("refuses an unknown subtype and a missing column", async () => {
    expect(await refusalOf(insert({ ...valid(), variant: `'${NOWHERE}'` }))).toMatchObject({
      code: FOREIGN,
      constraint: "analytics_spending_variant_id_product_variants_id_fk",
    });
    expect(
      await refusalOf(
        db.execute(sql`insert into analytics_spending (purchase_id, order_id, branch_id,
          purchased_on, category_id, department_id, owner_id, amount)
          values (${ids.purchase}, ${ids.order}, ${ids.branch}, '2031-05-02', ${ids.category},
            ${ids.department}, ${ids.owner}, 0)`),
      ),
    ).toMatchObject({ code: NOT_NULL });
  });

  it.each([
    ["qty = 0", "analytics_spending_qty_check"],
    ["unit_price = -1", "analytics_spending_unit_price_check"],
    ["goods = -1", "analytics_spending_goods_check"],
  ])("refuses on update %s", async (set, constraint) => {
    await insert(valid());
    try {
      expect(
        await refusalOf(
          db.execute(
            sql`update analytics_spending set ${sql.raw(set)} where purchase_id = ${ids.purchase}`,
          ),
        ),
      ).toMatchObject({ code: CHECK, constraint });
    } finally {
      await db.execute(sql`delete from analytics_spending where purchase_id = ${ids.purchase}`);
    }
  });
});

describe("analytics_steps", () => {
  type Step = {
    order?: string;
    branch?: string;
    category?: string;
    department?: string;
    owner?: string;
    step?: string;
    enteredAt?: string;
    leftAt?: string | null;
    leftOn?: string | null;
    seconds?: string | null;
    decision?: string | null;
    reason?: string | null;
    reasonKey?: string | null;
    decidedBy?: string | null;
  };
  // A decided stay names its decider since migration 0041 (plan of 6.5a, decided item 3).
  const decidedRow: Step = {
    leftAt: "2031-05-02T06:00:00Z",
    leftOn: "2031-05-02",
    seconds: "3600",
    decision: "SEND_BACK",
    reason: "Narxni tekshiring",
    reasonKey: "narxni tekshiring",
    decidedBy: "owner",
  };
  const openRow: Step = {
    leftAt: null,
    leftOn: null,
    seconds: null,
    decision: null,
    reason: null,
    reasonKey: null,
  };
  let entered = 0;
  const insert = (row: Step) => {
    // Each insert its own stay, so a valid one never collides with the next case's key.
    entered += 1;
    const enteredAt = row.enteredAt ?? new Date(Date.UTC(2031, 4, 2, 5, 0, entered)).toISOString();
    return db.execute(sql`
      insert into analytics_steps (order_id, branch_id, step, entered_at, left_at, left_on,
        seconds, decision, reason, reason_key, decided_by, category_id, department_id, owner_id)
      values (${row.order ?? ids.order}, ${row.branch ?? ids.branch},
        ${row.step ?? "PENDING_HEAD"}, ${enteredAt}, ${row.leftAt ?? null}, ${row.leftOn ?? null},
        ${row.seconds ?? null}, ${row.decision ?? null}, ${row.reason ?? null},
        ${row.reasonKey ?? null}, ${row.decidedBy === "owner" ? ids.owner : (row.decidedBy ?? null)},
        ${row.category ?? ids.category},
        ${row.department ?? ids.department}, ${row.owner ?? ids.owner})`);
  };

  it("takes a decided send back, a decided approve and an open stay", async () => {
    await insert(decidedRow);
    await insert({ ...decidedRow, decision: "APPROVE", reason: null, reasonKey: null });
    await insert({ ...openRow, step: "PENDING_FINANCE" });
  });

  it("refuses a step that is not an approval step, and an unknown status", async () => {
    expect(await refusalOf(insert({ ...openRow, step: "RETURNED" }))).toMatchObject({
      code: CHECK,
      constraint: "analytics_steps_step_check",
    });
    expect(await refusalOf(insert({ ...openRow, step: "WAITING" }))).toMatchObject({ code: ENUM });
  });

  it("refuses a decision that is not the step approver's", async () => {
    expect(
      await refusalOf(insert({ ...decidedRow, decision: "CANCEL", reason: null, reasonKey: null })),
    ).toMatchObject({ code: CHECK, constraint: "analytics_steps_decision_check" });
  });

  it.each([
    ["left_at alone", { ...openRow, leftAt: "2031-05-02T06:00:00Z" }],
    ["left_on alone", { ...openRow, leftOn: "2031-05-02" }],
    ["seconds alone", { ...openRow, seconds: "60" }],
    ["decision alone", { ...openRow, decision: "APPROVE" }],
    ["no left_at", { ...decidedRow, leftAt: null }],
    ["no left_on", { ...decidedRow, leftOn: null }],
    ["no seconds", { ...decidedRow, seconds: null }],
    ["no decision", { ...decidedRow, decision: null, reason: null, reasonKey: null }],
    ["an end before the start", { ...decidedRow, enteredAt: "2031-05-02T07:00:00Z" }],
    ["negative seconds", { ...decidedRow, seconds: "-1" }],
  ])("refuses a half-filled or impossible end: %s", async (_, row) => {
    expect(await refusalOf(insert(row))).toMatchObject({
      code: CHECK,
      constraint: "analytics_steps_left_check",
    });
  });

  it.each([
    ["a send back without a reason", { ...decidedRow, reason: null }],
    ["a reject without a reason key", { ...decidedRow, decision: "REJECT", reasonKey: null }],
    ["an approve with a reason", { ...decidedRow, decision: "APPROVE", reasonKey: null }],
    ["an open stay with a reason key", { ...openRow, reasonKey: "x" }],
  ])("refuses %s", async (_, row) => {
    expect(await refusalOf(insert(row))).toMatchObject({
      code: CHECK,
      constraint: "analytics_steps_reason_check",
    });
  });

  it.each([
    ["order", "analytics_steps_order_id_orders_id_fk"],
    ["branch", "analytics_steps_branch_id_branches_id_fk"],
    ["category", "analytics_steps_category_id_categories_id_fk"],
    ["department", "analytics_steps_department_id_departments_id_fk"],
    ["owner", "analytics_steps_owner_id_users_id_fk"],
  ] as const)("refuses an unknown %s", async (column, constraint) => {
    expect(await refusalOf(insert({ ...openRow, [column]: NOWHERE }))).toMatchObject({
      code: FOREIGN,
      constraint,
    });
  });

  it.each([
    ["step = 'RETURNED'", "analytics_steps_step_check"],
    ["decision = 'CANCEL', reason = null, reason_key = null", "analytics_steps_decision_check"],
    ["left_at = null", "analytics_steps_left_check"],
    ["seconds = -1", "analytics_steps_left_check"],
    ["reason = null", "analytics_steps_reason_check"],
  ])("refuses on update %s", async (set, constraint) => {
    const scene = await spendingScene(ids.branch);
    const order = await decided(scene, "RETURNED", []);
    await insert({ ...decidedRow, order: order.id });
    expect(
      await refusalOf(
        db.execute(sql`update analytics_steps set ${sql.raw(set)} where order_id = ${order.id}`),
      ),
    ).toMatchObject({ code: CHECK, constraint });
  });
});
