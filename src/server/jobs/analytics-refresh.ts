import { sql } from "drizzle-orm";

import { orderOutcome } from "@/domain/colours";
import type { PaymentType } from "@/domain/payment-types";
import { type PurchaseRecord, actualTotal, paymentParts } from "@/domain/purchases";
import type { OrderProgress } from "@/domain/purchases";
import type { RequestStatus } from "@/domain/request-status";
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
//
// Task 6.4a adds two tables, rewritten in the same run (plan of 6.4, decided item 12):
// `analytics_spending_payments`, each record's parts by payment type from `paymentParts()`
// (decided item 2, Look first), and `analytics_outcomes`, each order's Plan vs actual outcome from
// `orderOutcome()` of src/domain/colours.ts (decided items 3 to 6, Look first).

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
  payment_type: PaymentType;
  extras: { amount: string; payment_type: PaymentType }[];
};

type OutcomeSource = {
  order_id: string;
  branch_id: string;
  status: RequestStatus;
  progress: OrderProgress;
  ended_on: string | null;
  category_id: string;
  department_id: string;
  owner_id: string;
  planned_qty: string;
  planned_price: string;
  payment_type: PaymentType;
  plan_extras: string[];
  records: { qty: string; unit_price: string; extras: string[] }[];
};

/** The buying events of 07: the newest one is the day an order's buying last changed. */
const BUYING_EVENTS = ["RECORD_PURCHASE", "FINISH_ORDER", "MARK_NOT_BOUGHT", "CANCEL_PURCHASE"];

export async function refreshAnalytics(executor: Executor): Promise<void> {
  // One rewrite at a time: the scheduler's lock already holds a second instance back, and this
  // holds back any other caller (a browser test's own refresh) until the first commits, while the
  // pages go on reading.
  await executor.execute(
    sql`lock table analytics_spending, analytics_spending_payments, analytics_outcomes in exclusive mode`,
  );
  const found = await executor.execute<SpendingSource>(sql`
    select p.id as purchase_id, p.order_id, p.branch_id, t.purchased_on::text as purchased_on,
           pr.category_id, o.department_id, o.owner_id, t.supplier_id, p.qty, p.unit_price,
           t.payment_type,
           coalesce(jsonb_agg(jsonb_build_object('amount', e.amount::text,
                                                 'payment_type', e.payment_type) order by e.id)
                    filter (where e.id is not null), '[]') as extras
    from purchases p
    join purchase_trips t on t.id = p.trip_id
    join orders o on o.id = p.order_id
    join product_variants v on v.id = p.variant_id
    join products pr on pr.id = v.product_id
    left join purchase_extras e on e.purchase_id = p.id
    where not p.is_cancelled
    group by p.id, t.id, o.id, pr.id`);

  const parts: { purchase_id: string; payment_type: PaymentType; amount: string }[] = [];
  const rows = found.rows.map((row) => {
    const extras = row.extras.map((extra) => ({
      amount: BigInt(extra.amount),
      paymentType: extra.payment_type,
    }));
    const record: PurchaseRecord = {
      qty: row.qty,
      unitPrice: BigInt(row.unit_price),
      extras: extras.map((extra) => extra.amount),
      isCancelled: false,
    };
    for (const part of paymentParts({
      qty: row.qty,
      unitPrice: record.unitPrice,
      paymentType: row.payment_type,
      extras,
    })) {
      parts.push({
        purchase_id: row.purchase_id,
        payment_type: part.paymentType,
        amount: part.amount.toString(),
      });
    }
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

  await executor.execute(sql`delete from analytics_spending_payments`);
  await executor.execute(sql`delete from analytics_spending`);
  await executor.execute(sql`delete from analytics_outcomes`);
  if (rows.length > 0) await insertSpending(executor, rows, parts);
  await writeOutcomes(executor);
}

async function insertSpending(executor: Executor, rows: object[], parts: object[]) {
  await executor.execute(sql`
    insert into analytics_spending (purchase_id, order_id, branch_id, purchased_on, category_id,
                                    department_id, owner_id, supplier_id, amount)
    select r.purchase_id, r.order_id, r.branch_id, r.purchased_on, r.category_id,
           r.department_id, r.owner_id, r.supplier_id, r.amount::bigint
    from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as r(
      purchase_id uuid, order_id uuid, branch_id uuid, purchased_on date, category_id uuid,
      department_id uuid, owner_id uuid, supplier_id uuid, amount text)`);
  if (parts.length === 0) return;
  await executor.execute(sql`
    insert into analytics_spending_payments (purchase_id, payment_type, amount)
    select r.purchase_id, r.payment_type::payment_type, r.amount::bigint
    from jsonb_to_recordset(${JSON.stringify(parts)}::jsonb) as r(
      purchase_id uuid, payment_type text, amount text)`);
}

/** Every order whose buying ended, its outcome by orderOutcome() (decided items 3 to 6). */
async function writeOutcomes(executor: Executor) {
  const found = await executor.execute<OutcomeSource>(sql`
    select o.id as order_id, o.branch_id, o.status, o.progress, o.department_id, o.owner_id,
           pr.category_id, o.planned_qty, o.planned_price::text as planned_price, o.payment_type,
           (select (max(ev.created_at) at time zone 'Asia/Tashkent')::date::text
            from order_events ev
            where ev.order_id = o.id
              and ev.type::text in (${sql.join(
                BUYING_EVENTS.map((type) => sql`${type}`),
                sql`, `,
              )}))
             as ended_on,
           coalesce((select array_agg(x.amount::text order by x.id)
                     from order_extras x where x.order_id = o.id), '{}') as plan_extras,
           coalesce((select jsonb_agg(jsonb_build_object(
                              'qty', p.qty, 'unit_price', p.unit_price::text,
                              'extras', coalesce((select jsonb_agg(e.amount::text order by e.id)
                                                  from purchase_extras e
                                                  where e.purchase_id = p.id), '[]'))
                            order by p.id)
                     from purchases p where p.order_id = o.id and not p.is_cancelled), '[]')
             as records
    from orders o
    join product_variants v on v.id = o.variant_id
    join products pr on pr.id = v.product_id
    where o.progress in ('DONE', 'DONE_SHORT')`);

  const rows = found.rows.flatMap((row) => {
    const outcome = orderOutcome({
      status: row.status,
      progress: row.progress,
      plan: {
        quantity: row.planned_qty,
        price: BigInt(row.planned_price),
        extras: row.plan_extras.map((amount) => BigInt(amount)),
        paymentType: row.payment_type,
      },
      records: row.records.map((record) => ({
        qty: record.qty,
        unitPrice: BigInt(record.unit_price),
        extras: record.extras.map((amount) => BigInt(amount)),
        isCancelled: false,
      })),
    });
    // An ended order always has its buying events; one without (written past the actions) has no
    // day to fall on and is left out.
    if (!outcome || row.ended_on === null) return [];
    return [
      {
        order_id: row.order_id,
        branch_id: row.branch_id,
        ended_on: row.ended_on,
        category_id: row.category_id,
        department_id: row.department_id,
        owner_id: row.owner_id,
        colour: outcome.colour,
        planned: outcome.planned.toString(),
        actual: outcome.actual.toString(),
        difference: outcome.difference.toString(),
      },
    ];
  });
  if (rows.length === 0) return;
  await executor.execute(sql`
    insert into analytics_outcomes (order_id, branch_id, ended_on, category_id, department_id,
                                    owner_id, colour, planned, actual, difference)
    select r.order_id, r.branch_id, r.ended_on, r.category_id, r.department_id, r.owner_id,
           r.colour::outcome_colour, r.planned::bigint, r.actual::bigint, r.difference::bigint
    from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as r(
      order_id uuid, branch_id uuid, ended_on date, category_id uuid, department_id uuid,
      owner_id uuid, colour text, planned text, actual text, difference text)`);
}

/** Every 5 minutes, at the same ticks on every server (src/domain/schedule.ts). */
export const analyticsRefresh: Job = {
  name: "analytics_refresh",
  schedule: { everyMinutes: 5 },
  async run({ tx }) {
    await refreshAnalytics(tx);
  },
};
