import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { productInUse } from "@/features/catalog/actions/product-uses";

import { insertBranch } from "../../tests/helpers/branches";
import { insertProduct, insertUnit } from "../../tests/helpers/catalog";
import { setClock } from "../../tests/helpers/clock";
import { insertUser } from "../../tests/helpers/users";
import { ActionError } from "./action";
import {
  type PostedMovement,
  type PostedMovementInput,
  StockShortError,
  postMovement,
  postMovements,
} from "./stock-ledger";

// postMovement(), the one way stock changes (build plan 3.1, Done when: "a movement that would go
// below zero is refused by the code …; two movements at the same moment both land with the right
// balance_after"; plan of 3.1, Tests, and its review). Spec: 09-warehouse.md (first paragraph;
// Movement types; Stock value); 14-data-model.md (Warehouse; Notes for the build, first bullet);
// 15-quality-and-acceptance.md (Test layers: actions two at a time prove the locks);
// developer-rules.md rules 3, 5 and 10. Every fixture is asserted (D38).

const AT = "2031-05-03T06:00:00Z";

let branchId: string;
let otherBranchId: string;
let userId: string;

beforeAll(async () => {
  branchId = (await insertBranch()).id;
  otherBranchId = (await insertBranch()).id;
  userId = (await insertUser("MANAGER", { branches: [branchId, otherBranchId] })).id;
});

async function goods(allowDecimal = false): Promise<string> {
  const unit = await insertUnit({ allowDecimal });
  return (await insertProduct({ unitId: unit.id })).defaultVariantId;
}

function movement(
  variantId: string,
  type: PostedMovementInput["type"],
  qtyDelta: string,
  unitCost: bigint | null = null,
  branch = branchId,
): PostedMovementInput {
  return { branchId: branch, variantId, type, qtyDelta, unitCost, createdBy: userId };
}

function post(input: PostedMovementInput): Promise<PostedMovement> {
  return db.transaction((tx) => postMovement(tx, input));
}

async function balanceOf(variantId: string, branch = branchId) {
  const found = await db.execute<{ qty: string; avg_cost: string }>(sql`
    select qty::text as qty, avg_cost::text as avg_cost from stock_balances
    where branch_id = ${branch} and variant_id = ${variantId}`);
  return found.rows[0] ?? null;
}

async function movementsOf(variantId: string, branch = branchId) {
  const found = await db.execute<{
    type: string;
    qty_delta: string;
    unit_cost: string;
    balance_after: string;
    at_clock: boolean;
  }>(sql`
    select type, qty_delta::text as qty_delta, unit_cost::text as unit_cost,
      balance_after::text as balance_after, created_at = ${AT}::timestamptz as at_clock
    from stock_movements where branch_id = ${branch} and variant_id = ${variantId}
    order by seq`);
  return found.rows;
}

/** What the side that runs second in a same-moment test throws, or its result. */
async function outcome<T>(running: Promise<T>): Promise<T | Error> {
  return running.catch((error: unknown) => error as Error);
}

/**
 * The held side of a same-moment test (`.claude/rules/tests.md`): `first` runs in a transaction
 * that stays open until `second`, on its own connection, waits on a lock; then it commits. The
 * wait is read from pg_stat_activity, never timed (tests/helpers/together.ts does the same).
 */
async function heldWhileSecondWaits<A, B>(
  first: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<A>,
  second: () => Promise<B>,
): Promise<{ first: A; second: B | Error }> {
  let running!: Promise<B | Error>;
  const firstResult = await db.transaction(async (tx) => {
    const result = await first(tx);
    running = outcome(second());
    for (let tries = 0; ; tries += 1) {
      await db.execute(sql`select pg_stat_clear_snapshot()`);
      const waiting = await db.execute<{ n: number }>(sql`
        select count(*)::int as n from pg_stat_activity
        where datname = current_database() and wait_event_type = 'Lock'`);
      if (waiting.rows[0]!.n >= 1) break;
      if (tries > 5_000) throw new Error("The second side never waited on a lock.");
    }
    return result;
  });
  return { first: firstResult, second: await running };
}

describe("postMovement: never below 0 (09 first paragraph; decided item 8)", () => {
  it("refuses a movement past the stock with the available quantity and saves nothing", async () => {
    setClock(AT);
    const v = await goods();
    expect(await post(movement(v, "RECEIPT", "5", 800n))).toMatchObject({ qty: "5" });

    const refused = await outcome(post(movement(v, "ISSUE", "-6")));
    expect(refused).toBeInstanceOf(StockShortError);
    expect(refused).toMatchObject({ code: "conflict", branchId, variantId: v, available: "5" });
    expect(await balanceOf(v)).toEqual({ qty: "5.000", avg_cost: "800" });
    expect(await movementsOf(v)).toHaveLength(1);
  });

  it("lets a movement down to exactly 0 through, and the average resets (decided item 4)", async () => {
    setClock(AT);
    const v = await goods();
    await post(movement(v, "RECEIPT", "5", 800n));
    expect(await post(movement(v, "ISSUE", "-5"))).toMatchObject({ qty: "0", avgCost: 0n });
    expect(await balanceOf(v)).toEqual({ qty: "0.000", avg_cost: "0" });
  });

  it("refuses the first movement of a new balance that would go below 0, leaving no balance row", async () => {
    const v = await goods();
    expect(await outcome(post(movement(v, "CORRECTION", "-1")))).toMatchObject({
      available: "0",
    });
    expect(await balanceOf(v)).toBeNull();
  });
});

describe("postMovement: the balance in step with the movements (14 Notes for the build, first bullet)", () => {
  it("writes each movement with its balance_after, unit cost and the clock's time", async () => {
    setClock(AT);
    const v = await goods();
    await post(movement(v, "RECEIPT", "10", 1000n));
    await post(movement(v, "ISSUE", "-4"));
    // (6 × 1 000 + 5 × 1 600) ÷ 11 = 1 272.72… → 1 273 (09 Stock value; decided item 1)
    expect(await post(movement(v, "RECEIPT", "5", 1600n))).toMatchObject({
      qty: "11",
      avgCost: 1273n,
    });

    const rows = await movementsOf(v);
    expect(rows.map((row) => [row.type, row.qty_delta, row.unit_cost, row.balance_after])).toEqual([
      ["RECEIPT", "10.000", "1000", "10.000"],
      ["ISSUE", "-4.000", "1000", "6.000"],
      ["RECEIPT", "5.000", "1600", "11.000"],
    ]);
    expect(rows.map((row) => row.at_clock)).toEqual([true, true, true]);
    const sum = await db.execute<{ total: string }>(sql`
      select sum(qty_delta)::text as total from stock_movements
      where branch_id = ${branchId} and variant_id = ${v}`);
    expect(sum.rows[0]!.total).toBe("11.000");
    expect(await balanceOf(v)).toEqual({ qty: "11.000", avg_cost: "1273" });
  });

  it("keeps each branch's stock apart: a movement in one branch leaves the other's untouched", async () => {
    const v = await goods();
    await post(movement(v, "RECEIPT", "7", 300n, otherBranchId));
    await post(movement(v, "RECEIPT", "2", 900n));
    expect(await balanceOf(v, otherBranchId)).toEqual({ qty: "7.000", avg_cost: "300" });
    expect(await balanceOf(v)).toEqual({ qty: "2.000", avg_cost: "900" });
  });
});

describe("postMovement at the same moment (15 Test layers; the Done-when line)", () => {
  it("two receipts on an existing balance both land with the right balance_after", async () => {
    const v = await goods();
    await post(movement(v, "RECEIPT", "10", 100n));
    const { first, second } = await heldWhileSecondWaits(
      (tx) => postMovement(tx, movement(v, "RECEIPT", "3", 100n)),
      () => post(movement(v, "RECEIPT", "4", 100n)),
    );
    expect(first).toMatchObject({ qty: "13" });
    expect(second).toMatchObject({ qty: "17" });
    expect((await movementsOf(v)).map((row) => row.balance_after)).toEqual([
      "10.000",
      "13.000",
      "17.000",
    ]);
    expect(await balanceOf(v)).toMatchObject({ qty: "17.000" });
  });

  it("two issues of 3 on a stock of 5: one lands, the other is told 2 are left", async () => {
    const v = await goods();
    await post(movement(v, "RECEIPT", "5", 100n));
    const { first, second } = await heldWhileSecondWaits(
      (tx) => postMovement(tx, movement(v, "ISSUE", "-3")),
      () => post(movement(v, "ISSUE", "-3")),
    );
    expect(first).toMatchObject({ qty: "2" });
    expect(second).toBeInstanceOf(StockShortError);
    expect(second).toMatchObject({ available: "2" });
    expect(await balanceOf(v)).toMatchObject({ qty: "2.000" });
  });

  it("two first receipts of a new balance both land (decided item 9)", async () => {
    const v = await goods();
    const { first, second } = await heldWhileSecondWaits(
      (tx) => postMovement(tx, movement(v, "RECEIPT", "3", 100n)),
      () => post(movement(v, "RECEIPT", "4", 200n)),
    );
    expect(first).toMatchObject({ qty: "3", avgCost: 100n });
    // (3 × 100 + 4 × 200) ÷ 7 = 157.14… → 157
    expect(second).toMatchObject({ qty: "7", avgCost: 157n });
    expect(await balanceOf(v)).toEqual({ qty: "7.000", avg_cost: "157" });
  });
});

describe("postMovements: the lines of one document in a fixed order (plan of 3.1)", () => {
  it("posts by branch and subtype and answers in the order given", async () => {
    const [a, b] = [await goods(), await goods()].sort();
    const results = await db.transaction((tx) =>
      postMovements(tx, [movement(b!, "RECEIPT", "2", 50n), movement(a!, "RECEIPT", "1", 70n)]),
    );
    expect(results.map((result) => result.avgCost)).toEqual([50n, 70n]);
    const order = await db.execute<{ variant_id: string }>(sql`
      select variant_id from stock_movements where variant_id in (${a}, ${b}) order by seq`);
    expect(order.rows.map((row) => row.variant_id)).toEqual([a, b]);
  });
});

describe("postMovement: what may be stocked (09 first paragraph; decided item 7)", () => {
  it("refuses a service and leaves no stock row", async () => {
    const service = (await insertProduct({ type: "SERVICE" })).defaultVariantId;
    const refused = await outcome(post(movement(service, "RECEIPT", "1", 100n)));
    expect(refused).toBeInstanceOf(ActionError);
    expect(refused).toMatchObject({
      code: "invalid_input",
      fields: { qty: "errors.field.notAllowed" },
    });
    expect(await balanceOf(service)).toBeNull();
    // Beside it, goods pass.
    expect(await post(movement(await goods(), "RECEIPT", "1", 100n))).toMatchObject({ qty: "1" });
  });

  it("refuses half a piece of a measure counted in whole units; a decimal measure takes it", async () => {
    const pieces = await goods(false);
    expect(await outcome(post(movement(pieces, "RECEIPT", "0.5", 100n)))).toMatchObject({
      code: "invalid_input",
      fields: { qty: "errors.field.wholeOnly" },
    });
    expect(await balanceOf(pieces)).toBeNull();
    const kilos = await goods(true);
    expect(await post(movement(kilos, "RECEIPT", "0.5", 100n))).toMatchObject({ qty: "0.5" });
  });

  it("refuses an unknown subtype as not found", async () => {
    expect(
      await outcome(post(movement("00000000-0000-4000-8000-000000000000", "RECEIPT", "1", 1n))),
    ).toMatchObject({ code: "not_found" });
  });
});

describe("a stock movement is a first use of its product (04 Catalogs: type and measure lock; decisions 1.7 item 1)", () => {
  it("a product with a movement is in use; another product beside it is not", async () => {
    const used = await insertProduct();
    const unused = await insertProduct();
    await post(movement(used.defaultVariantId, "RECEIPT", "1", 100n));
    expect(await productInUse(db, used.id)).toBe(true);
    expect(await productInUse(db, unused.id)).toBe(false);
  });
});
