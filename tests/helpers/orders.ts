import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { orderTotal } from "@/domain/order-totals";
import type { PaymentType } from "@/domain/payment-types";
import type { ProductType } from "@/domain/products";
import type { RequestStatus } from "@/domain/request-status";
import { runAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";
import { now } from "@/server/clock";
import { db } from "@/server/db/client";
import { departments, extraCostTypes, orderExtras, orders, settings } from "@/server/db/schema";

import {
  type CreatedDraft,
  type UpdatedDraft,
  createDraft,
  updateDraft,
} from "../../src/features/orders/actions/drafts";
import { insertProduct, insertUnit, setLastPurchasePrice } from "./catalog";

// Departments, extra cost types and orders in the database for tests (task 2.4). Names are
// invented; everything is written at the moment of the clock. An order written here goes past
// every step of the app: a constraint test writes straight into the table (D39).

let made = 0;
const next = () => (made += 1);

export async function insertDepartment(
  branchId: string,
  options: { name?: string; isActive?: boolean; responsibleName?: string } = {},
) {
  const [row] = await db
    .insert(departments)
    .values({
      branchId,
      name: options.name ?? `Bo'lim ${randomUUID().slice(0, 8)} ${next()}`,
      responsibleName: options.responsibleName ?? null,
      isActive: options.isActive ?? true,
      createdAt: now(),
    })
    .returning({ id: departments.id, name: departments.name });
  return row!;
}

export async function insertExtraCostType(options: { isActive?: boolean } = {}) {
  const [row] = await db
    .insert(extraCostTypes)
    .values({
      name: `Xarajat ${randomUUID().slice(0, 8)} ${next()}`,
      isActive: options.isActive ?? true,
      createdAt: now(),
    })
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
  /** 05 field 7, "Requested by"; empty unless given. */
  requesterName?: string | null;
  version?: number;
  revision?: number;
  priority?: "NORMAL" | "URGENT";
  urgentReason?: string | null;
  neededBy?: string;
  plannedQty?: string;
  plannedPrice?: bigint;
  paymentType?: PaymentType;
  submittedAt?: Date;
  approvedAt?: Date | null;
  closedAt?: Date | null;
  createdAt?: Date;
  /** 07 Order progress, Open unless given; its finish reason (plan of 3.5). */
  progress?: "OPEN" | "DONE" | "DONE_SHORT" | "NOT_BOUGHT";
  finishReason?: string | null;
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
      requesterName: row.requesterName ?? null,
      neededBy: row.neededBy ?? "2031-05-01",
      plannedQty: row.plannedQty ?? "10.000",
      plannedPrice: row.plannedPrice ?? 5000n,
      plannedTotal: orderTotal({
        quantity: row.plannedQty ?? "10.000",
        price: row.plannedPrice ?? 5000n,
        extras: [],
        paymentType: row.paymentType ?? "CASH",
      }),
      paymentType: row.paymentType ?? "CASH",
      priority: row.priority ?? "NORMAL",
      urgentReason: row.urgentReason ?? null,
      version: row.version ?? 1,
      revision: row.revision ?? 1,
      // A Draft with a number was submitted and taken back: it keeps its submit time (06 Take back).
      submittedAt: submitted || row.number ? (row.submittedAt ?? now()) : null,
      approvedAt: row.approvedAt ?? null,
      closedAt: row.closedAt ?? null,
      progress: row.progress ?? "OPEN",
      finishReason: row.finishReason ?? null,
      createdAt: row.createdAt ?? now(),
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

/**
 * A product of its own measure for a draft (2.5a): counted in pieces unless `allowDecimal`, with
 * the reference price and the last purchase price given (05 field 11). Returns its hidden default
 * subtype as `variantId`.
 */
export async function insertItem(
  options: {
    allowDecimal?: boolean;
    referencePrice?: bigint | null;
    lastPurchasePrice?: bigint | null;
    type?: ProductType;
    isActive?: boolean;
    defaultCompanyId?: string | null;
    photoFileId?: string | null;
  } = {},
) {
  const unit = await insertUnit({ allowDecimal: options.allowDecimal ?? false });
  const product = await insertProduct({
    unitId: unit.id,
    type: options.type,
    referencePrice: options.referencePrice ?? null,
    isActive: options.isActive,
    defaultCompanyId: options.defaultCompanyId,
    photoFileId: options.photoFileId,
  });
  if (options.lastPurchasePrice != null) {
    await setLastPurchasePrice(product.defaultVariantId, options.lastPurchasePrice);
  }
  return { ...product, variantId: product.defaultVariantId };
}

/** Adds a draft through the action: 10 of the item unless the input says otherwise. */
export function addDraft(userId: string, input: Record<string, unknown>) {
  return runAction(createDraft, userId, {
    clientKey: randomUUID(),
    quantity: "10",
    ...input,
  }) as Promise<ActionResult<CreatedDraft>>;
}

/** Saves a draft's changed fields through the action. */
export function editDraft(userId: string, input: Record<string, unknown>) {
  return runAction(updateDraft, userId, input) as Promise<ActionResult<UpdatedDraft>>;
}

/** An order as it is stored. */
export async function orderRow(id: string) {
  const [row] = await db.select().from(orders).where(eq(orders.id, id));
  return row;
}

/** Sets the school's default payment type (05 field 13: "Default is Cash (a setting)"). */
export async function setDefaultPaymentType(type: PaymentType) {
  await db
    .insert(settings)
    .values({ key: "default_payment_type", value: type, createdAt: now() })
    .onConflictDoUpdate({ target: settings.key, set: { value: type } });
}
