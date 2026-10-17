import { and, asc, eq } from "drizzle-orm";
import * as z from "zod";

import { businessDate } from "@/domain/business-date";
import type { PaymentType } from "@/domain/payment-types";
import { decide } from "@/domain/permissions";
import { actualQuantity } from "@/domain/purchases";
import { AuthorizationError, authorizeList, branchFilter } from "@/server/authorize";
import { now } from "@/server/clock";
import {
  branches,
  companies,
  extraCostTypes,
  orderExtras,
  orders,
  productVariants,
  products,
  units,
} from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";
import { readSettings } from "@/server/settings";

import { orderRecords } from "../order-records";

// The purchase form of one Open order, /orders/[id]/purchase (07-purchasing.md, Purchase record;
// plan of 3.3). Under `purchase.record`: the Head in any branch, the order's owner with
// RECORD_PURCHASES on (03 Permission matrix "Record purchases"). The branch wall is inside the
// SQL; an order of another branch, an unknown or malformed id, and an order that is not Open or
// whose buying is finished are `null` (decided item 14); an order the user sees but may not record
// is `forbidden`. One snapshot, so the plan, the records and the defaults are of one moment.

export type PurchaseFormChoice = { id: string; name: string };

export type PurchaseForm = {
  orderId: string;
  version: number;
  number: string;
  branchCode: string;
  productName: string;
  /** The subtype's name, or null for a product's hidden default subtype (04 rule 1). */
  subtypeName: string | null;
  unitShortName: string;
  allowDecimal: boolean;
  /** A service never enters stock and shows Used (A7). */
  isService: boolean;
  plannedQty: string;
  plannedPrice: bigint;
  plannedExtras: { extraCostTypeId: string; typeName: string; amount: bigint }[];
  /** "Payment type used: Default from the order" (07). */
  paymentType: PaymentType;
  /** The actual quantity before this record (08 Actual quantity). */
  received: string;
  /** "Default today" (07), the business date in Tashkent. */
  today: string;
  /** The business date of the Finance approval: no date before it (07). */
  approvedOn: string | null;
  /** The order's company while it is active (07 Supplier; spec review of the plan, Should fix 4). */
  defaultSupplierId: string | null;
  receiptRequiredForCash: boolean;
  suppliers: PurchaseFormChoice[];
  extraCostTypes: PurchaseFormChoice[];
};

const idInput = z.uuid();

export async function getPurchaseForm(
  userId: string,
  orderId: string,
): Promise<PurchaseForm | null> {
  // Seeing first, so another branch's order is "Not found" for every role (03 rule 1); then the
  // right to record on this order.
  const actor = await authorizeList(userId, "data.view");
  const parsed = idInput.safeParse(orderId);
  if (!parsed.success) return null;

  return readSnapshot(async (db) => {
    const [row] = await db
      .select({
        id: orders.id,
        version: orders.version,
        number: orders.number,
        status: orders.status,
        progress: orders.progress,
        branchId: orders.branchId,
        ownerId: orders.ownerId,
        branchCode: branches.code,
        productName: products.name,
        variantName: productVariants.name,
        variantIsDefault: productVariants.isDefault,
        unitShortName: units.shortName,
        allowDecimal: units.allowDecimal,
        productType: products.type,
        plannedQty: orders.plannedQty,
        plannedPrice: orders.plannedPrice,
        paymentType: orders.paymentType,
        approvedAt: orders.approvedAt,
        companyId: orders.companyId,
        companyActive: companies.isActive,
      })
      .from(orders)
      .innerJoin(branches, eq(branches.id, orders.branchId))
      .innerJoin(productVariants, eq(productVariants.id, orders.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(units, eq(units.id, products.unitId))
      .leftJoin(companies, eq(companies.id, orders.companyId))
      .where(
        and(
          eq(orders.id, parsed.data),
          branchFilter(actor, orders.branchId),
          // Open with its buying not finished, inside the SQL: a numbered Draft is never read
          // (the draft wall; permission review of 3.3, Should fix 1).
          eq(orders.status, "PURCHASING"),
          eq(orders.progress, "OPEN"),
        ),
      );
    if (!row) return null;
    const decision = decide("purchase.record", actor, {
      branchId: row.branchId,
      ownerId: row.ownerId,
    });
    if (decision !== "allow") throw new AuthorizationError(decision);

    const plannedExtras = await db
      .select({
        extraCostTypeId: orderExtras.extraCostTypeId,
        typeName: extraCostTypes.name,
        amount: orderExtras.amount,
      })
      .from(orderExtras)
      .innerJoin(extraCostTypes, eq(extraCostTypes.id, orderExtras.extraCostTypeId))
      .where(eq(orderExtras.orderId, row.id))
      .orderBy(asc(orderExtras.createdAt), asc(orderExtras.id));
    const suppliers = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.isActive, true))
      .orderBy(asc(companies.name));
    const types = await db
      .select({ id: extraCostTypes.id, name: extraCostTypes.name })
      .from(extraCostTypes)
      .where(eq(extraCostTypes.isActive, true))
      .orderBy(asc(extraCostTypes.name));
    const settings = await readSettings(db);

    return {
      orderId: row.id,
      version: row.version,
      number: row.number!,
      branchCode: row.branchCode,
      productName: row.productName,
      subtypeName: row.variantIsDefault ? null : row.variantName,
      unitShortName: row.unitShortName,
      allowDecimal: row.allowDecimal,
      isService: row.productType === "SERVICE",
      plannedQty: row.plannedQty!,
      plannedPrice: row.plannedPrice!,
      plannedExtras,
      paymentType: row.paymentType,
      received: actualQuantity(await orderRecords(db, row.id)),
      today: businessDate(now()),
      approvedOn: row.approvedAt ? businessDate(row.approvedAt) : null,
      defaultSupplierId: row.companyId && row.companyActive ? row.companyId : null,
      receiptRequiredForCash: settings.receipt_required_for_cash,
      suppliers,
      extraCostTypes: types,
    };
  });
}
