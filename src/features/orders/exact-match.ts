import { asc, inArray } from "drizzle-orm";

import { isExactMatch, orderCashCount } from "@/domain/money-ledger";
import { moneyRowsOf } from "@/features/money/money-rows";
import { cashRecordsOf } from "@/features/purchasing/order-records";
import type { Executor } from "@/server/authorize";
import { orderExtras, orders } from "@/server/db/schema";

// The state machine's fact `exactMatch` of orders (08-money-and-settlement.md, Exact match; plan
// of 4.4), read in one place for the Close action under its lock and for the list's ticked
// orders and the order page: isExactMatch() of src/domain/money-ledger.ts with the count from
// orderCashCount() (progress 3.8 and 4.1, "For 4.4"), never a second comparison. Four statements
// for any number of orders. The caller has put the orders behind their walls; an order before
// Open has no plan to match and answers false.

export async function exactMatchOf(
  executor: Executor,
  orderIds: readonly string[],
): Promise<Map<string, boolean>> {
  const answer = new Map<string, boolean>();
  if (orderIds.length === 0) return answer;
  const ids = [...orderIds];
  const found = await executor
    .select({
      id: orders.id,
      status: orders.status,
      progress: orders.progress,
      variantId: orders.variantId,
      quantity: orders.plannedQty,
      price: orders.plannedPrice,
      paymentType: orders.paymentType,
    })
    .from(orders)
    .where(inArray(orders.id, ids));
  const extras = new Map<string, bigint[]>();
  const extraRows = await executor
    .select({ orderId: orderExtras.orderId, amount: orderExtras.amount })
    .from(orderExtras)
    .where(inArray(orderExtras.orderId, ids))
    .orderBy(asc(orderExtras.createdAt), asc(orderExtras.id));
  for (const row of extraRows)
    extras.set(row.orderId, [...(extras.get(row.orderId) ?? []), row.amount]);
  const records = await cashRecordsOf(executor, ids);
  const rows = await moneyRowsOf(executor, ids);

  for (const order of found) {
    if (order.variantId === null || order.quantity === null || order.price === null) {
      answer.set(order.id, false);
      continue;
    }
    const own = records.get(order.id) ?? [];
    answer.set(
      order.id,
      isExactMatch({
        status: order.status,
        progress: order.progress,
        variantId: order.variantId,
        plan: {
          quantity: order.quantity,
          price: order.price,
          extras: extras.get(order.id) ?? [],
          paymentType: order.paymentType,
        },
        records: own,
        cashCount: orderCashCount(rows.get(order.id) ?? [], own),
      }),
    );
  }
  return answer;
}
