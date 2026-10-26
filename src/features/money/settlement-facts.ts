import { asc, inArray } from "drizzle-orm";

import {
  type CashRecord,
  type SettlementBlocks,
  type SettlementConfirmations,
  settlementBlocks,
} from "@/domain/money-ledger";
import type { OrderPlan } from "@/domain/order-totals";
import { cashRecordsOf } from "@/features/purchasing/order-records";
import type { Executor } from "@/server/authorize";
import { orderExtras, orderSettlements, orders } from "@/server/db/schema";

import { moneyRowsOf } from "./money-rows";

// The settlement blocks of orders and their stored confirmations (08-money-and-settlement.md,
// Closing 2; plan of 4.5), read in one place for the settlement screen and, under the orders'
// lock, for Confirm (review of the plan, Should fix 5) and for Finance's Close (plan of 4.6). The
// figures are settlementBlocks() of src/domain/money-ledger.ts over the order's plan, records and
// money rows, never a second sum. The caller has put the orders behind their walls.

export type SettlementFacts = {
  plan: OrderPlan;
  /** The order's purchase records, cancelled ones included (`cashRecordsOf()`). */
  records: CashRecord[];
  blocks: SettlementBlocks;
  /** 14 order_settlements; null when nothing was ever confirmed. */
  stored: SettlementConfirmations | null;
};

export async function settlementFactsOf(
  executor: Executor,
  orderIds: readonly string[],
): Promise<Map<string, SettlementFacts>> {
  const answer = new Map<string, SettlementFacts>();
  if (orderIds.length === 0) return answer;
  const ids = [...orderIds];
  const found = await executor
    .select({
      id: orders.id,
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
  const stored = new Map(
    (
      await executor
        .select({
          orderId: orderSettlements.orderId,
          transferConfirmedAt: orderSettlements.transferConfirmedAt,
          transferNote: orderSettlements.transferNote,
          cardConfirmedAt: orderSettlements.cardConfirmedAt,
          overspendAckAt: orderSettlements.overspendAckAt,
        })
        .from(orderSettlements)
        .where(inArray(orderSettlements.orderId, ids))
    ).map((row) => [
      row.orderId,
      {
        transferConfirmed: row.transferConfirmedAt !== null,
        transferNote: row.transferNote,
        cardConfirmed: row.cardConfirmedAt !== null,
        overspendAcknowledged: row.overspendAckAt !== null,
      },
    ]),
  );
  const records = await cashRecordsOf(executor, ids);
  const rows = await moneyRowsOf(executor, ids);
  for (const order of found) {
    // An order from Open on has its plan (orders_guard of 0019); a Draft never reaches here. An
    // order without a planned price has no facts: it never reaches settlement and is left out of
    // the overspend guard (06 Finance step switched off 8; 08 Numbers; plan of 2.5d-b, decided
    // item 5), so a close of it sends no overspend notice.
    if (order.quantity === null || order.price === null) continue;
    const plan: OrderPlan = {
      quantity: order.quantity,
      price: order.price,
      extras: extras.get(order.id) ?? [],
      paymentType: order.paymentType,
    };
    const own = records.get(order.id) ?? [];
    answer.set(order.id, {
      plan,
      records: own,
      blocks: settlementBlocks({
        plan,
        records: own,
        rows: rows.get(order.id) ?? [],
      }),
      stored: stored.get(order.id) ?? null,
    });
  }
  return answer;
}
