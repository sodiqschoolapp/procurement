import { type SQL, sql } from "drizzle-orm";

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

/** The records of a few orders by id (at most 200, the ticked orders of one action). */
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
