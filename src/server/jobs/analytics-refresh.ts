import { sql } from "drizzle-orm";

import { type PurchaseRecord, actualTotal } from "@/domain/purchases";
import type { Executor } from "@/server/authorize";

import type { Job } from "./job";

// The analytics refresh (10-notifications-analytics-reports.md, Analytics page per role, point 5:
// "Summary tables are refreshed every 5 minutes"; 13-technology.md, Scheduled jobs; developer-
// rules.md rule 12). Task 6.3. It runs as the system, in the savepoint of its scheduler lock
// (src/server/jobs/run-due.ts), so a run that throws leaves the rows of the last good run, and the
// pages read the old rows until it commits (plan of 6.3, decided item 1, Look first).
//
// `analytics_spending`: one row per purchase record that is not cancelled, its amount the Actual
// total of that one record, `actualTotal()` of src/domain/purchases.ts: 08 rounds each record on
// its own, so a sum of the rows is the Actual total of the set and no formula is written in SQL
// (developer-rules.md rule 1). The rows are derived: each run deletes and writes them all
// (decided item 7). One read and one write, whatever the number of records (rule 12).

type SpendingSource = {
  purchase_id: string;
  order_id: string;
  branch_id: string;
  purchased_on: string;
  category_id: string;
  department_id: string;
  owner_id: string;
  supplier_id: string | null;
  qty: string;
  unit_price: string;
  extras: string[];
};

export async function refreshAnalytics(executor: Executor): Promise<void> {
  const found = await executor.execute<SpendingSource>(sql`
    select p.id as purchase_id, p.order_id, p.branch_id, t.purchased_on::text as purchased_on,
           pr.category_id, o.department_id, o.owner_id, t.supplier_id, p.qty, p.unit_price,
           coalesce(array_agg(e.amount::text order by e.id)
                    filter (where e.id is not null), '{}') as extras
    from purchases p
    join purchase_trips t on t.id = p.trip_id
    join orders o on o.id = p.order_id
    join product_variants v on v.id = p.variant_id
    join products pr on pr.id = v.product_id
    left join purchase_extras e on e.purchase_id = p.id
    where not p.is_cancelled
    group by p.id, t.id, o.id, pr.id`);

  const rows = found.rows.map((row) => {
    const record: PurchaseRecord = {
      qty: row.qty,
      unitPrice: BigInt(row.unit_price),
      extras: row.extras.map((amount) => BigInt(amount)),
      isCancelled: false,
    };
    return {
      purchase_id: row.purchase_id,
      order_id: row.order_id,
      branch_id: row.branch_id,
      purchased_on: row.purchased_on,
      category_id: row.category_id,
      department_id: row.department_id,
      owner_id: row.owner_id,
      supplier_id: row.supplier_id,
      // Text, so no JavaScript number holds the so'm (CLAUDE.md rule 6).
      amount: actualTotal([record]).toString(),
    };
  });

  await executor.execute(sql`delete from analytics_spending`);
  if (rows.length === 0) return;
  await executor.execute(sql`
    insert into analytics_spending (purchase_id, order_id, branch_id, purchased_on, category_id,
                                    department_id, owner_id, supplier_id, amount)
    select r.purchase_id, r.order_id, r.branch_id, r.purchased_on, r.category_id,
           r.department_id, r.owner_id, r.supplier_id, r.amount::bigint
    from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as r(
      purchase_id uuid, order_id uuid, branch_id uuid, purchased_on date, category_id uuid,
      department_id uuid, owner_id uuid, supplier_id uuid, amount text)`);
}

/** Every 5 minutes, at the same ticks on every server (src/domain/schedule.ts). */
export const analyticsRefresh: Job = {
  name: "analytics_refresh",
  schedule: { everyMinutes: 5 },
  async run({ tx }) {
    await refreshAnalytics(tx);
  },
};
