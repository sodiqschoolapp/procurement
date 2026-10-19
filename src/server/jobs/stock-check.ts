import { and, eq, sql } from "drizzle-orm";

import type { MovementType } from "@/domain/stock";
import { type StockMismatch, stockMismatch } from "@/domain/stock-check";
import { now } from "@/server/clock";
import { users } from "@/server/db/schema";
import { notify } from "@/server/notify";

import type { Job } from "./job";

// The nightly stock check (build-plan 8.2; 14-data-model.md, Notes for the build, first bullet:
// "A nightly job recomputes it from the movements and reports any mismatch"; 13-technology.md,
// Scheduled jobs). Daily at 03:00 in Tashkent (plan of 8.2, decided item 5). It runs as the system
// (plan of 0.13, decision 1): no user, no authorize().
//
// Every branch's movements and balances are read in ONE statement, so they come from one snapshot
// and a movement posted during the check (with its balance, in one transaction) is seen with its
// balance or not at all. Each branch-and-subtype item is replayed by stockMismatch() of
// src/domain/stock-check.ts. The check corrects nothing (decided item 1, Look first): a mismatch is
// one bell notification to every active Head, with the number of items, and one log line per item
// with ids and numbers only.

type CheckedRow = {
  branch_id: string;
  variant_id: string;
  qty: string | null;
  avg_cost: string | null;
  movements: { type: MovementType; qtyDelta: string; unitCost: string }[];
};

/** One log line of a mismatch: ids and numbers, never a name. */
function describeMismatch(row: CheckedRow, mismatch: StockMismatch): string {
  const expected =
    mismatch.expected === "below_zero"
      ? "movements below 0"
      : `${mismatch.expected.qty} at ${mismatch.expected.avgCost}`;
  const found = mismatch.found ? `${mismatch.found.qty} at ${mismatch.found.avgCost}` : "no row";
  return (
    `Stock check: branch ${row.branch_id}, subtype ${row.variant_id}: ` +
    `movements give ${expected}, stock_balances holds ${found}.`
  );
}

export const stockCheck: Job = {
  name: "stock_check",
  schedule: { dailyAt: "03:00" },
  async run({ tx }) {
    const { rows } = await tx.execute<CheckedRow>(sql`
      with movements as (
        select branch_id, variant_id,
          json_agg(json_build_object(
            'type', type, 'qtyDelta', qty_delta::text, 'unitCost', unit_cost::text
          ) order by seq) as movements
        from stock_movements
        group by branch_id, variant_id
      )
      select coalesce(b.branch_id, m.branch_id) as branch_id,
        coalesce(b.variant_id, m.variant_id) as variant_id,
        b.qty::text as qty, b.avg_cost::text as avg_cost,
        coalesce(m.movements, '[]'::json) as movements
      from stock_balances b
      full outer join movements m on m.branch_id = b.branch_id and m.variant_id = b.variant_id
    `);

    let count = 0;
    for (const row of rows) {
      const movements = row.movements.map((movement) => ({
        type: movement.type,
        qtyDelta: movement.qtyDelta,
        unitCost: BigInt(movement.unitCost),
      }));
      const found =
        row.qty === null || row.avg_cost === null
          ? null
          : { qty: row.qty, avgCost: BigInt(row.avg_cost) };
      const mismatch = stockMismatch(movements, found);
      if (mismatch === null) continue;
      count += 1;
      console.error(describeMismatch(row, mismatch));
    }
    if (count === 0) return;

    const heads = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "HEAD"), eq(users.isActive, true)));
    await notify(
      { tx, userId: null },
      {
        to: heads.map((head) => head.id),
        type: "STOCK_CHECK_MISMATCH",
        params: { count },
        branchId: null,
        link: "/warehouse/stock",
        at: now(),
      },
    );
  },
};
