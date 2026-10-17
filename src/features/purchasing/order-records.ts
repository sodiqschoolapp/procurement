import { type SQL, sql } from "drizzle-orm";

import type { CashRecord } from "@/domain/money-ledger";
import type { PaymentType } from "@/domain/payment-types";
import type { PurchaseRecord } from "@/domain/purchases";
import type { Executor } from "@/server/authorize";

// The purchase records of orders with their extra costs, as the domain functions of
// src/domain/purchases.ts read them (progress 3.2, "For 3.3 and 3.5": the actual numbers come from
// the records, never a stored sum). Cancelled records are read too: the domain leaves them out, so
// "not cancelled" is written once (08; review of the plan of 3.5, Should fix 5). The caller has
// authorized its read or its action; this reads orders it already found behind their walls.

type RecordRow = {
  order_id: string;
  qty: string;
  unit_price: string;
  is_cancelled: boolean;
  extras: string[];
};

/** The records of the orders `orderIn` names (an SQL list or subquery in parentheses), by order. */
async function recordsIn(executor: Executor, orderIn: SQL): Promise<Map<string, PurchaseRecord[]>> {
  const found = await executor.execute<RecordRow>(sql`
    select p.order_id, p.qty, p.unit_price, p.is_cancelled,
           coalesce(array_agg(e.amount::text order by e.id)
                    filter (where e.id is not null), '{}') as extras
    from purchases p
    left join purchase_extras e on e.purchase_id = p.id
    where p.order_id in ${orderIn}
    group by p.id
    order by p.order_id, p.created_at, p.id`);
  const byOrder = new Map<string, PurchaseRecord[]>();
  for (const row of found.rows) {
    const list = byOrder.get(row.order_id) ?? [];
    list.push({
      qty: row.qty,
      unitPrice: BigInt(row.unit_price),
      extras: row.extras.map((amount) => BigInt(amount)),
      isCancelled: row.is_cancelled,
    });
    byOrder.set(row.order_id, list);
  }
  return byOrder;
}

export async function orderRecords(executor: Executor, orderId: string): Promise<PurchaseRecord[]> {
  return (await recordsOfOrders(executor, [orderId])).get(orderId) ?? [];
}

/**
 * The records of orders by id: the ticked orders of one action (at most 200), or the orders of one
 * page of the list, as many as their extras (plan of 3.8).
 */
export async function recordsOfOrders(
  executor: Executor,
  orderIds: readonly string[],
): Promise<Map<string, PurchaseRecord[]>> {
  if (orderIds.length === 0) return new Map();
  const list = sql.join(
    orderIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  return recordsIn(executor, sql`(${list})`);
}

/**
 * The records of every order a subquery of ids holds: the download's orders, with no cap, so a
 * long list never meets a bound-parameter limit (review of the plan of 3.5, Should fix 4).
 */
export async function recordsOfListed(
  executor: Executor,
  listed: SQL,
): Promise<Map<string, PurchaseRecord[]>> {
  return recordsIn(executor, listed);
}

/**
 * The records of orders with the payment types cash spent needs (progress 4.1, "For 4.2, 4.3,
 * 4.5": a record's goods are paid by its trip's payment type, each extra by its own), cancelled
 * ones included, for `orderCashCount()` of src/domain/money-ledger.ts.
 */
export async function cashRecordsOf(
  executor: Executor,
  orderIds: readonly string[],
): Promise<Map<string, CashRecord[]>> {
  const byOrder = new Map<string, CashRecord[]>();
  if (orderIds.length === 0) return byOrder;
  const list = sql.join(
    orderIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const found = await executor.execute<{
    order_id: string;
    variant_id: string;
    qty: string;
    unit_price: string;
    payment_type: PaymentType;
    is_cancelled: boolean;
    extras: { amount: string; payment_type: PaymentType }[];
  }>(sql`
    select p.order_id, p.variant_id, p.qty, p.unit_price, t.payment_type, p.is_cancelled,
           coalesce(json_agg(json_build_object('amount', e.amount::text,
                                               'payment_type', e.payment_type) order by e.id)
                    filter (where e.id is not null), '[]') as extras
    from purchases p
    join purchase_trips t on t.id = p.trip_id
    left join purchase_extras e on e.purchase_id = p.id
    where p.order_id in (${list})
    group by p.id, t.payment_type
    order by p.order_id, p.created_at, p.id`);
  for (const row of found.rows) {
    const list = byOrder.get(row.order_id) ?? [];
    list.push({
      variantId: row.variant_id,
      qty: row.qty,
      unitPrice: BigInt(row.unit_price),
      paymentType: row.payment_type,
      extras: row.extras.map((extra) => ({
        amount: BigInt(extra.amount),
        paymentType: extra.payment_type,
      })),
      isCancelled: row.is_cancelled,
    });
    byOrder.set(row.order_id, list);
  }
  return byOrder;
}
