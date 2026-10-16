import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import type { RequestStatus } from "@/domain/request-status";
import { now } from "@/server/clock";
import { db } from "@/server/db/client";
import { departments, extraCostTypes, orderExtras, orders } from "@/server/db/schema";

import { insertProduct } from "./catalog";

// Departments, extra cost types and orders in the database for tests (task 2.4). Names are
// invented; everything is written at the moment of the clock. An order written here goes past
// every step of the app: a constraint test writes straight into the table (D39).

let made = 0;
const next = () => (made += 1);

export async function insertDepartment(branchId: string, options: { name?: string } = {}) {
  const [row] = await db
    .insert(departments)
    .values({
      branchId,
      name: options.name ?? `Bo'lim ${randomUUID().slice(0, 8)} ${next()}`,
      createdAt: now(),
    })
    .returning({ id: departments.id });
  return row!;
}

export async function insertExtraCostType() {
  const [row] = await db
    .insert(extraCostTypes)
    .values({ name: `Xarajat ${randomUUID().slice(0, 8)} ${next()}`, createdAt: now() })
    .returning({ id: extraCostTypes.id });
  return row!;
}

/** A number of the right form that no other order of the test holds (05 Order number). */
export function inventedNumber(): string {
  return `TST-26-${String(1000 + next()).padStart(4, "0")}`;
}

export type OrderRow = {
  branchId: string;
  ownerId: string;
  createdBy?: string;
  status?: RequestStatus;
  /** Given for a submitted order unless `null`; empty for a draft unless given. */
  number?: string | null;
  variantId?: string;
  departmentId?: string;
  version?: number;
  revision?: number;
  priority?: "NORMAL" | "URGENT";
  urgentReason?: string | null;
};

/**
 * An order with a complete plan: its own product and a department of its branch unless given,
 * 10 × 5 000 so'm. A submitted status gets a number and a submit time unless told otherwise.
 */
export async function insertOrder(row: OrderRow) {
  const status = row.status ?? "DRAFT";
  const variantId = row.variantId ?? (await insertProduct()).defaultVariantId;
  const departmentId = row.departmentId ?? (await insertDepartment(row.branchId)).id;
  const submitted = status !== "DRAFT";
  const [inserted] = await db
    .insert(orders)
    .values({
      branchId: row.branchId,
      ownerId: row.ownerId,
      createdBy: row.createdBy ?? row.ownerId,
      status,
      number: row.number === undefined ? (submitted ? inventedNumber() : null) : row.number,
      variantId,
      departmentId,
      neededBy: "2031-05-01",
      plannedQty: "10.000",
      plannedPrice: 5000n,
      plannedTotal: 50000n,
      paymentType: "CASH",
      priority: row.priority ?? "NORMAL",
      urgentReason: row.urgentReason ?? null,
      version: row.version ?? 1,
      revision: row.revision ?? 1,
      submittedAt: submitted ? now() : null,
      createdAt: now(),
      updatedAt: now(),
    })
    .returning({ id: orders.id, number: orders.number, version: orders.version });
  return { ...inserted!, variantId, departmentId, branchId: row.branchId, ownerId: row.ownerId };
}

export async function insertOrderExtra(orderId: string, amount = 20000n) {
  const [row] = await db
    .insert(orderExtras)
    .values({
      orderId,
      extraCostTypeId: (await insertExtraCostType()).id,
      amount,
      createdAt: now(),
    })
    .returning({ id: orderExtras.id });
  return row!;
}

/** Sets an order's status straight in the table, as a move would, for a test's starting point. */
export async function setOrderStatus(orderId: string, status: RequestStatus) {
  await db.update(orders).set({ status }).where(eq(orders.id, orderId));
}
