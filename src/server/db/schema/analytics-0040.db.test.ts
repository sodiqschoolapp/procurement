import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { spendingScene, stockDocument, stocked } from "../../../../tests/helpers/analytics";
import { setClock } from "../../../../tests/helpers/clock";
import { refusalOf } from "../../../../tests/helpers/database-error";

// The constraints of migration 0040_analytics_warehouse (build-plan 6.4d; plan of 6.4d, Database
// changes, and its tests line "every CHECK and FK of migration 0040 refused on insert and on
// update with nothing in front (D39), the composite branch key included"). Each forbidden write
// goes straight to the table beside the row the guard lets through (D40). developer-rules.md
// rule 5: stock and amount CHECKs, a foreign key on every relation.

const CHECK = "23514";
const FOREIGN = "23503";
const UNIQUE = "23505";
const NOWHERE = "00000000-0000-4000-8000-000000000000";

type Ids = {
  branch: string;
  variant: string;
  category: string;
  department: string;
  movement: string;
  document: string;
};
let ids: Ids;
/** A branch that is not the document's, with every other value of the row valid (D40). */
let otherBranch: string;

beforeAll(async () => {
  setClock("2031-05-15T05:00:00Z");
  const scene = await spendingScene();
  const variant = await stocked(scene, { qty: "10", unitCost: 1000n });
  const document = await stockDocument(scene, {
    type: "ISSUE",
    docDate: "2031-05-03",
    lines: [{ variantId: variant, qty: "1" }],
  });
  const movement = await db.execute<{ id: string }>(sql`
    select m.id from stock_movements m
    join stock_document_lines l on l.id = m.document_line_id
    where l.document_id = ${document}`);
  ids = {
    branch: scene.branch.id,
    variant,
    category: scene.category.id,
    department: scene.department.id,
    movement: movement.rows[0]!.id,
    document,
  };
  otherBranch = (await spendingScene()).branch.id;
});

describe("analytics_stock", () => {
  type Stock = Partial<Record<keyof Ids, string>> & {
    qty?: string;
    avg?: string;
    value?: string;
    min?: string | null;
  };
  const insert = (row: Stock = {}) =>
    db.execute(sql`
      insert into analytics_stock (branch_id, variant_id, category_id, qty, avg_cost, value,
        min_qty, low, last_moved_on)
      values (${row.branch ?? ids.branch}, ${row.variant ?? ids.variant},
        ${row.category ?? ids.category}, ${row.qty ?? "9"}, ${row.avg ?? "1000"},
        ${row.value ?? "9000"}, ${row.min === undefined ? "5" : row.min}, false, '2031-05-15')`);
  const clear = () =>
    db.execute(sql`delete from analytics_stock
                   where branch_id = ${ids.branch} and variant_id = ${ids.variant}`);

  it("takes a valid row, and one of 0 with no minimum and no movement date", async () => {
    await insert();
    await clear();
    await db.execute(sql`
      insert into analytics_stock (branch_id, variant_id, category_id, qty, avg_cost, value, low)
      values (${ids.branch}, ${ids.variant}, ${ids.category}, 0, 0, 0, false)`);
    await clear();
  });

  it.each([
    ["qty", "qty", "-0.001", "analytics_stock_qty_check"],
    ["avg", "avg_cost", "-1", "analytics_stock_avg_cost_check"],
    ["value", "value", "-1", "analytics_stock_value_check"],
    ["min", "min_qty", "0", "analytics_stock_min_qty_check"],
  ] as const)(
    "refuses %s out of range on insert and on update",
    async (field, column, bad, constraint) => {
      expect(await refusalOf(insert({ [field]: bad }))).toMatchObject({ code: CHECK, constraint });
      await insert();
      try {
        expect(
          await refusalOf(
            db.execute(sql`update analytics_stock set ${sql.identifier(column)} = ${bad}
                         where branch_id = ${ids.branch} and variant_id = ${ids.variant}`),
          ),
        ).toMatchObject({ code: CHECK, constraint });
      } finally {
        await clear();
      }
    },
  );

  it("refuses a second row of the same line", async () => {
    await insert();
    try {
      expect(await refusalOf(insert())).toMatchObject({
        code: UNIQUE,
        constraint: "analytics_stock_pkey",
      });
    } finally {
      await clear();
    }
  });

  it("refuses a line that is not a stock balance (another branch's), on insert and on update", async () => {
    const refused = await refusalOf(insert({ branch: otherBranch }));
    expect(refused).toMatchObject({ code: FOREIGN, constraint: "analytics_stock_balance_fk" });
    await insert();
    try {
      expect(
        await refusalOf(
          db.execute(sql`update analytics_stock set branch_id = ${otherBranch}
                         where branch_id = ${ids.branch} and variant_id = ${ids.variant}`),
        ),
      ).toMatchObject({ code: FOREIGN, constraint: "analytics_stock_balance_fk" });
    } finally {
      await clear();
    }
  });

  it.each([
    ["branch", "analytics_stock_branch_id_branches_id_fk"],
    ["variant", "analytics_stock_variant_id_product_variants_id_fk"],
    ["category", "analytics_stock_category_id_categories_id_fk"],
  ] as const)("refuses an unknown %s", async (column, constraint) => {
    expect(await refusalOf(insert({ [column]: NOWHERE }))).toMatchObject({
      code: FOREIGN,
      constraint,
    });
  });
});

describe("analytics_stock_moves", () => {
  type Moved = Partial<Record<keyof Ids, string>> & {
    type?: string;
    noDepartment?: boolean;
    qty?: string;
    value?: string;
  };
  const insert = (row: Moved = {}) =>
    db.execute(sql`
      insert into analytics_stock_moves (movement_id, document_id, branch_id, department_id,
        category_id, variant_id, type, moved_on, qty, value)
      values (${row.movement ?? ids.movement}, ${row.document ?? ids.document},
        ${row.branch ?? ids.branch},
        ${row.noDepartment ? null : (row.department ?? ids.department)},
        ${row.category ?? ids.category}, ${row.variant ?? ids.variant},
        ${row.type ?? "ISSUE"}::stock_movement_type, '2031-05-03', ${row.qty ?? "1"},
        ${row.value ?? "1000"})`);
  const clear = () =>
    db.execute(sql`delete from analytics_stock_moves where movement_id = ${ids.movement}`);
  const update = (set: ReturnType<typeof sql>) =>
    db.execute(sql`update analytics_stock_moves set ${set} where movement_id = ${ids.movement}`);

  it("takes a valid issue, and a write-off with no department", async () => {
    await insert();
    await clear();
    await insert({ type: "WRITE_OFF", noDepartment: true });
    await clear();
  });

  it.each(["RECEIPT", "TRANSFER_OUT", "CORRECTION", "REVERSAL"])(
    "refuses a %s movement on insert and on update",
    async (type) => {
      expect(await refusalOf(insert({ type, noDepartment: true }))).toMatchObject({
        code: CHECK,
        constraint: "analytics_stock_moves_type_check",
      });
      await insert({ type: "WRITE_OFF", noDepartment: true });
      try {
        expect(await refusalOf(update(sql`type = ${type}::stock_movement_type`))).toMatchObject({
          code: CHECK,
          constraint: "analytics_stock_moves_type_check",
        });
      } finally {
        await clear();
      }
    },
  );

  it("refuses an issue or return without a department and a write-off with one, on insert and on update", async () => {
    for (const type of ["ISSUE", "RETURN"]) {
      expect(await refusalOf(insert({ type, noDepartment: true }))).toMatchObject({
        code: CHECK,
        constraint: "analytics_stock_moves_department_check",
      });
    }
    expect(await refusalOf(insert({ type: "WRITE_OFF" }))).toMatchObject({
      code: CHECK,
      constraint: "analytics_stock_moves_department_check",
    });
    await insert();
    try {
      expect(await refusalOf(update(sql`department_id = null`))).toMatchObject({
        code: CHECK,
        constraint: "analytics_stock_moves_department_check",
      });
      expect(await refusalOf(update(sql`type = 'WRITE_OFF'`))).toMatchObject({
        code: CHECK,
        constraint: "analytics_stock_moves_department_check",
      });
    } finally {
      await clear();
    }
  });

  it.each([
    ["qty", "0", "analytics_stock_moves_qty_check"],
    ["value", "-1", "analytics_stock_moves_value_check"],
  ] as const)(
    "refuses %s out of range on insert and on update",
    async (column, bad, constraint) => {
      expect(await refusalOf(insert({ [column]: bad }))).toMatchObject({ code: CHECK, constraint });
      await insert();
      try {
        expect(await refusalOf(update(sql`${sql.identifier(column)} = ${bad}`))).toMatchObject({
          code: CHECK,
          constraint,
        });
      } finally {
        await clear();
      }
    },
  );

  it.each([
    ["movement", "analytics_stock_moves_movement_id_stock_movements_id_fk"],
    ["department", "analytics_stock_moves_department_id_departments_id_fk"],
    ["category", "analytics_stock_moves_category_id_categories_id_fk"],
    ["variant", "analytics_stock_moves_variant_id_product_variants_id_fk"],
    ["document", "analytics_stock_moves_document_id_stock_documents_id_fk"],
    ["branch", "analytics_stock_moves_branch_id_branches_id_fk"],
  ] as const)("refuses an unknown %s", async (column, constraint) => {
    expect(await refusalOf(insert({ [column]: NOWHERE }))).toMatchObject({
      code: FOREIGN,
      constraint,
    });
  });

  it("refuses a branch that is not its document's, on insert and on update (as 6.4c's order key)", async () => {
    expect(await refusalOf(insert({ branch: otherBranch }))).toMatchObject({
      code: FOREIGN,
      constraint: "analytics_stock_moves_document_branch_fk",
    });
    await insert();
    try {
      expect(await refusalOf(update(sql`branch_id = ${otherBranch}`))).toMatchObject({
        code: FOREIGN,
        constraint: "analytics_stock_moves_document_branch_fk",
      });
    } finally {
      await clear();
    }
  });
});
