import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { actualTotal } from "@/domain/purchases";
import { db } from "@/server/db/client";
import { recordsWhere } from "@/features/purchasing/order-records";

import { bought, refreshNow, spendingScene } from "../../../tests/helpers/analytics";
import { setClock } from "../../../tests/helpers/clock";
import type { Job } from "./job";
import { analyticsRefresh } from "./analytics-refresh";
import { JOBS } from "./registry";
import { runDueJobs } from "./run-due";

// The analytics refresh (build-plan 6.3; 10-notifications-analytics-reports.md, Analytics page per
// role, point 5: "Summary tables are refreshed every 5 minutes"; developer-rules.md rules 1 and 12;
// 08 Actual total; plan of 6.3, decided items 1, 5 and 7).

type Row = {
  purchase_id: string;
  order_id: string;
  branch_id: string;
  purchased_on: string;
  category_id: string;
  department_id: string;
  owner_id: string;
  supplier_id: string | null;
  amount: string;
};

async function rowsOf(branchId: string): Promise<Row[]> {
  const found = await db.execute<Row>(sql`
    select purchase_id, order_id, branch_id, purchased_on::text as purchased_on, category_id,
           department_id, owner_id, supplier_id, amount::text as amount
    from analytics_spending where branch_id = ${branchId} order by purchase_id`);
  return found.rows;
}

describe("analytics_refresh (10 point 5; developer-rules rule 12)", () => {
  it("is a job of the registry, every 5 minutes", () => {
    expect(JOBS).toContain(analyticsRefresh);
    expect(analyticsRefresh.schedule).toEqual({ everyMinutes: 5 });
  });

  it("writes each record not cancelled once, its amount actualTotal() of that record", async () => {
    setClock("2031-05-15T05:00:00Z");
    const scene = await spendingScene();
    // 2.5 × 3 333 = 8 332.5 → 8 333, + 1 000 extra: 9 333 (the review's worked example).
    const a = await bought(scene, {
      purchasedOn: "2031-05-02",
      qty: "2.500",
      unitPrice: "3333",
      extras: [1_000n],
    });
    const b = await bought(scene, {
      purchasedOn: "2031-04-30",
      qty: "0.001",
      unitPrice: "400",
      supplierId: null,
    });
    // Kept out: a cancelled record with every other value the same as `a` (D40).
    await bought(scene, {
      purchasedOn: "2031-05-02",
      qty: "2.500",
      unitPrice: "3333",
      extras: [1_000n],
      cancelled: true,
    });

    await refreshNow();
    const rows = await rowsOf(scene.branch.id);
    expect(rows).toHaveLength(2);
    const byId = new Map(rows.map((row) => [row.purchase_id, row]));
    expect(byId.get(a.purchaseId)).toMatchObject({
      order_id: a.orderId,
      purchased_on: "2031-05-02",
      category_id: scene.category.id,
      department_id: scene.department.id,
      owner_id: scene.manager.id,
      supplier_id: scene.supplier.id,
      amount: "9333",
    });
    expect(byId.get(b.purchaseId)).toMatchObject({ supplier_id: null, amount: "0" });

    // Each amount is the domain's Actual total of that record read from the source tables.
    for (const row of rows) {
      const records = await recordsWhere(db, sql`p.id = ${row.purchase_id}`);
      expect(BigInt(row.amount)).toBe(actualTotal(records));
    }
  });

  it("a second run gives the same rows, and a record cancelled since leaves", async () => {
    const scene = await spendingScene();
    const kept = await bought(scene, { purchasedOn: "2031-05-03", unitPrice: "7000" });
    const later = await bought(scene, { purchasedOn: "2031-05-03", unitPrice: "8000" });
    await refreshNow();
    const first = await rowsOf(scene.branch.id);
    await refreshNow();
    expect(await rowsOf(scene.branch.id)).toEqual(first);

    await db.execute(sql`update purchases set is_cancelled = true, cancel_reason = 'Xato kiritildi',
      cancelled_by = ${scene.manager.id}, cancelled_at = now() where id = ${later.purchaseId}`);
    await refreshNow();
    expect((await rowsOf(scene.branch.id)).map((row) => row.purchase_id)).toEqual([
      kept.purchaseId,
    ]);
  });

  it("a run that fails leaves the rows of the last good run (the savepoint, rule 3)", async () => {
    setClock("2031-05-15T06:00:00Z");
    const scene = await spendingScene();
    await bought(scene, { purchasedOn: "2031-05-04" });
    await refreshNow();
    const before = await rowsOf(scene.branch.id);
    expect(before).toHaveLength(1);
    await bought(scene, { purchasedOn: "2031-05-04" });

    // The real refresh, then a failure in the same run.
    const failing: Job = {
      ...analyticsRefresh,
      async run(context) {
        await analyticsRefresh.run(context);
        throw new Error("invented failure");
      },
    };
    expect(await runDueJobs([failing])).toEqual({ analytics_refresh: "failed" });
    expect(await rowsOf(scene.branch.id)).toEqual(before);

    setClock("2031-05-15T06:05:00Z");
    expect(await runDueJobs([analyticsRefresh])).toEqual({ analytics_refresh: "ran" });
    expect(await rowsOf(scene.branch.id)).toHaveLength(2);
  });
});
