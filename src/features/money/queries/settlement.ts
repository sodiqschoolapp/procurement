import { sql } from "drizzle-orm";
import * as z from "zod";

import {
  type SettlementBlocks,
  type SettlementRow,
  blockConfirmed,
  orderOverspend,
  settlementRows,
  transferNeedsNote,
} from "@/domain/money-ledger";
import { ORDER_ACTION_MAX } from "@/domain/order-moves";
import { orderTotal } from "@/domain/order-totals";
import type { PaymentType } from "@/domain/payment-types";
import { decide } from "@/domain/permissions";
import { AuthorizationError, authorizeList, branchFilter } from "@/server/authorize";
import { today } from "@/server/clock";
import { orders } from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";
import { readSettings } from "@/server/settings";

import { settlementFactsOf } from "../settlement-facts";

// Finance's settlement screen for ticked orders Waiting for settlement (08-money-and-
// settlement.md, Closing 2 with its table, 4 and the last paragraph; edge cases "No receipt
// photo", "The ticked orders in settlement belong to two Managers"; plan of 4.5). Under
// `request.settle`, Finance of its own branches (03 Permission matrix: "Settle and close an order
// with differences"): what the user sees but may not settle is refused. The branch wall and the
// status are inside the SQL:
// an id it does not return (another branch, an unknown or malformed id, a Draft, an order not
// Waiting for settlement) is dropped. Nothing left, or two branches (decided item 4, Look
// first): null. Read in one snapshot, so the figures, the prefill and the confirmations are of
// one moment. Every figure is settlementBlocks() and settlementRows() of src/domain/money-ledger.ts.

export type SettlementOrder = {
  id: string;
  version: number;
  number: string;
  productName: string;
  subtypeName: string | null;
  paymentType: PaymentType;
  plannedTotal: bigint;
  blocks: SettlementBlocks;
  /** The prefilled Receive or Pay row (08 Closing 2: "prefilled with the count"); null at 0. */
  prefill: SettlementRow | null;
  transfer: { confirmed: boolean; ticked: boolean; note: string | null; needsNote: boolean } | null;
  card: { confirmed: boolean } | null;
  /** 08 Closing, last paragraph: the cancelled purchase records, each linked. */
  cancelledRecords: string[];
  /** Edge case "No receipt photo": a live record whose trip has no file (decided item 12). */
  noReceipt: boolean;
  /** Card money returned through Record money of 4.3 (decided item 14): `money.record`. */
  canRecordMoney: boolean;
  /**
   * 08 Overspend guard, when the order is above it under the settings of now: how much over, the
   * percent, and the Head who acknowledged it (null while it waits for the Head); null when not
   * above the guard (plan of 4.7, decided item 7).
   */
  overspend: { over: bigint; percent: string | null; acknowledgedBy: string | null } | null;
};

export type SettlementManager = { id: string; name: string; orders: SettlementOrder[] };

export type Settlement = {
  branchId: string;
  branchCode: string;
  /** The default date of the settlement action, today in Tashkent. */
  today: string;
  managers: SettlementManager[];
};

const idsInput = z.array(z.uuid()).min(1).max(ORDER_ACTION_MAX);

export async function getSettlement(
  userId: string,
  orderIds: readonly string[],
): Promise<Settlement | null> {
  // Seeing first, so another branch's order is dropped for every role (03 rule 1); then the right
  // to settle each order (as getPurchaseForm()).
  const actor = await authorizeList(userId, "data.view");
  const parsed = idsInput.safeParse([...new Set(orderIds)]);
  if (!parsed.success) return null;
  const wall = branchFilter(actor, orders.branchId) ?? sql`true`;

  return readSnapshot(async (db) => {
    const found = await db.execute<{
      id: string;
      version: number;
      number: string;
      branch_id: string;
      branch_code: string;
      owner_id: string;
      owner_name: string;
      product_name: string;
      variant_name: string;
      variant_is_default: boolean;
      payment_type: PaymentType;
    }>(sql`
      select orders.id, orders.version, orders.number, orders.branch_id, b.code as branch_code, orders.owner_id,
             u.full_name as owner_name, p.name as product_name, v.name as variant_name,
             v.is_default as variant_is_default, orders.payment_type
      from orders
      join branches b on b.id = orders.branch_id
      join users u on u.id = orders.owner_id
      join product_variants v on v.id = orders.variant_id
      join products p on p.id = v.product_id
      where orders.id in (${sql.join(
        parsed.data.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
        and orders.status = 'SETTLEMENT' and ${wall}
      order by u.full_name, orders.owner_id, orders.number`);
    if (found.rows.length === 0) return null;
    const rows = found.rows.filter(
      (row) =>
        decide("request.settle", actor, { branchId: row.branch_id, ownerId: row.owner_id }) ===
        "allow",
    );
    if (rows.length === 0) throw new AuthorizationError("forbidden");
    if (new Set(rows.map((row) => row.branch_id)).size > 1) return null;
    const ids = rows.map((row) => row.id);
    const facts = await settlementFactsOf(db, ids);

    const records = await db.execute<{
      order_id: string;
      id: string;
      is_cancelled: boolean;
      has_file: boolean;
    }>(sql`
      select p.order_id, p.id, p.is_cancelled,
             exists (select 1 from trip_files f where f.trip_id = p.trip_id) as has_file
      from purchases p
      where p.order_id in (${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
      order by p.created_at, p.id`);
    const guard = await readSettings(db);
    const acknowledged = await db.execute<{ order_id: string; full_name: string }>(sql`
      select s.order_id, u.full_name
      from order_settlements s
      join users u on u.id = s.overspend_ack_by
      where s.order_id in (${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`);
    const ackBy = new Map(acknowledged.rows.map((row) => [row.order_id, row.full_name]));

    const managers = new Map<string, SettlementManager>();
    for (const row of rows) {
      const fact = facts.get(row.id)!;
      const own = records.rows.filter((record) => record.order_id === row.id);
      const { blocks, stored } = fact;
      const [prefill] = blocks.cash
        ? settlementRows([{ id: row.id, cashCount: blocks.cash.count }])
        : [];
      const plannedTotal = orderTotal(fact.plan);
      // An order in settlement has a planned price (`orders_priced_finance_check` of 0056).
      if (plannedTotal === null) throw new Error("An order in settlement has no planned price.");
      const order: SettlementOrder = {
        id: row.id,
        version: row.version,
        number: row.number,
        productName: row.product_name,
        subtypeName: row.variant_is_default ? null : row.variant_name,
        paymentType: row.payment_type,
        plannedTotal,
        blocks,
        prefill: prefill ?? null,
        transfer: blocks.transfer
          ? {
              confirmed: blockConfirmed("TRANSFER", blocks, stored),
              ticked: stored?.transferConfirmed === true,
              note: stored?.transferNote ?? null,
              needsNote: transferNeedsNote(blocks.transfer),
            }
          : null,
        card: blocks.card ? { confirmed: blockConfirmed("CARD", blocks, stored) } : null,
        cancelledRecords: own.filter((record) => record.is_cancelled).map((record) => record.id),
        noReceipt: own.some((record) => !record.is_cancelled && !record.has_file),
        canRecordMoney:
          decide("money.record", actor, { branchId: row.branch_id, ownerId: row.owner_id }) ===
          "allow",
        overspend: null,
      };
      const over = orderOverspend(fact, guard);
      if (over.needsHead) {
        order.overspend = {
          over: over.over,
          percent: over.percent,
          acknowledgedBy: ackBy.get(row.id) ?? null,
        };
      }
      const manager = managers.get(row.owner_id) ?? {
        id: row.owner_id,
        name: row.owner_name,
        orders: [],
      };
      manager.orders.push(order);
      managers.set(row.owner_id, manager);
    }
    return {
      branchId: rows[0]!.branch_id,
      branchCode: rows[0]!.branch_code,
      today: today(),
      managers: [...managers.values()],
    };
  });
}
