import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { ORDER_FIELDS_DEFAULT } from "@/domain/order-fields";
import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { refusalOf } from "../../../../tests/helpers/database-error";
import { insertOrder, inventedNumber } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";

// The constraints of migration 0056 (build plan 2.5d, Done when: "the new and loosened constraints
// each refuse what they must, written straight in SQL"; D67). Each forbidden write goes straight to
// the table (D39): by an insert, and by the status move of a numbered Draft, since the orders_guard
// trigger of 0019 refuses a plan edit of a submitted order before any CHECK runs (spec review of the
// plan, Should fix 1). Spec: 05-order-request-form.md (Fields the Head sets 3; Drafts 2);
// 06-approval-workflow.md (Finance step switched off 8); 14-data-model.md (`orders`; settings keys).

const AT = "2031-04-11T05:00:00Z";
const CHECK = "23514";
const UNIQUE = "23505";

let branchId: string;
let ownerId: string;

beforeAll(async () => {
  branchId = (await insertBranch()).id;
  ownerId = (await insertUser("MANAGER", { branches: [branchId] })).id;
});

const order = (row: Partial<Parameters<typeof insertOrder>[0]> = {}) =>
  insertOrder({ branchId, ownerId, ...row });

/** A numbered Draft with its submit time: one status move from Waiting for Head. */
async function numberedDraft(row: Partial<Parameters<typeof insertOrder>[0]> = {}) {
  const draft = await order({ number: inventedNumber(), ...row });
  await db.execute(sql`update orders set submitted_at = ${AT} where id = ${draft.id}`);
  return draft;
}

function setPlan(id: string, columns: { price?: bigint | null; total?: bigint | null }) {
  const sets = [];
  if (columns.price !== undefined) sets.push(sql`planned_price = ${columns.price}`);
  if (columns.total !== undefined) sets.push(sql`planned_total = ${columns.total}`);
  return db.execute(sql`update orders set ${sql.join(sets, sql`, `)} where id = ${id}`);
}

function moveTo(id: string, status: string) {
  return db.execute(sql`update orders set status = ${status} where id = ${id}`);
}

describe("orders_submitted_plan_check, loosened (05 Fields the Head sets 3; D67)", () => {
  it("a submitted order without a department, a needed-by date, a price and a total is accepted", async () => {
    const draft = await numberedDraft({ departmentId: null, neededBy: null });
    await setPlan(draft.id, { price: null, total: null });
    await moveTo(draft.id, "PENDING_HEAD");
    const [row] = (
      await db.execute<{ status: string }>(sql`select status from orders where id = ${draft.id}`)
    ).rows;
    expect(row?.status).toBe("PENDING_HEAD");
  });

  it("by insert: an order without a department and a needed-by date is accepted outside Draft", async () => {
    await order({ status: "PENDING_HEAD", departmentId: null, neededBy: null });
  });

  it("still refuses a submitted order without a subtype, a quantity or a submit time", async () => {
    for (const column of ["variant_id", "planned_qty", "submitted_at"]) {
      const draft = await numberedDraft();
      await db.execute(
        sql`update orders set ${sql.identifier(column)} = null where id = ${draft.id}`,
      );
      expect(await refusalOf(moveTo(draft.id, "PENDING_HEAD")), column).toMatchObject({
        code: CHECK,
        constraint: "orders_submitted_plan_check",
      });
    }
  });
});

describe("orders_planned_price_total_check (D67: both present or both empty)", () => {
  it("a price without a total and a total without a price are refused on submit", async () => {
    const priceOnly = await numberedDraft();
    await setPlan(priceOnly.id, { total: null });
    expect(await refusalOf(moveTo(priceOnly.id, "PENDING_HEAD"))).toMatchObject({
      code: CHECK,
      constraint: "orders_planned_price_total_check",
    });
    const totalOnly = await numberedDraft();
    await setPlan(totalOnly.id, { price: null });
    expect(await refusalOf(moveTo(totalOnly.id, "PENDING_HEAD"))).toMatchObject({
      code: CHECK,
      constraint: "orders_planned_price_total_check",
    });
  });

  it("by insert: a submitted order with a price and no total is refused", async () => {
    expect(
      await refusalOf(
        db.execute(
          sql`insert into orders (branch_id, owner_id, created_by, status, number, variant_id,
                planned_qty, planned_price, planned_total, payment_type, submitted_at, updated_at, created_at)
              select ${branchId}, ${ownerId}, ${ownerId}, 'PENDING_HEAD', ${inventedNumber()},
                     variant_id, 1, 5000, null, 'CASH', ${AT}, ${AT}, ${AT}
              from orders where variant_id is not null limit 1`,
        ),
      ),
    ).toMatchObject({ code: CHECK, constraint: "orders_planned_price_total_check" });
  });

  it("a Draft may hold a price without a total (decided item 5: a price typed before the quantity)", async () => {
    const draft = await order();
    await setPlan(draft.id, { total: null });
  });
});

describe("orders_priced_finance_check (06 Finance step switched off 8)", () => {
  it("an unpriced order cannot wait for Finance or for settlement; a priced one can", async () => {
    for (const status of ["PENDING_FINANCE", "SETTLEMENT"]) {
      const draft = await numberedDraft();
      await setPlan(draft.id, { price: null, total: null });
      expect(await refusalOf(moveTo(draft.id, status)), status).toMatchObject({
        code: CHECK,
        constraint: "orders_priced_finance_check",
      });
    }
    await order({ status: "PENDING_FINANCE" });
  });

  it("an unpriced order may wait for Head and for Principal", async () => {
    for (const status of ["PENDING_HEAD", "PENDING_PRINCIPAL"]) {
      const draft = await numberedDraft();
      await setPlan(draft.id, { price: null, total: null });
      await moveTo(draft.id, status);
    }
  });
});

describe("orders_one_draft_no_department_key (05 Fields the Head sets 3; Drafts 2)", () => {
  it("two never-submitted drafts of one owner, branch and subtype without a department are refused", async () => {
    const first = await order({ departmentId: null });
    expect(
      await refusalOf(order({ variantId: first.variantId, departmentId: null })),
    ).toMatchObject({ code: UNIQUE, constraint: "orders_one_draft_no_department_key" });
  });

  it("a numbered draft, another owner, or a draft with a department beside it passes", async () => {
    const first = await order({ departmentId: null });
    await order({ variantId: first.variantId, departmentId: null, number: inventedNumber() });
    const colleague = await insertUser("MANAGER", { branches: [branchId] });
    await order({ ownerId: colleague.id, variantId: first.variantId, departmentId: null });
    await order({ variantId: first.variantId });
  });

  it("two empty rows without a subtype and a department do not collide (decided item 4)", async () => {
    const first = await order({ departmentId: null });
    await db.execute(sql`update orders set variant_id = null where id = ${first.id}`);
    const second = await order({ departmentId: null });
    await db.execute(sql`update orders set variant_id = null where id = ${second.id}`);
  });
});

describe("settings_order_fields_check (14 Notes for the build: `order_fields`)", () => {
  async function write(value: unknown) {
    await db.execute(sql`delete from settings where key = 'order_fields'`);
    return db.execute(
      sql`insert into settings (key, value, created_at) values ('order_fields', ${JSON.stringify(value)}::jsonb, ${AT})`,
    );
  }

  it("takes the defaults and any allowed choice", async () => {
    await write(ORDER_FIELDS_DEFAULT);
    await write({
      ...ORDER_FIELDS_DEFAULT,
      department: { ask: "optional", place: "more" },
      neededBy: { ask: "hidden", place: "row" },
      paymentType: { ask: "hidden", place: "row" },
      extras: { ask: "hidden", place: "more" },
    });
    await db.execute(sql`delete from settings where key = 'order_fields'`);
  });

  it("refuses each wrong shape", async () => {
    const { comment: _comment, ...partial } = ORDER_FIELDS_DEFAULT;
    const wrong: unknown[] = [
      partial,
      { ...ORDER_FIELDS_DEFAULT, branch: { ask: "required", place: "row" } },
      { ...ORDER_FIELDS_DEFAULT, comment: { ask: "optional" } },
      { ...ORDER_FIELDS_DEFAULT, comment: { ask: "optional", place: "more", x: 1 } },
      { ...ORDER_FIELDS_DEFAULT, comment: "optional" },
      { ...ORDER_FIELDS_DEFAULT, paymentType: { ask: "required", place: "more" } },
      { ...ORDER_FIELDS_DEFAULT, extras: { ask: "required", place: "more" } },
      { ...ORDER_FIELDS_DEFAULT, department: { ask: "shown", place: "row" } },
      { ...ORDER_FIELDS_DEFAULT, department: { ask: "required", place: "top" } },
      { ...ORDER_FIELDS_DEFAULT, department: { ask: 1, place: "row" } },
      [],
      "required",
    ];
    for (const value of wrong) {
      expect(await refusalOf(write(value)), JSON.stringify(value)).toMatchObject({
        code: CHECK,
        constraint: "settings_order_fields_check",
      });
    }
  });
});
