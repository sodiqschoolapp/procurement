import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";

import { insertBranch } from "../../../../tests/helpers/branches";
import { insertProduct } from "../../../../tests/helpers/catalog";
import { refusalOf } from "../../../../tests/helpers/database-error";
import { insertUser } from "../../../../tests/helpers/users";

// The constraints and triggers of migration 0023_stock_ledger (build plan 3.1, Done when: "a
// movement that would go below zero is refused … by the CHECK"; plan of 3.1, Tests). Each
// forbidden write goes straight to the table with nothing in front (D39) and stands beside the
// write the guard lets through (D40). Spec: 14-data-model.md (Warehouse); 09-warehouse.md (first
// paragraph; Movement types; Stock value); developer-rules.md rules 5 and 7.

const AT = "2031-05-02T05:00:00Z";
const CHECK = "23514";

let branchId: string;
let userId: string;

beforeAll(async () => {
  branchId = (await insertBranch()).id;
  userId = (await insertUser("HEAD")).id;
});

async function variant(): Promise<string> {
  return (await insertProduct()).defaultVariantId;
}

function insertBalance(variantId: string, qty: string, avgCost: string) {
  return db.execute(sql`
    insert into stock_balances (branch_id, variant_id, qty, avg_cost, created_at, updated_at)
    values (${branchId}, ${variantId}, ${qty}, ${avgCost}, ${AT}, ${AT})`);
}

function updateBalance(variantId: string, qty: string, avgCost: string) {
  return db.execute(sql`
    update stock_balances set qty = ${qty}, avg_cost = ${avgCost}
    where branch_id = ${branchId} and variant_id = ${variantId}`);
}

function insertMovement(
  variantId: string,
  row: { type?: string; qtyDelta?: string; unitCost?: string; balanceAfter?: string } = {},
) {
  return db.execute<{ id: string }>(sql`
    insert into stock_movements (branch_id, variant_id, type, qty_delta, unit_cost, balance_after,
      created_by, created_at)
    values (${branchId}, ${variantId}, ${row.type ?? "RECEIPT"}, ${row.qtyDelta ?? "1"},
      ${row.unitCost ?? "100"}, ${row.balanceAfter ?? "1"}, ${userId}, ${AT})
    returning id`);
}

describe("stock_balances CHECKs (developer-rules rule 5; 09 first paragraph and Stock value)", () => {
  it("stock_balances_qty_check refuses a quantity below 0, on insert and on update", async () => {
    const v = await variant();
    expect(await refusalOf(insertBalance(v, "-1", "0"))).toMatchObject({
      code: CHECK,
      constraint: "stock_balances_qty_check",
    });
    await insertBalance(v, "0", "0");
    expect(await refusalOf(updateBalance(v, "-0.001", "0"))).toMatchObject({
      code: CHECK,
      constraint: "stock_balances_qty_check",
    });
    await updateBalance(v, "2", "100");
  });

  it("stock_balances_avg_cost_check refuses an average below 0, on insert and on update", async () => {
    const v = await variant();
    expect(await refusalOf(insertBalance(v, "5", "-1"))).toMatchObject({
      code: CHECK,
      constraint: "stock_balances_avg_cost_check",
    });
    await insertBalance(v, "5", "0");
    expect(await refusalOf(updateBalance(v, "5", "-1"))).toMatchObject({
      code: CHECK,
      constraint: "stock_balances_avg_cost_check",
    });
    await updateBalance(v, "5", "1");
  });

  it("stock_balances_empty_avg_check: an empty stock has the average 0 (decided item 4), on insert and on update", async () => {
    const v = await variant();
    expect(await refusalOf(insertBalance(v, "0", "5"))).toMatchObject({
      code: CHECK,
      constraint: "stock_balances_empty_avg_check",
    });
    await insertBalance(v, "3", "5");
    expect(await refusalOf(updateBalance(v, "0", "5"))).toMatchObject({
      code: CHECK,
      constraint: "stock_balances_empty_avg_check",
    });
    await updateBalance(v, "0", "0");
  });
});

describe("stock_movements CHECKs (developer-rules rule 5; 09 Movement types)", () => {
  it("stock_movements_balance_after_check refuses a balance below 0", async () => {
    const v = await variant();
    expect(
      await refusalOf(insertMovement(v, { type: "ISSUE", qtyDelta: "-1", balanceAfter: "-1" })),
    ).toMatchObject({ code: CHECK, constraint: "stock_movements_balance_after_check" });
    await insertMovement(v, { type: "ISSUE", qtyDelta: "-1", balanceAfter: "0" });
  });

  it("stock_movements_qty_delta_check refuses a movement of 0", async () => {
    const v = await variant();
    expect(await refusalOf(insertMovement(v, { type: "CORRECTION", qtyDelta: "0" }))).toMatchObject(
      { code: CHECK, constraint: "stock_movements_qty_delta_check" },
    );
    await insertMovement(v, { type: "CORRECTION", qtyDelta: "0.001" });
  });

  it("stock_movements_unit_cost_check refuses a cost below 0 and lets 0 through (a free item)", async () => {
    const v = await variant();
    expect(await refusalOf(insertMovement(v, { unitCost: "-1" }))).toMatchObject({
      code: CHECK,
      constraint: "stock_movements_unit_cost_check",
    });
    await insertMovement(v, { unitCost: "0" });
  });

  it.each([
    ["RECEIPT", "-1", "1"],
    ["RETURN", "-1", "1"],
    ["TRANSFER_IN", "-1", "1"],
    ["DIRECT_ENTRY", "-1", "1"],
    ["ISSUE", "1", "-1"],
    ["TRANSFER_OUT", "1", "-1"],
    ["WRITE_OFF", "1", "-1"],
  ])(
    "stock_movements_direction_check refuses a %s of %s and lets %s through (decided item 6)",
    async (type, wrong, right) => {
      const v = await variant();
      expect(await refusalOf(insertMovement(v, { type, qtyDelta: wrong }))).toMatchObject({
        code: CHECK,
        constraint: "stock_movements_direction_check",
      });
      await insertMovement(v, { type, qtyDelta: right });
    },
  );

  it.each(["CORRECTION", "REVERSAL"])("a %s goes either way", async (type) => {
    const v = await variant();
    for (const qtyDelta of ["1", "-1"]) {
      // Each reversal undoes a movement of its own: one is reversed at most once (plan of 5.1,
      // decided item 4).
      const target = (await insertMovement(v)).rows[0]!.id;
      const reverses = type === "REVERSAL" ? target : null;
      await db.execute(sql`
        insert into stock_movements (branch_id, variant_id, type, qty_delta, unit_cost,
          balance_after, reverses_movement_id, created_by, created_at)
        values (${branchId}, ${v}, ${type}, ${qtyDelta}, 0, 1, ${reverses}, ${userId}, ${AT})`);
    }
  });
});

describe("stock_movements is append-only (developer-rules rule 7)", () => {
  it("refuses UPDATE, DELETE and TRUNCATE", async () => {
    const v = await variant();
    const id = (await insertMovement(v)).rows[0]!.id;
    for (const write of [
      db.execute(sql`update stock_movements set unit_cost = 5 where id = ${id}`),
      db.execute(sql`delete from stock_movements where id = ${id}`),
      db.execute(sql`truncate stock_movements cascade`),
    ]) {
      expect(await refusalOf(write)).toMatchObject({
        code: CHECK,
        constraint: "stock_movements_append_only",
      });
    }
    const left = await db.execute(
      sql`select unit_cost::text from stock_movements where id = ${id}`,
    );
    expect(left.rows).toEqual([{ unit_cost: "100" }]);
  });
});
