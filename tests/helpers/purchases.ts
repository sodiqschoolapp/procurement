import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import { db } from "@/server/db/client";

import { insertOrder } from "./orders";

// Purchase rows written straight into the tables, for constraint tests that need a real trip or
// record (D39): no action records a purchase before 3.3.

const AT = "2031-05-02T05:00:00Z";

export function insertTrip(
  branchId: string,
  createdBy: string,
  clientKey = randomUUID(),
  purchasedOn = "2031-05-02",
  paymentType: "CASH" | "TRANSFER" | "CARD" = "CASH",
) {
  return db.execute<{ id: string }>(sql`
    insert into purchase_trips (client_key, branch_id, purchased_on, payment_type, created_by,
      created_at)
    values (${clientKey}, ${branchId}, ${purchasedOn}, ${paymentType}, ${createdBy}, ${AT})
    returning id`);
}

export type PurchaseRow = {
  tripId: string;
  orderId: string;
  branchId: string;
  variantId: string;
  createdBy: string;
  qty?: string;
  unitPrice?: string;
  comment?: string | null;
};

export function insertPurchaseRow(row: PurchaseRow) {
  return db.execute<{ id: string }>(sql`
    insert into purchases (trip_id, order_id, branch_id, variant_id, qty, unit_price, comment,
      created_by, created_at)
    values (${row.tripId}, ${row.orderId}, ${row.branchId}, ${row.variantId}, ${row.qty ?? "1"},
      ${row.unitPrice ?? "5000"}, ${row.comment ?? null}, ${row.createdBy}, ${AT})
    returning id`);
}

/** An Open order of the branch, its trip and one record of the order's subtype. */
export async function insertPurchase(branchId: string, userId: string) {
  const order = await insertOrder({ branchId, ownerId: userId, status: "PURCHASING" });
  const tripId = (await insertTrip(branchId, userId)).rows[0]!.id;
  const purchase = await insertPurchaseRow({
    tripId,
    orderId: order.id,
    branchId,
    variantId: order.variantId,
    createdBy: userId,
  });
  return { id: purchase.rows[0]!.id, tripId, orderId: order.id, variantId: order.variantId };
}
