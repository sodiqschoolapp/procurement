import { sql } from "drizzle-orm";
import { describe, expect, inject, it } from "vitest";

import { stockMismatch } from "@/domain/stock-check";
import { orderTotal } from "@/domain/order-totals";
import type { PaymentType } from "@/domain/payment-types";
import type { MovementType } from "@/domain/stock";
import { db } from "@/server/db/client";
import { stockCheck } from "@/server/jobs/stock-check";

import { type FillSizes, fill } from "./fill";

// The fill of build-plan 9.2 at a small scale (plan of 9.2, Tests, first line): it must write
// data the app's own checks accept, or the measurement measures nothing real.

const SMALL: FillSizes = {
  years: 1,
  branches: 2,
  ordersPerBranchYear: 100,
  productsWithSubtypes: 20,
  subtypesPerProduct: 3,
  departmentsPerBranch: 3,
  managers: 3,
};

const MOMENT = new Date("2026-10-15T07:00:00Z");

async function filled() {
  const client = await db.$client.connect();
  try {
    await client.query("begin");
    const counts = await fill((text, values) => client.query(text, values), MOMENT, SMALL);
    await client.query("commit");
    return counts;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

describe("the speed fill (build plan 9.2)", () => {
  it("writes orders, purchases and movements that the stock check and the totals accept", async () => {
    const counts = await filled();
    expect(counts.orders).toBe(200);
    expect(counts.purchases).toBeGreaterThan(50);
    expect(counts.stock_movements).toBeGreaterThan(counts.purchases!);

    // 09-warehouse.md, first paragraph: stock is the sum of every movement; the nightly check
    // (task 8.2) finds no mismatch, so it tells no Head.
    await db.transaction((tx) => stockCheck.run({ tx, tick: MOMENT }));
    const told = await db.execute(
      sql`select count(*)::int as n from notifications where type = 'STOCK_CHECK_MISMATCH'`,
    );
    expect(told.rows[0]!.n).toBe(0);

    // The same, read here: each balance is its movements replayed, never below 0.
    const balances = await db.execute<{
      qty: string;
      avg_cost: string;
      movements: { type: MovementType; qtyDelta: string; unitCost: string }[];
    }>(sql`
      select b.qty::text, b.avg_cost::text, json_agg(json_build_object('type', m.type,
        'qtyDelta', m.qty_delta::text, 'unitCost', m.unit_cost::text) order by m.seq) as movements
      from stock_balances b join stock_movements m using (branch_id, variant_id)
      group by b.branch_id, b.variant_id, b.qty, b.avg_cost`);
    expect(balances.rows.length).toBeGreaterThan(0);
    for (const row of balances.rows) {
      const movements = row.movements.map((m) => ({ ...m, unitCost: BigInt(m.unitCost) }));
      const found = { qty: row.qty, avgCost: BigInt(row.avg_cost) };
      expect(stockMismatch(movements, found)).toBeNull();
      expect(Number(row.qty)).toBeGreaterThanOrEqual(0);
    }

    // 08-money-and-settlement.md, Planned total: every order's total is orderTotal() of its plan.
    const orders = await db.execute<{
      quantity: string;
      price: string;
      payment_type: PaymentType;
      total: string;
      extras: string[];
    }>(sql`
      select o.planned_qty::text as quantity, o.planned_price::text as price, o.payment_type,
        o.planned_total::text as total,
        coalesce(array_agg(e.amount::text) filter (where e.id is not null), '{}') as extras
      from orders o left join order_extras e on e.order_id = o.id group by o.id`);
    for (const row of orders.rows) {
      const plan = {
        quantity: row.quantity,
        price: BigInt(row.price),
        extras: row.extras.map(BigInt),
        paymentType: row.payment_type,
      };
      expect(orderTotal(plan)).toBe(BigInt(row.total));
    }

    // 08 Closing: a closed order's cash count is 0 (its money rows less its cash spent).
    const open = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from orders o
      where o.status = 'CLOSED' and o.payment_type = 'CASH' and coalesce((
        select sum(case r.kind when 'CASH_RETURNED' then -r.amount else r.amount end)
        from money_rows r where r.order_id = o.id and r.kind in ('CASH_GIVEN', 'PAID_BACK',
          'CASH_RETURNED')), 0) <> coalesce(o.actual_total, 0)`);
    expect(open.rows[0]!.n).toBe(0);
  });

  it("writes the same counts every time (one seeded generator)", async () => {
    const first = await db.execute(sql`select
      (select count(*) from orders)::int as orders,
      (select count(*) from stock_movements)::int as movements,
      (select count(*) from order_events)::int as events`);
    // A second fill would meet the first one's unique names; the counts of one fill are compared
    // with a fresh fill's in a database of its own, so the same sizes give the same rows.
    const { createTestDatabase, dropTestDatabase } = await import("../helpers/test-database");
    const server = inject("databaseServerUrl");
    const other = await createTestDatabase(server, { fromTemplate: true });
    const pg = await import("pg");
    const client = new pg.default.Client({
      connectionString: other.url,
      options: "-c timezone=UTC",
    });
    await client.connect();
    try {
      await client.query("begin");
      await fill((text, values) => client.query(text, values), MOMENT, SMALL);
      await client.query("commit");
      const second = await client.query(`select
        (select count(*) from orders)::int as orders,
        (select count(*) from stock_movements)::int as movements,
        (select count(*) from order_events)::int as events`);
      expect(second.rows[0]).toEqual(first.rows[0]);
    } finally {
      await client.end();
      await dropTestDatabase(server, other.name);
    }
  });
});
