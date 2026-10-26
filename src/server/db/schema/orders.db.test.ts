import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertFileRow, insertProduct } from "../../../../tests/helpers/catalog";
import { refusalOf } from "../../../../tests/helpers/database-error";
import {
  insertDepartment,
  insertOrder,
  insertOrderExtra,
  inventedNumber,
  setOrderStatus,
} from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";

// The constraints and triggers of migration 0019_orders (build plan 2.4, Done when; plan of 2.4,
// Tests). Each forbidden write goes straight to the table with nothing in front (D39) and stands
// beside the write the guard must let through (D40). Spec: 14-data-model.md (Orders; Warehouse);
// developer-rules.md rules 5, 6, 7, 11 and "Constraints the spec names"; 05-order-request-form.md
// (Order; Drafts 2; Order number); 06-approval-workflow.md rules 1 and 6.

const AT = "2031-04-11T05:00:00Z";
const CHECK = "23514";
const UNIQUE = "23505";
const FOREIGN = "23503";
const NOT_NULL = "23502";
const BAD_ENUM = "22P02";

let branchId: string;
let otherBranchId: string;
let ownerId: string;

beforeAll(async () => {
  branchId = (await insertBranch()).id;
  otherBranchId = (await insertBranch()).id;
  ownerId = (await insertUser("MANAGER", { branches: [branchId] })).id;
});

const order = (row: Partial<Parameters<typeof insertOrder>[0]> = {}) =>
  insertOrder({ branchId, ownerId, ...row });

function setColumn(table: string, id: string, column: string, value: unknown) {
  return db.execute(
    sql`update ${sql.identifier(table)} set ${sql.identifier(column)} = ${value} where id = ${id}`,
  );
}

describe("orders: numbers (05 Order number; developer-rules rule 5)", () => {
  it("a duplicate number is refused; another number passes", async () => {
    const first = await order({ status: "PENDING_HEAD" });
    expect(await refusalOf(order({ status: "PENDING_HEAD", number: first.number }))).toMatchObject({
      code: UNIQUE,
      constraint: "orders_number_key",
    });
    await order({ status: "PENDING_HEAD", number: inventedNumber() });
  });

  it("a number of the wrong form is refused; five counter digits pass (05 Order number 2)", async () => {
    for (const number of ["chl-26-0001", "CHL-2026-0001", "CHL-26-001", "CHLAB-26-0001"]) {
      expect(await refusalOf(order({ status: "PENDING_HEAD", number }))).toMatchObject({
        code: CHECK,
        constraint: "orders_number_check",
      });
    }
    await order({ status: "PENDING_HEAD", number: "XX-26-10000" });
  });

  it("only a draft is without a number; a numbered draft (taken back) passes", async () => {
    expect(await refusalOf(order({ status: "PENDING_HEAD", number: null }))).toMatchObject({
      code: CHECK,
      constraint: "orders_number_status_check",
    });
    await order({ status: "DRAFT", number: inventedNumber() });
  });

  it("a number never changes, also not back to empty (05 Order number 3)", async () => {
    const draft = await order();
    await setColumn("orders", draft.id, "number", inventedNumber());
    const submitted = await order({ status: "PENDING_HEAD" });
    for (const value of [inventedNumber(), null]) {
      expect(await refusalOf(setColumn("orders", submitted.id, "number", value))).toMatchObject({
        code: CHECK,
        constraint: "orders_number_fixed",
      });
    }
  });
});

describe("orders: enums and amounts (developer-rules rules 5 and 6)", () => {
  it("an unknown status, payment type, priority or progress is refused", async () => {
    const draft = await order();
    for (const [column, value] of [
      ["status", "FOO"],
      ["payment_type", "CHEQUE"],
      ["priority", "LOW"],
      ["progress", "HALF"],
    ] as const) {
      expect(await refusalOf(setColumn("orders", draft.id, column, value))).toMatchObject({
        code: BAD_ENUM,
      });
    }
    await setColumn("orders", draft.id, "payment_type", "CARD");
  });

  it("each amount and counter is refused at its bound and passes at the allowed side", async () => {
    const draft = await order();
    const cases: [string, unknown, unknown][] = [
      ["planned_qty", "0", "0.001"],
      ["planned_price", 0, 1],
      // 0.001 × 400 so'm rounds to 0 (review of the plan of 2.4, correction 1).
      ["planned_total", -1, 0],
      ["actual_total", -1, 0],
      ["stock_at_submit", "-0.001", "0"],
      ["revision", 0, 1],
      ["version", 0, 1],
      ["comment", "x".repeat(1001), "x".repeat(1000)],
    ];
    for (const [column, refused, allowed] of cases) {
      expect(await refusalOf(setColumn("orders", draft.id, column, refused)), column).toMatchObject(
        { code: CHECK, constraint: `orders_${column}_check` },
      );
      await setColumn("orders", draft.id, column, allowed);
    }
  });
});

// Since 0056 (D67, a requirement changed: 05 Fields the Head sets 3) a submitted order may lack a
// department, a needed-by date, or a planned price with its total; those cases are in
// orders-fields-0056.db.test.ts (plan of 2.5d, Look first).
describe("orders: a submitted order is complete (05 Checks at submit; plan decision 14)", () => {
  const REQUIRED = ["variant_id", "planned_qty", "submitted_at"];

  it("each required column empty outside DRAFT is refused; empty on a draft passes", async () => {
    for (const column of REQUIRED) {
      const draft = await order();
      await setColumn("orders", draft.id, column, null);
      expect(
        await refusalOf(setColumn("orders", draft.id, "status", "PENDING_HEAD")),
        column,
      ).toMatchObject({ code: CHECK });
      await setColumn("orders", draft.id, "number", inventedNumber());
      expect(
        await refusalOf(setColumn("orders", draft.id, "status", "PENDING_HEAD")),
        column,
      ).toMatchObject({ code: CHECK, constraint: "orders_submitted_plan_check" });
    }
    // The complete plan with its number and submit time passes.
    const complete = await order({ number: inventedNumber() });
    await db.execute(
      sql`update orders set status = 'PENDING_HEAD', submitted_at = ${AT} where id = ${complete.id}`,
    );
  });

  it("Urgent without a reason is refused outside DRAFT; on a draft and with a reason it passes", async () => {
    expect(
      await refusalOf(order({ status: "PENDING_HEAD", priority: "URGENT", urgentReason: " " })),
    ).toMatchObject({ code: CHECK, constraint: "orders_urgent_reason_check" });
    await order({ status: "DRAFT", priority: "URGENT" });
    await order({ status: "PENDING_HEAD", priority: "URGENT", urgentReason: "Dars ertaga" });

    // On update: an Urgent draft without a reason, numbered and complete, cannot leave DRAFT.
    const draft = await order({ priority: "URGENT", number: inventedNumber() });
    await setColumn("orders", draft.id, "submitted_at", AT);
    expect(await refusalOf(setColumn("orders", draft.id, "status", "PENDING_HEAD"))).toMatchObject({
      code: CHECK,
      constraint: "orders_urgent_reason_check",
    });
    await setColumn("orders", draft.id, "urgent_reason", "Dars ertaga");
    await setColumn("orders", draft.id, "status", "PENDING_HEAD");
  });
});

describe("orders: one never-submitted draft per owner, branch, subtype and department (05 Drafts 2)", () => {
  it("a second such draft is refused on insert and on update", async () => {
    const first = await order();
    const same = { variantId: first.variantId, departmentId: first.departmentId };
    expect(await refusalOf(order(same))).toMatchObject({
      code: UNIQUE,
      constraint: "orders_one_draft_key",
    });
    const other = await order({ variantId: first.variantId });
    expect(
      await refusalOf(setColumn("orders", other.id, "department_id", first.departmentId)),
    ).toMatchObject({ code: UNIQUE, constraint: "orders_one_draft_key" });
  });

  it("another department or another owner of the same subtype passes", async () => {
    const first = await order();
    await order({ variantId: first.variantId });
    const colleague = await insertUser("MANAGER", { branches: [branchId] });
    await order({
      ownerId: colleague.id,
      variantId: first.variantId,
      departmentId: first.departmentId,
    });
  });

  it("an order taken back to Draft beside such a draft is allowed (decisions 2.3 no. 1)", async () => {
    const draft = await order();
    const submitted = await order({
      status: "PENDING_HEAD",
      variantId: draft.variantId,
      departmentId: draft.departmentId,
    });
    await setOrderStatus(submitted.id, "DRAFT");
    const rows = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from orders where variant_id = ${draft.variantId} and status = 'DRAFT'`,
    );
    expect(rows.rows[0]!.count).toBe(2);
  });
});

describe("orders: the department is of the order's branch (A6; plan decision 3)", () => {
  it("a department of another branch is refused on insert and update; of its own branch passes", async () => {
    const foreign = await insertDepartment(otherBranchId);
    expect(await refusalOf(order({ departmentId: foreign.id }))).toMatchObject({
      code: FOREIGN,
      constraint: "orders_department_branch_fk",
    });
    const draft = await order();
    expect(
      await refusalOf(setColumn("orders", draft.id, "department_id", foreign.id)),
    ).toMatchObject({ code: FOREIGN, constraint: "orders_department_branch_fk" });
    await setColumn("orders", draft.id, "department_id", (await insertDepartment(branchId)).id);
  });

  it("each foreign key of orders is refused with an unknown id", async () => {
    const draft = await order();
    for (const column of [
      "branch_id",
      "owner_id",
      "created_by",
      "variant_id",
      "company_id",
      "reference_photo_file_id",
    ]) {
      expect(
        await refusalOf(setColumn("orders", draft.id, column, randomUUID())),
        column,
      ).toMatchObject({ code: FOREIGN });
    }
  });

  it("a photo is held by one order (decisions 0.12 no. 5)", async () => {
    const file = await insertFileRow(ownerId);
    const first = await order();
    await setColumn("orders", first.id, "reference_photo_file_id", file.id);
    const second = await order();
    expect(
      await refusalOf(setColumn("orders", second.id, "reference_photo_file_id", file.id)),
    ).toMatchObject({ code: UNIQUE, constraint: "orders_reference_photo_file_id_key" });
  });
});

describe("orders: the guard (05 field 1; 06 rules 1 and 6; developer-rules rule 11)", () => {
  const FROZEN: [string, () => Promise<unknown>][] = [
    ["variant_id", async () => (await insertProduct()).defaultVariantId],
    ["company_id", async () => null],
    ["department_id", async () => (await insertDepartment(branchId)).id],
    ["requester_name", async () => "Sinov Shaxs"],
    ["needed_by", async () => "2031-06-01"],
    ["planned_qty", async () => "11"],
    ["planned_price", async () => 6000],
    ["priority", async () => "NORMAL"],
    ["urgent_reason", async () => "Tez kerak"],
    ["comment", async () => "Izoh"],
    ["reference_photo_file_id", async () => (await insertFileRow(ownerId)).id],
    ["planned_total", async () => 60000],
    ["payment_type", async () => "CARD"],
  ];

  for (const status of ["PENDING_HEAD", "PURCHASING"] as const) {
    it(`each plan field is frozen at ${status}`, async () => {
      for (const [column, value] of FROZEN) {
        const frozen = await order({ status, priority: "URGENT", urgentReason: "Dastlabki" });
        // company_id starts empty: the change is to a company.
        const next = column === "company_id" ? await companyId() : await value();
        expect(await refusalOf(setColumn("orders", frozen.id, column, next)), column).toMatchObject(
          { code: CHECK, constraint: "orders_plan_frozen" },
        );
      }
    });
  }

  for (const status of ["DRAFT", "RETURNED"] as const) {
    it(`each plan field changes at ${status}`, async () => {
      for (const [column, value] of FROZEN) {
        const open = await order({ status, priority: "URGENT", urgentReason: "Dastlabki" });
        const next = column === "company_id" ? await companyId() : await value();
        await setColumn("orders", open.id, column, next);
      }
    });
  }

  it("the payment type changes at PENDING_FINANCE, not at PENDING_PRINCIPAL (06 rule 1)", async () => {
    const atFinance = await order({ status: "PENDING_FINANCE" });
    await setColumn("orders", atFinance.id, "payment_type", "TRANSFER");
    const atPrincipal = await order({ status: "PENDING_PRINCIPAL" });
    expect(
      await refusalOf(setColumn("orders", atPrincipal.id, "payment_type", "TRANSFER")),
    ).toMatchObject({ code: CHECK, constraint: "orders_plan_frozen" });
    // Another plan field at PENDING_FINANCE stays frozen.
    expect(await refusalOf(setColumn("orders", atFinance.id, "planned_qty", "3"))).toMatchObject({
      code: CHECK,
      constraint: "orders_plan_frozen",
    });
  });

  it("status, version and the other non-plan columns change at any status", async () => {
    const open = await order({ status: "PURCHASING" });
    await db.execute(
      sql`update orders set status = 'SETTLEMENT', version = version + 1, progress = 'DONE', actual_total = 1 where id = ${open.id}`,
    );
  });

  it("the branch locks once the order has a number; a draft without one may move", async () => {
    const draft = await order();
    await db.execute(
      sql`update orders set branch_id = ${otherBranchId}, department_id = ${(await insertDepartment(otherBranchId)).id} where id = ${draft.id}`,
    );
    const taken = await order({ status: "DRAFT", number: inventedNumber() });
    expect(
      await refusalOf(
        db.execute(
          sql`update orders set branch_id = ${otherBranchId}, department_id = ${(await insertDepartment(otherBranchId)).id} where id = ${taken.id}`,
        ),
      ),
    ).toMatchObject({ code: CHECK, constraint: "orders_branch_fixed" });
  });

  it("only a never-submitted draft is deleted, with its extra costs (05 Drafts 3; rule 11)", async () => {
    const draft = await order();
    await insertOrderExtra(draft.id);
    await insertOrderExtra(draft.id);
    await db.execute(sql`delete from orders where id = ${draft.id}`);
    const left = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from order_extras where order_id = ${draft.id}`,
    );
    expect(left.rows[0]!.count).toBe(0);

    const numbered = await order({ status: "DRAFT", number: inventedNumber() });
    await insertOrderExtra(numbered.id);
    expect(
      await refusalOf(db.execute(sql`delete from orders where id = ${numbered.id}`)),
    ).toMatchObject({ code: CHECK, constraint: "orders_delete_draft_only" });
    const submitted = await order({ status: "CANCELLED" });
    expect(
      await refusalOf(db.execute(sql`delete from orders where id = ${submitted.id}`)),
    ).toMatchObject({ code: CHECK, constraint: "orders_delete_draft_only" });
  });
});

async function companyId() {
  const { insertCompany } = await import("../../../../tests/helpers/catalog");
  return (await insertCompany()).id;
}

describe("order_extras (05 field 12; developer-rules Constraints the spec names)", () => {
  it("an amount of 0 or −1 is refused on insert and update; 1 passes", async () => {
    const draft = await order();
    for (const amount of [0n, -1n]) {
      expect(await refusalOf(insertOrderExtra(draft.id, amount))).toMatchObject({
        code: CHECK,
        constraint: "order_extras_amount_check",
      });
    }
    const extra = await insertOrderExtra(draft.id, 1n);
    expect(await refusalOf(setColumn("order_extras", extra.id, "amount", 0))).toMatchObject({
      code: CHECK,
      constraint: "order_extras_amount_check",
    });
  });

  it("insert, update and delete are refused on an Open order; allowed on a draft (06 rule 6)", async () => {
    const draft = await order();
    const open = await order({ status: "PURCHASING" });
    expect(await refusalOf(insertOrderExtra(open.id))).toMatchObject({
      code: CHECK,
      constraint: "order_extras_plan_frozen",
    });

    // Extras written while the order was a draft, then the order moves on.
    const extra = await insertOrderExtra(draft.id);
    await setColumn("order_extras", extra.id, "amount", 30000);
    await db.execute(
      sql`update orders set status = 'PENDING_HEAD', number = ${inventedNumber()}, submitted_at = ${AT} where id = ${draft.id}`,
    );
    expect(await refusalOf(setColumn("order_extras", extra.id, "amount", 40000))).toMatchObject({
      code: CHECK,
      constraint: "order_extras_plan_frozen",
    });
    expect(
      await refusalOf(db.execute(sql`delete from order_extras where id = ${extra.id}`)),
    ).toMatchObject({ code: CHECK, constraint: "order_extras_plan_frozen" });
    // Moving an extra from a frozen order to a draft is refused too (the old order is checked).
    const other = await order();
    expect(
      await refusalOf(setColumn("order_extras", extra.id, "order_id", other.id)),
    ).toMatchObject({ code: CHECK, constraint: "order_extras_plan_frozen" });

    const returned = await order({ status: "RETURNED" });
    const fixable = await insertOrderExtra(returned.id);
    await db.execute(sql`delete from order_extras where id = ${fixable.id}`);
  });

  it("an unknown order or extra cost type is refused", async () => {
    const draft = await order();
    const extra = await insertOrderExtra(draft.id);
    for (const column of ["order_id", "extra_cost_type_id"]) {
      expect(
        await refusalOf(setColumn("order_extras", extra.id, column, randomUUID())),
        column,
      ).toMatchObject({ code: FOREIGN });
    }
  });
});

describe("number_counters (05 Order number 2 and 5)", () => {
  const insertCounter = (branch: string, year: number, lastValue = 1, scope = "ORD") =>
    db.execute(sql`insert into number_counters (scope, branch_id, year, last_value, created_at)
      values (${scope}, ${branch}, ${year}, ${lastValue}, ${AT})`);

  it("one counter per scope, branch and year; another branch, year or scope passes", async () => {
    await insertCounter(branchId, 2031);
    expect(await refusalOf(insertCounter(branchId, 2031))).toMatchObject({
      code: UNIQUE,
      constraint: "number_counters_pkey",
    });
    await insertCounter(otherBranchId, 2031);
    await insertCounter(branchId, 2032);
    await insertCounter(branchId, 2031, 1, "ISS");
  });

  it("a year outside 2000–9999, a negative value, an unknown scope or branch is refused", async () => {
    const branch = (await insertBranch()).id;
    for (const year of [1999, 10000]) {
      expect(await refusalOf(insertCounter(branch, year))).toMatchObject({
        code: CHECK,
        constraint: "number_counters_year_check",
      });
    }
    expect(await refusalOf(insertCounter(branch, 2031, -1))).toMatchObject({
      code: CHECK,
      constraint: "number_counters_last_value_check",
    });
    expect(await refusalOf(insertCounter(branch, 2031, 0, "XYZ"))).toMatchObject({
      code: BAD_ENUM,
    });
    expect(await refusalOf(insertCounter(randomUUID(), 2031))).toMatchObject({ code: FOREIGN });
    await insertCounter(branch, 2000, 0);
    await insertCounter(branch, 9999, 0);
  });
});

describe("order_actions, order_events, order_revisions (06 rule 11; developer-rules rules 7 and 8)", () => {
  const insertAction = (
    row: { clientKey?: string; reason?: string | null; orderCount?: number; type?: string } = {},
  ) =>
    db.execute<{ id: string }>(sql`insert into order_actions
        (client_key, type, actor_id, reason, order_count, created_at)
      values (${row.clientKey ?? randomUUID()}, ${row.type ?? "APPROVE"}, ${ownerId},
        ${row.reason ?? null}, ${row.orderCount ?? 1}, ${AT})
      returning id`);

  const insertEvent = async (
    orderId: string,
    row: {
      actionId?: string | null;
      fromStatus?: string | null;
      toStatus?: string | null;
      type?: string;
      actorId?: string;
    } = {},
  ) =>
    db.execute<{ id: string }>(sql`insert into order_events
        (order_id, action_id, type, from_status, to_status, actor_id, created_at)
      values (${orderId},
        ${row.actionId === undefined ? (await insertAction()).rows[0]!.id : row.actionId},
        ${row.type ?? "APPROVE"},
        ${row.fromStatus === undefined ? "PENDING_HEAD" : row.fromStatus},
        ${row.toStatus === undefined ? "PENDING_PRINCIPAL" : row.toStatus},
        ${row.actorId ?? ownerId}, ${AT})
      returning id`);

  it("the same client_key twice is refused (rule 8)", async () => {
    const clientKey = randomUUID();
    await insertAction({ clientKey });
    expect(await refusalOf(insertAction({ clientKey }))).toMatchObject({
      code: UNIQUE,
      constraint: "order_actions_client_key_key",
    });
  });

  it("an order count of 0 or 201 is refused; 1 and 200 pass (06 rule 8)", async () => {
    for (const orderCount of [0, 201]) {
      expect(await refusalOf(insertAction({ orderCount }))).toMatchObject({
        code: CHECK,
        constraint: "order_actions_order_count_check",
      });
    }
    await insertAction({ orderCount: 1 });
    await insertAction({ orderCount: 200 });
  });

  it("a reason of 4 or 501 characters is refused; 5 and 500 pass (06 rule 3)", async () => {
    for (const reason of ["abcd", "x".repeat(501)]) {
      expect(await refusalOf(insertAction({ reason }))).toMatchObject({
        code: CHECK,
        constraint: "order_actions_reason_check",
      });
    }
    await insertAction({ reason: "abcde" });
    await insertAction({ reason: "x".repeat(500) });
  });

  it("an unknown actor is refused (developer-rules rule 5)", async () => {
    expect(
      await refusalOf(
        db.execute(sql`insert into order_actions (client_key, type, actor_id, order_count, created_at)
          values (${randomUUID()}, 'APPROVE', ${randomUUID()}, 1, ${AT})`),
      ),
    ).toMatchObject({ code: FOREIGN, constraint: "order_actions_actor_id_users_id_fk" });
  });

  it("an unknown action type is refused", async () => {
    expect(await refusalOf(insertAction({ type: "PAINT" }))).toMatchObject({ code: BAD_ENUM });
  });

  it("an event without an action or a status is refused; with both it passes", async () => {
    const submitted = await order({ status: "PENDING_HEAD" });
    expect(await refusalOf(insertEvent(submitted.id, { actionId: null }))).toMatchObject({
      code: NOT_NULL,
      column: "action_id",
    });
    for (const column of ["from_status", "to_status"] as const) {
      const empty = column === "from_status" ? { fromStatus: null } : { toStatus: null };
      expect(await refusalOf(insertEvent(submitted.id, empty)), column).toMatchObject({
        code: NOT_NULL,
        column,
      });
    }
    expect(await refusalOf(insertEvent(submitted.id, { type: "PAINT" }))).toMatchObject({
      code: BAD_ENUM,
    });
    // Each foreign key of order_events (developer-rules rule 5; D39).
    expect(await refusalOf(insertEvent(submitted.id, { actionId: randomUUID() }))).toMatchObject({
      code: FOREIGN,
      constraint: "order_events_action_id_order_actions_id_fk",
    });
    expect(await refusalOf(insertEvent(randomUUID()))).toMatchObject({
      code: FOREIGN,
      constraint: "order_events_order_id_orders_id_fk",
    });
    expect(await refusalOf(insertEvent(submitted.id, { actorId: randomUUID() }))).toMatchObject({
      code: FOREIGN,
      constraint: "order_events_actor_id_users_id_fk",
    });
    await insertEvent(submitted.id);
  });

  // Changed in 2.11 (plan of 2.11, decided item 2, Look first): a taken-back Draft keeps its
  // revision at its next submit, so one revision holds one copy per submission; the key moved from
  // (order, revision) to (order, revision, submission). Each guard is reached with nothing in
  // front of it (D39).
  it("one copy per revision and submission; revision 0 and submission 0 are refused", async () => {
    const submitted = await order({ status: "PENDING_HEAD" });
    const copy = (revision: number, submission: number) =>
      db.execute(sql`insert into order_revisions (order_id, revision, submission, snapshot,
          created_at)
        values (${submitted.id}, ${revision}, ${submission}, '{}'::jsonb, ${AT})`);
    await copy(1, 1);
    expect(await refusalOf(copy(1, 1))).toMatchObject({
      code: UNIQUE,
      constraint: "order_revisions_order_id_revision_submission_key",
    });
    // A second submit of the same revision (after a Take back) is its submission 2.
    await copy(1, 2);
    expect(await refusalOf(copy(0, 1))).toMatchObject({
      code: CHECK,
      constraint: "order_revisions_revision_check",
    });
    expect(await refusalOf(copy(3, 0))).toMatchObject({
      code: CHECK,
      constraint: "order_revisions_submission_check",
    });
    expect(
      await refusalOf(
        db.execute(sql`insert into order_revisions (order_id, revision, snapshot, created_at)
          values (${submitted.id}, 4, '{}'::jsonb, ${AT})`),
      ),
    ).toMatchObject({ code: "23502" });
    await copy(2, 1);
    expect(
      await refusalOf(
        db.execute(sql`insert into order_revisions (order_id, revision, submission, snapshot,
            created_at)
          values (${randomUUID()}, 1, 1, '{}'::jsonb, ${AT})`),
      ),
    ).toMatchObject({ code: FOREIGN, constraint: "order_revisions_order_id_orders_id_fk" });
  });

  it("UPDATE, DELETE and TRUNCATE of the history are refused (rule 7)", async () => {
    const submitted = await order({ status: "PENDING_HEAD" });
    const event = (await insertEvent(submitted.id)).rows[0]!.id;
    await db.execute(sql`insert into order_revisions (order_id, revision, submission, snapshot,
        created_at)
      values (${submitted.id}, 1, 1, '{}'::jsonb, ${AT})`);
    const writes: [string, ReturnType<typeof sql>][] = [
      ["order_events", sql`update order_events set comment = 'boshqa' where id = ${event}`],
      ["order_events", sql`delete from order_events where id = ${event}`],
      ["order_events", sql`truncate order_events`],
      ["order_actions", sql`update order_actions set reason = 'boshqa sabab'`],
      ["order_actions", sql`delete from order_actions`],
      ["order_actions", sql`truncate order_actions cascade`],
      ["order_revisions", sql`update order_revisions set revision = 9`],
      ["order_revisions", sql`delete from order_revisions`],
      ["order_revisions", sql`truncate order_revisions`],
    ];
    for (const [table, write] of writes) {
      // TRUNCATE … CASCADE reaches both tables; either guard may answer first.
      expect(await refusalOf(db.execute(write)), table).toMatchObject({
        code: CHECK,
        constraint: expect.stringMatching(
          table === "order_actions"
            ? /^order_(actions|events)_append_only$/
            : `^${table}_append_only$`,
        ),
      });
    }
  });
});

describe("stock_balances (developer-rules rule 5: stock CHECK of 0 or more)", () => {
  const insertBalance = (variantId: string, qty: string, branch = branchId) =>
    db.execute(sql`insert into stock_balances (branch_id, variant_id, qty, created_at, updated_at)
      values (${branch}, ${variantId}, ${qty}, ${AT}, ${AT})`);

  it("a negative quantity is refused on insert and update; 0 passes", async () => {
    const variantId = (await insertProduct()).defaultVariantId;
    expect(await refusalOf(insertBalance(variantId, "-0.001"))).toMatchObject({
      code: CHECK,
      constraint: "stock_balances_qty_check",
    });
    await insertBalance(variantId, "0");
    expect(
      await refusalOf(
        db.execute(
          sql`update stock_balances set qty = qty - 0.001 where variant_id = ${variantId}`,
        ),
      ),
    ).toMatchObject({ code: CHECK, constraint: "stock_balances_qty_check" });
    await db.execute(sql`update stock_balances set qty = 2.5 where variant_id = ${variantId}`);
  });

  it("one row per branch and subtype; another branch passes; unknown ids are refused", async () => {
    const variantId = (await insertProduct()).defaultVariantId;
    await insertBalance(variantId, "1");
    expect(await refusalOf(insertBalance(variantId, "1"))).toMatchObject({
      code: UNIQUE,
      constraint: "stock_balances_pkey",
    });
    await insertBalance(variantId, "1", otherBranchId);
    expect(await refusalOf(insertBalance(randomUUID(), "1"))).toMatchObject({ code: FOREIGN });
    expect(await refusalOf(insertBalance(variantId, "1", randomUUID()))).toMatchObject({
      code: FOREIGN,
    });
  });
});
