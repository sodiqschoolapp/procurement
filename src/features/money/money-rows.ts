import { sql } from "drizzle-orm";

import type { DatedMoneyRow, MoneyRow, MoneyRowKind } from "@/domain/money-ledger";
import type { Executor } from "@/server/authorize";

// The money rows of orders with their action's `is_cancelled`, as `orderCashCount()` of
// src/domain/money-ledger.ts reads them (progress 4.1, "For 4.2, 4.3, 4.5": never count cash a
// second way). The caller has authorized its read or its action; this reads orders it already
// found behind their walls.

export async function moneyRowsOf(
  executor: Executor,
  orderIds: readonly string[],
): Promise<Map<string, MoneyRow[]>> {
  const dated = await datedMoneyRowsOf(executor, orderIds);
  return new Map([...dated].map(([id, list]) => [id, list.map((each) => each.row)]));
}

/** The same rows with their action's business date, for `cashSince()` (plan of 4.9). */
export async function datedMoneyRowsOf(
  executor: Executor,
  orderIds: readonly string[],
): Promise<Map<string, DatedMoneyRow[]>> {
  const byOrder = new Map<string, DatedMoneyRow[]>();
  if (orderIds.length === 0) return byOrder;
  const found = await executor.execute<{
    order_id: string;
    kind: MoneyRowKind;
    amount: string;
    is_cancelled: boolean;
    occurred_on: string;
  }>(sql`
    select r.order_id, r.kind, r.amount::text as amount, a.is_cancelled,
           a.occurred_on::text as occurred_on
    from money_rows r join money_actions a on a.id = r.money_action_id
    where r.order_id in (${sql.join(
      orderIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})`);
  for (const row of found.rows) {
    const list = byOrder.get(row.order_id) ?? [];
    list.push({
      row: { kind: row.kind, amount: BigInt(row.amount), isCancelled: row.is_cancelled },
      occurredOn: row.occurred_on,
    });
    byOrder.set(row.order_id, list);
  }
  return byOrder;
}
