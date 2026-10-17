import { sql } from "drizzle-orm";

import type { PurchaseRecord } from "@/domain/purchases";
import type { Executor } from "@/server/authorize";

// The purchase records of one order with their extra costs, as the domain functions of
// src/domain/purchases.ts read them (progress 3.2, "For 3.3 and 3.5": the actual numbers come from
// the records, never a stored sum). The caller has authorized its read or its action; this reads
// one order it already found behind its walls.

export async function orderRecords(executor: Executor, orderId: string): Promise<PurchaseRecord[]> {
  const found = await executor.execute<{
    qty: string;
    unit_price: string;
    is_cancelled: boolean;
    extras: string[];
  }>(sql`
    select p.qty, p.unit_price, p.is_cancelled,
           coalesce(array_agg(e.amount::text order by e.id)
                    filter (where e.id is not null), '{}') as extras
    from purchases p
    left join purchase_extras e on e.purchase_id = p.id
    where p.order_id = ${orderId}
    group by p.id`);
  return found.rows.map((row) => ({
    qty: row.qty,
    unitPrice: BigInt(row.unit_price),
    extras: row.extras.map((amount) => BigInt(amount)),
    isCancelled: row.is_cancelled,
  }));
}
