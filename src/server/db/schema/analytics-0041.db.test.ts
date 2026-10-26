import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { decided, spendingScene } from "../../../../tests/helpers/analytics";
import { refusalOf } from "../../../../tests/helpers/database-error";
import { insertDepartment } from "../../../../tests/helpers/orders";

// The constraints of migration 0041_analytics_principal (build-plan 6.5a; plan of 6.5a, Database
// changes, and its tests line: the PK, each FK, the composite (order_id, branch_id) and
// (department_id, branch_id) keys, the NOT NULLs of needed_by and submitted_on and the
// status <> 'DRAFT' CHECK of analytics_orders, and both branches of the decided_by part of the
// steps' left check; review of the plan, correction 3). Each forbidden write goes straight to the
// table beside the row the guard lets through (D39, D40). developer-rules.md rule 5.

const CHECK = "23514";
const FOREIGN = "23503";
const UNIQUE = "23505";
const NOT_NULL = "23502";
const NOWHERE = "00000000-0000-4000-8000-000000000000";

type Ids = {
  order: string;
  branch: string;
  category: string;
  department: string;
  owner: string;
};
let ids: Ids;
/** A branch and a department that are not the order's, every other value valid (D40). */
let otherBranch: string;
let otherDepartment: string;

beforeAll(async () => {
  const scene = await spendingScene();
  const order = await decided(scene, "PENDING_HEAD", []);
  ids = {
    order: order.id,
    branch: scene.branch.id,
    category: scene.category.id,
    department: scene.department.id,
    owner: scene.manager.id,
  };
  otherBranch = (await spendingScene()).branch.id;
  otherDepartment = (await insertDepartment(otherBranch)).id;
});

describe("analytics_orders", () => {
  type Row = Partial<Record<keyof Ids, string>> & {
    status?: string;
    submittedOn?: string | null;
    neededBy?: string | null;
  };
  const insert = (row: Row = {}) =>
    db.execute(sql`
      insert into analytics_orders (order_id, branch_id, status, progress, submitted_on,
        needed_by, category_id, department_id, owner_id, planned_cash, cash_handed, cash_needed)
      values (${row.order ?? ids.order}, ${row.branch ?? ids.branch},
        ${row.status ?? "PENDING_HEAD"}, 'OPEN',
        ${row.submittedOn === undefined ? "2031-05-02" : row.submittedOn},
        ${row.neededBy === undefined ? "2031-05-10" : row.neededBy},
        ${row.category ?? ids.category}, ${row.department ?? ids.department},
        ${row.owner ?? ids.owner}, 0, 0, 0)`);
  const clear = () => db.execute(sql`delete from analytics_orders where order_id = ${ids.order}`);
  const updated = async (set: string) => {
    await insert();
    try {
      return await refusalOf(
        db.execute(sql`update analytics_orders set ${sql.raw(set)} where order_id = ${ids.order}`),
      );
    } finally {
      await clear();
    }
  };

  it("takes a valid row of every status but Draft", async () => {
    for (const status of ["PENDING_HEAD", "RETURNED", "PURCHASING", "CLOSED", "CANCELLED"]) {
      await insert({ status });
      await clear();
    }
  });

  it("refuses a Draft, on insert and on update", async () => {
    expect(await refusalOf(insert({ status: "DRAFT" }))).toMatchObject({
      code: CHECK,
      constraint: "analytics_orders_status_check",
    });
    expect(await updated("status = 'DRAFT'")).toMatchObject({
      code: CHECK,
      constraint: "analytics_orders_status_check",
    });
  });

  it("refuses no submitted_on, on insert and on update", async () => {
    expect(await refusalOf(insert({ submittedOn: null }))).toMatchObject({
      code: NOT_NULL,
      column: "submitted_on",
    });
    expect(await updated("submitted_on = null")).toMatchObject({
      code: NOT_NULL,
      column: "submitted_on",
    });
  });

  // Since 0056 an order may have no needed-by date and no department (05 Fields the Head sets 3;
  // D67, a changed requirement: this test refused an empty needed_by before; plan of 2.5d).
  it("takes a row without a needed-by date or a department", async () => {
    await insert({ neededBy: null });
    await clear();
    await insert();
    await db.execute(
      sql`update analytics_orders set department_id = null where order_id = ${ids.order}`,
    );
    await clear();
  });

  it("refuses a second row of the same order", async () => {
    await insert();
    try {
      expect(await refusalOf(insert())).toMatchObject({
        code: UNIQUE,
        constraint: "analytics_orders_pkey",
      });
    } finally {
      await clear();
    }
  });

  it("refuses another branch than the order's, on insert and on update", async () => {
    // The order's department is not of the other branch either: the department key would refuse
    // too, so the department given is the other branch's own (D40).
    expect(
      await refusalOf(insert({ branch: otherBranch, department: otherDepartment })),
    ).toMatchObject({ code: FOREIGN, constraint: "analytics_orders_order_branch_fk" });
    expect(
      await updated(`branch_id = '${otherBranch}', department_id = '${otherDepartment}'`),
    ).toMatchObject({ code: FOREIGN, constraint: "analytics_orders_order_branch_fk" });
  });

  it("refuses a department of another branch, on insert and on update", async () => {
    expect(await refusalOf(insert({ department: otherDepartment }))).toMatchObject({
      code: FOREIGN,
      constraint: "analytics_orders_department_branch_fk",
    });
    expect(await updated(`department_id = '${otherDepartment}'`)).toMatchObject({
      code: FOREIGN,
      constraint: "analytics_orders_department_branch_fk",
    });
  });

  it.each([
    ["order", "analytics_orders_order_id_orders_id_fk"],
    ["category", "analytics_orders_category_id_categories_id_fk"],
    ["owner", "analytics_orders_owner_id_users_id_fk"],
  ] as const)("refuses an unknown %s", async (column, constraint) => {
    expect(await refusalOf(insert({ [column]: NOWHERE }))).toMatchObject({
      code: FOREIGN,
      constraint,
    });
  });

  // An unknown branch or department also fails the composite keys; its own key fires first.
  it.each([
    ["branch", "analytics_orders_branch_id_branches_id_fk"],
    ["department", "analytics_orders_department_id_departments_id_fk"],
  ] as const)("refuses an unknown %s", async (column, constraint) => {
    expect(await refusalOf(insert({ [column]: NOWHERE }))).toMatchObject({
      code: FOREIGN,
      constraint,
    });
  });
});

describe("analytics_steps.decided_by", () => {
  let entered = 0;
  const insert = (decided: boolean, decidedBy: string | null) => {
    entered += 1;
    const enteredAt = new Date(Date.UTC(2031, 4, 2, 5, 0, entered)).toISOString();
    return db.execute(sql`
      insert into analytics_steps (order_id, branch_id, step, entered_at, left_at, left_on,
        seconds, decision, decided_by, category_id, department_id, owner_id)
      values (${ids.order}, ${ids.branch}, 'PENDING_HEAD', ${enteredAt},
        ${decided ? "2031-05-02T07:00:00Z" : null}, ${decided ? "2031-05-02" : null},
        ${decided ? "3600" : null}, ${decided ? "APPROVE" : null}, ${decidedBy},
        ${ids.category}, ${ids.department}, ${ids.owner})`);
  };

  it("takes a decided stay with its decider and an open stay without one", async () => {
    await insert(true, ids.owner);
    await insert(false, null);
  });

  it("refuses a decided stay without a decider and an open stay with one", async () => {
    for (const [isDecided, by] of [
      [true, null],
      [false, ids.owner],
    ] as const) {
      expect(await refusalOf(insert(isDecided, by))).toMatchObject({
        code: CHECK,
        constraint: "analytics_steps_left_check",
      });
    }
  });

  it("refuses on update a decided stay's decider cleared", async () => {
    await insert(true, ids.owner);
    expect(
      await refusalOf(
        db.execute(sql`update analytics_steps set decided_by = null
                       where order_id = ${ids.order} and decided_by is not null`),
      ),
    ).toMatchObject({ code: CHECK, constraint: "analytics_steps_left_check" });
  });

  it("refuses an unknown decider", async () => {
    expect(await refusalOf(insert(true, NOWHERE))).toMatchObject({
      code: FOREIGN,
      constraint: "analytics_steps_decided_by_users_id_fk",
    });
  });
});
