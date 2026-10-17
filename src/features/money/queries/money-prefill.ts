import { sql } from "drizzle-orm";
import * as z from "zod";

import { orderCashCount, plannedCashOf } from "@/domain/money-ledger";
import { ORDER_ACTION_MAX } from "@/domain/order-moves";
import type { PaymentType } from "@/domain/payment-types";
import type { RequestStatus } from "@/domain/request-status";
import { authorizeList, branchFilter } from "@/server/authorize";
import { orders } from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";

import { cashRecordsOf } from "@/features/purchasing/order-records";

import { moneyRowsOf } from "../money-rows";

// What the Record money dialog shows for the ticked orders (08-money-and-settlement.md, Money
// ledger; plan of 4.3): per order its number, version, owner, planned cash and cash count, from
// which `moneyPrefill()` of src/domain/money-ledger.ts fills each row (decided item 2, Look first).
// Under `data.view` with the branch wall and the draft wall inside the SQL: an order the user may
// not see is missing from the answer, never read. One snapshot, so the counts are of one moment.

export type MoneyPrefillOrder = {
  id: string;
  version: number;
  number: string;
  status: RequestStatus;
  branchId: string;
  ownerId: string;
  ownerName: string;
  /** `plannedCashOf()`: the planned total of a Cash order, else 0. */
  plannedCash: bigint;
  /** `orderCashCount()`. */
  cashCount: bigint;
};

const idsInput = z.array(z.uuid()).max(ORDER_ACTION_MAX);

export async function moneyPrefillOrders(
  userId: string,
  orderIds: readonly string[],
): Promise<MoneyPrefillOrder[]> {
  const actor = await authorizeList(userId, "data.view");
  const parsed = idsInput.safeParse(orderIds);
  if (!parsed.success || parsed.data.length === 0) return [];
  const wall = branchFilter(actor, orders.branchId);
  const seen = wall
    ? sql`${wall} and (${orders.status} <> 'DRAFT' or ${orders.ownerId} = ${actor.userId})`
    : sql`true`;
  return readSnapshot(async (db) => {
    const found = await db.execute<{
      id: string;
      version: number;
      number: string | null;
      status: RequestStatus;
      branch_id: string;
      owner_id: string;
      owner_name: string;
      payment_type: PaymentType;
      planned_total: string | null;
    }>(sql`
      select orders.id, orders.version, orders.number, orders.status, orders.branch_id,
             orders.owner_id, u.full_name as owner_name, orders.payment_type,
             orders.planned_total::text as planned_total
      from orders join users u on u.id = orders.owner_id
      where orders.id in (${sql.join(
        parsed.data.map((id) => sql`${id}::uuid`),
        sql`, `,
      )}) and ${seen}
      order by u.full_name, orders.number`);
    const ids = found.rows.map((row) => row.id);
    const records = await cashRecordsOf(db, ids);
    const rows = await moneyRowsOf(db, ids);
    return found.rows.map((row) => ({
      id: row.id,
      version: row.version,
      number: row.number ?? "",
      status: row.status,
      branchId: row.branch_id,
      ownerId: row.owner_id,
      ownerName: row.owner_name,
      plannedCash: plannedCashOf(row.payment_type, BigInt(row.planned_total ?? "0")),
      cashCount: orderCashCount(rows.get(row.id) ?? [], records.get(row.id) ?? []),
    }));
  });
}
