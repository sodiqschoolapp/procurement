import { sql } from "drizzle-orm";

import { reasonKey } from "@/domain/analytics";
import { type StayEvent, approvalStays } from "@/domain/approval-stays";
import { orderOutcome } from "@/domain/colours";
import {
  type DatedCashRecord,
  type DatedMoneyRow,
  type MoneyRowKind,
  cashSince,
  orderCashCount,
} from "@/domain/money-ledger";
import type { PaymentType } from "@/domain/payment-types";
import { type PurchaseRecord, actualGoods, actualTotal, paymentParts } from "@/domain/purchases";
import type { OrderProgress } from "@/domain/purchases";
import type { RequestStatus } from "@/domain/request-status";
import { isLow, stockValue } from "@/domain/stock";
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
//
// Task 6.4b adds, in the same run (plan of 6.4b): each spending row's subtype bought, quantity,
// unit price, entry time and goods `actualGoods()` of the one record (decided items 1 and 13, Look
// first), and `analytics_steps`, the stays of every order at the approval steps from
// `approvalStays()` of src/domain/approval-stays.ts (decided items 6 to 10, Look first), the open
// ones included (review of the plan, Must fix 3).
//
// Task 6.4c adds, in the same run (plan of 6.4c, decided items 4, 5 and 8, Look first):
// `analytics_cancelled`, each cancelled record with its total as entered (`actualTotal()` of the
// record read as live), and `analytics_cash`, each order's cash count `orderCashCount()` and its
// date since when `cashSince()` of src/domain/money-ledger.ts, the functions Money with managers
// calls (08 Money ledger; plan of 4.9). src/server does not import src/features, so the rows and
// records are read here; a database test keeps this reader equal to that page's.
//
// Task 6.4d adds, in the same run (plan of 6.4d, decided items 1 to 7 and 9, Look first):
// `analytics_stock`, each stock line of a product with its value `stockValue()` and `isLow()` of
// src/domain/stock.ts, the functions Stock on hand calls, and the date of its newest movement; and
// `analytics_stock_moves`, each issue, return and write-off movement of a document not Reversed,
// on the document's date, its value `stockValue()` of its size at the cost it moved at.
//
// Task 6.5a adds, in the same run (plan of 6.5a, decided items 2, 3 and 6, Look first):
// `analytics_orders`, each order that is not Draft with its status, buying progress, first submit
// date and needed-by date, copied as they stand (no formula: coming up and overdue are read with
// the clock by the queries, `isComingUp()` and `isOverdue()` of src/domain/order-steps.ts); and the
// decider of each decided stay, the actor of the event that ended it.

type SpendingSource = {
  purchase_id: string;
  order_id: string;
  branch_id: string;
  purchased_on: string;
  category_id: string;
  department_id: string;
  owner_id: string;
  supplier_id: string | null;
  variant_id: string;
  created_at: string;
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
    sql`lock table analytics_spending, analytics_spending_payments, analytics_outcomes,
               analytics_steps, analytics_cancelled, analytics_cash, analytics_stock,
               analytics_stock_moves, analytics_orders in exclusive mode`,
  );
  const found = await executor.execute<SpendingSource>(sql`
    select p.id as purchase_id, p.order_id, p.branch_id, t.purchased_on::text as purchased_on,
           pr.category_id, o.department_id, o.owner_id, t.supplier_id, p.variant_id,
           to_json(p.created_at)#>>'{}' as created_at, p.qty, p.unit_price, t.payment_type,
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
      variant_id: row.variant_id,
      qty: row.qty,
      unit_price: record.unitPrice.toString(),
      goods: actualGoods([record]).toString(),
      created_at: row.created_at,
    };
  });

  await executor.execute(sql`delete from analytics_spending_payments`);
  await executor.execute(sql`delete from analytics_spending`);
  await executor.execute(sql`delete from analytics_outcomes`);
  await executor.execute(sql`delete from analytics_steps`);
  await executor.execute(sql`delete from analytics_cancelled`);
  await executor.execute(sql`delete from analytics_cash`);
  await executor.execute(sql`delete from analytics_stock`);
  await executor.execute(sql`delete from analytics_stock_moves`);
  await executor.execute(sql`delete from analytics_orders`);
  if (rows.length > 0) await insertSpending(executor, rows, parts);
  await writeOutcomes(executor);
  await writeSteps(executor);
  await writeCancelled(executor);
  await writeCash(executor);
  await writeStock(executor);
  await writeStockMoves(executor);
  await writeOrders(executor);
}

/**
 * Every order that is not Draft as it stands (plan of 6.5a, decided items 2 and 6): the Tashkent
 * date of its first submit, its needed-by date, the planned subtype's category. Nothing is worked
 * out here: the queries read the dates with the clock.
 */
async function writeOrders(executor: Executor) {
  await executor.execute(sql`
    insert into analytics_orders (order_id, branch_id, status, progress, submitted_on, needed_by,
                                  category_id, department_id, owner_id)
    select o.id, o.branch_id, o.status, o.progress,
           (o.submitted_at at time zone 'Asia/Tashkent')::date, o.needed_by, pr.category_id,
           o.department_id, o.owner_id
    from orders o
    join product_variants v on v.id = o.variant_id
    join products pr on pr.id = v.product_id
    where o.status <> 'DRAFT'`);
}

async function insertSpending(executor: Executor, rows: object[], parts: object[]) {
  await executor.execute(sql`
    insert into analytics_spending (purchase_id, order_id, branch_id, purchased_on, category_id,
                                    department_id, owner_id, supplier_id, amount, variant_id, qty,
                                    unit_price, goods, created_at)
    select r.purchase_id, r.order_id, r.branch_id, r.purchased_on, r.category_id,
           r.department_id, r.owner_id, r.supplier_id, r.amount::bigint, r.variant_id,
           r.qty::numeric, r.unit_price::bigint, r.goods::bigint, r.created_at
    from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as r(
      purchase_id uuid, order_id uuid, branch_id uuid, purchased_on date, category_id uuid,
      department_id uuid, owner_id uuid, supplier_id uuid, amount text, variant_id uuid, qty text,
      unit_price text, goods text, created_at timestamptz)`);
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

type StepSource = {
  order_id: string;
  branch_id: string;
  category_id: string;
  department_id: string;
  owner_id: string;
  events: {
    type: StayEvent["type"];
    from: RequestStatus;
    to: RequestStatus;
    at: string;
    reason: string | null;
    actor: string;
  }[];
};

/**
 * The stays of every order that has reached an approval step (plan of 6.4b, decided items 6 to
 * 10). The Tashkent date a stay ended on is read by PostgreSQL from its end, as `ended_on` above;
 * the seconds, the decision and the reason key come from the domain.
 */
async function writeSteps(executor: Executor) {
  const found = await executor.execute<StepSource>(sql`
    select o.id as order_id, o.branch_id, pr.category_id, o.department_id, o.owner_id,
           jsonb_agg(jsonb_build_object('type', ev.type, 'from', ev.from_status,
                                        'to', ev.to_status, 'at', ev.created_at,
                                        'reason', a.reason, 'actor', ev.actor_id)
                     order by ev.created_at) as events
    from orders o
    join product_variants v on v.id = o.variant_id
    join products pr on pr.id = v.product_id
    join order_events ev on ev.order_id = o.id
    join order_actions a on a.id = ev.action_id
    where exists (select 1 from order_events s
                  where s.order_id = o.id
                    and s.to_status in ('PENDING_HEAD', 'PENDING_PRINCIPAL', 'PENDING_FINANCE'))
    group by o.id, pr.id`);

  const rows = found.rows.flatMap((row) =>
    approvalStays(
      row.events.map((event) => ({
        type: event.type,
        from: event.from,
        to: event.to,
        at: new Date(event.at),
        reason: event.reason,
        actorId: event.actor,
      })),
    ).map((stay) => ({
      order_id: row.order_id,
      branch_id: row.branch_id,
      step: stay.step,
      entered_at: stay.enteredAt.toISOString(),
      left_at: stay.leftAt?.toISOString() ?? null,
      seconds: stay.seconds?.toString() ?? null,
      decision: stay.decision,
      reason: stay.reason,
      reason_key: stay.reason === null ? null : reasonKey(stay.reason),
      decided_by: stay.decidedBy,
      category_id: row.category_id,
      department_id: row.department_id,
      owner_id: row.owner_id,
    })),
  );
  if (rows.length === 0) return;
  await executor.execute(sql`
    insert into analytics_steps (order_id, branch_id, step, entered_at, left_at, left_on, seconds,
                                 decision, reason, reason_key, decided_by, category_id,
                                 department_id, owner_id)
    select r.order_id, r.branch_id, r.step::request_status, r.entered_at, r.left_at,
           (r.left_at at time zone 'Asia/Tashkent')::date, r.seconds::bigint,
           r.decision::order_event_type, r.reason, r.reason_key, r.decided_by,
           r.category_id, r.department_id, r.owner_id
    from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as r(
      order_id uuid, branch_id uuid, step text, entered_at timestamptz, left_at timestamptz,
      seconds text, decision text, reason text, reason_key text, decided_by uuid,
      category_id uuid, department_id uuid, owner_id uuid)`);
}

type CancelledSource = {
  purchase_id: string;
  order_id: string;
  branch_id: string;
  cancelled_on: string;
  category_id: string;
  department_id: string;
  owner_id: string;
  supplier_id: string | null;
  qty: string;
  unit_price: string;
  extras: string[];
};

/**
 * Every cancelled record (plan of 6.4c, decided item 5, Look first): the Tashkent date of its
 * cancel, read by PostgreSQL as `left_on` above; its total as it was entered, `actualTotal()` of
 * the record read as live, since `actualTotal()` leaves a cancelled record out (review of the
 * plan, Must fix 1). Category the bought subtype's, supplier the trip's, as analytics_spending.
 */
async function writeCancelled(executor: Executor) {
  const found = await executor.execute<CancelledSource>(sql`
    select p.id as purchase_id, p.order_id, p.branch_id,
           (p.cancelled_at at time zone 'Asia/Tashkent')::date::text as cancelled_on,
           pr.category_id, o.department_id, o.owner_id, t.supplier_id, p.qty,
           p.unit_price::text as unit_price,
           coalesce((select array_agg(e.amount::text order by e.id)
                     from purchase_extras e where e.purchase_id = p.id), '{}') as extras
    from purchases p
    join purchase_trips t on t.id = p.trip_id
    join orders o on o.id = p.order_id
    join product_variants v on v.id = p.variant_id
    join products pr on pr.id = v.product_id
    where p.is_cancelled`);
  if (found.rows.length === 0) return;
  const rows = found.rows.map(({ qty, unit_price, extras, ...row }) => ({
    ...row,
    amount: actualTotal([
      {
        qty,
        unitPrice: BigInt(unit_price),
        extras: extras.map((amount) => BigInt(amount)),
        isCancelled: false,
      },
    ]).toString(),
  }));
  await executor.execute(sql`
    insert into analytics_cancelled (purchase_id, order_id, branch_id, cancelled_on, category_id,
                                     department_id, owner_id, supplier_id, amount)
    select r.purchase_id, r.order_id, r.branch_id, r.cancelled_on, r.category_id,
           r.department_id, r.owner_id, r.supplier_id, r.amount::bigint
    from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as r(
      purchase_id uuid, order_id uuid, branch_id uuid, cancelled_on date, category_id uuid,
      department_id uuid, owner_id uuid, supplier_id uuid, amount text)`);
}

type CashSource = {
  order_id: string;
  branch_id: string;
  owner_id: string;
  category_id: string;
  department_id: string;
  rows: { kind: MoneyRowKind; amount: string; is_cancelled: boolean; occurred_on: string }[];
  records: {
    variant_id: string;
    qty: string;
    unit_price: string;
    payment_type: PaymentType;
    purchased_on: string;
    is_cancelled: boolean;
    extras: { amount: string; payment_type: PaymentType }[];
  }[];
};

/**
 * Every order with a cash count away from 0 (plan of 6.4c, decided items 4 and 8, Look first):
 * the orders Money with managers reads (not Draft, not Closed, with a money row or a record), each
 * money row with its action's cancel mark and date, each record with its trip's payment type and
 * date and each extra with its own type, as `datedMoneyRowsOf()` and `datedCashRecordsOf()` read
 * them; the count and the date from the domain.
 */
async function writeCash(executor: Executor) {
  const found = await executor.execute<CashSource>(sql`
    select o.id as order_id, o.branch_id, o.owner_id, pr.category_id, o.department_id,
           coalesce((select jsonb_agg(jsonb_build_object(
                              'kind', r.kind, 'amount', r.amount::text,
                              'is_cancelled', a.is_cancelled,
                              'occurred_on', a.occurred_on::text) order by r.id)
                     from money_rows r join money_actions a on a.id = r.money_action_id
                     where r.order_id = o.id), '[]') as rows,
           coalesce((select jsonb_agg(jsonb_build_object(
                              'variant_id', p.variant_id, 'qty', p.qty,
                              'unit_price', p.unit_price::text, 'payment_type', t.payment_type,
                              'purchased_on', t.purchased_on::text,
                              'is_cancelled', p.is_cancelled,
                              'extras', coalesce((select jsonb_agg(jsonb_build_object(
                                                           'amount', e.amount::text,
                                                           'payment_type', e.payment_type)
                                                         order by e.id)
                                                  from purchase_extras e
                                                  where e.purchase_id = p.id), '[]'))
                            order by p.id)
                     from purchases p join purchase_trips t on t.id = p.trip_id
                     where p.order_id = o.id), '[]') as records
    from orders o
    join product_variants v on v.id = o.variant_id
    join products pr on pr.id = v.product_id
    where o.status not in ('DRAFT', 'CLOSED')
      and (exists (select 1 from money_rows r where r.order_id = o.id)
           or exists (select 1 from purchases p where p.order_id = o.id))`);

  const rows = found.rows.flatMap((row) => {
    const dated: DatedMoneyRow[] = row.rows.map((each) => ({
      row: { kind: each.kind, amount: BigInt(each.amount), isCancelled: each.is_cancelled },
      occurredOn: each.occurred_on,
    }));
    const bought: DatedCashRecord[] = row.records.map((each) => ({
      record: {
        variantId: each.variant_id,
        qty: each.qty,
        unitPrice: BigInt(each.unit_price),
        paymentType: each.payment_type,
        extras: each.extras.map((extra) => ({
          amount: BigInt(extra.amount),
          paymentType: extra.payment_type,
        })),
        isCancelled: each.is_cancelled,
      },
      purchasedOn: each.purchased_on,
    }));
    const cashCount = orderCashCount(
      dated.map((each) => each.row),
      bought.map((each) => each.record),
    );
    if (cashCount === 0n) return [];
    const since = cashSince(dated, bought);
    // A count away from 0 has a movement that made it so, as Money with managers says.
    if (since === null) throw new Error(`Order ${row.order_id} has a cash count and no movement`);
    return [
      {
        order_id: row.order_id,
        branch_id: row.branch_id,
        owner_id: row.owner_id,
        category_id: row.category_id,
        department_id: row.department_id,
        cash_count: cashCount.toString(),
        since,
      },
    ];
  });
  if (rows.length === 0) return;
  await executor.execute(sql`
    insert into analytics_cash (order_id, branch_id, owner_id, category_id, department_id,
                                cash_count, since)
    select r.order_id, r.branch_id, r.owner_id, r.category_id, r.department_id,
           r.cash_count::bigint, r.since
    from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as r(
      order_id uuid, branch_id uuid, owner_id uuid, category_id uuid, department_id uuid,
      cash_count text, since date)`);
}

type StockSource = {
  branch_id: string;
  variant_id: string;
  category_id: string;
  qty: string;
  avg_cost: string;
  min_qty: string | null;
  last_moved_on: string | null;
};

/**
 * Every stock line of a product, the rows Stock on hand lists (plan of 6.4d, decided items 1, 3
 * and 7, Look first): its value by `stockValue()`, Low by `isLow()` against its minimum, and the
 * Tashkent date of its newest movement of any type, read by PostgreSQL as `left_on` above.
 */
async function writeStock(executor: Executor) {
  const found = await executor.execute<StockSource>(sql`
    select sb.branch_id, sb.variant_id, pr.category_id, sb.qty::text as qty,
           sb.avg_cost::text as avg_cost, sm.min_qty::text as min_qty,
           (select (max(m.created_at) at time zone 'Asia/Tashkent')::date::text
            from stock_movements m
            where m.branch_id = sb.branch_id and m.variant_id = sb.variant_id) as last_moved_on
    from stock_balances sb
    join product_variants v on v.id = sb.variant_id
    join products pr on pr.id = v.product_id
    left join stock_minimums sm on sm.branch_id = sb.branch_id and sm.variant_id = sb.variant_id
    where pr.type = 'GOODS'`);
  if (found.rows.length === 0) return;
  const rows = found.rows.map((row) => ({
    ...row,
    value: stockValue(row.qty, BigInt(row.avg_cost)).toString(),
    low: isLow(row.qty, row.min_qty),
  }));
  await executor.execute(sql`
    insert into analytics_stock (branch_id, variant_id, category_id, qty, avg_cost, value, min_qty,
                                 low, last_moved_on)
    select r.branch_id, r.variant_id, r.category_id, r.qty::numeric, r.avg_cost::bigint,
           r.value::bigint, r.min_qty::numeric, r.low, r.last_moved_on
    from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as r(
      branch_id uuid, variant_id uuid, category_id uuid, qty text, avg_cost text, value text,
      min_qty text, low boolean, last_moved_on date)`);
}

type StockMoveSource = {
  movement_id: string;
  document_id: string;
  branch_id: string;
  department_id: string | null;
  category_id: string;
  variant_id: string;
  type: "ISSUE" | "RETURN" | "WRITE_OFF";
  moved_on: string;
  qty: string;
  unit_cost: string;
};

/**
 * Every issue, return and approved write-off movement of a document that is not Reversed (plan of
 * 6.4d, decided items 4 and 5, Look first): a Reversed document is left out with its reversal (a
 * REVERSAL movement, never read here), on the document's date; its size and its value at the cost
 * it moved at, `stockValue()` (09 Stock value: the average at that moment).
 */
async function writeStockMoves(executor: Executor) {
  const found = await executor.execute<StockMoveSource>(sql`
    select m.id as movement_id, d.id as document_id, d.branch_id, d.department_id,
           pr.category_id, m.variant_id, m.type, d.doc_date::text as moved_on,
           abs(m.qty_delta)::text as qty, m.unit_cost::text as unit_cost
    from stock_movements m
    join stock_document_lines l on l.id = m.document_line_id
    join stock_documents d on d.id = l.document_id
    join product_variants v on v.id = m.variant_id
    join products pr on pr.id = v.product_id
    where m.type in ('ISSUE', 'RETURN', 'WRITE_OFF') and d.status <> 'REVERSED'`);
  if (found.rows.length === 0) return;
  const rows = found.rows.map(({ unit_cost, ...row }) => ({
    ...row,
    value: stockValue(row.qty, BigInt(unit_cost)).toString(),
  }));
  await executor.execute(sql`
    insert into analytics_stock_moves (movement_id, document_id, branch_id, department_id,
                                       category_id, variant_id, type, moved_on, qty, value)
    select r.movement_id, r.document_id, r.branch_id, r.department_id, r.category_id,
           r.variant_id, r.type::stock_movement_type, r.moved_on, r.qty::numeric, r.value::bigint
    from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as r(
      movement_id uuid, document_id uuid, branch_id uuid, department_id uuid, category_id uuid,
      variant_id uuid, type text, moved_on date, qty text, value text)`);
}

/** Every 5 minutes, at the same ticks on every server (src/domain/schedule.ts). */
export const analyticsRefresh: Job = {
  name: "analytics_refresh",
  schedule: { everyMinutes: 5 },
  async run({ tx }) {
    await refreshAnalytics(tx);
  },
};
