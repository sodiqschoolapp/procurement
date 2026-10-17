import { and, asc, eq, inArray } from "drizzle-orm";
import * as z from "zod";

import { businessDate } from "@/domain/business-date";
import type { PaymentType } from "@/domain/payment-types";
import { decide } from "@/domain/permissions";
import { ORDER_ACTION_MAX } from "@/domain/order-moves";
import { actualQuantity, inSplitOrder } from "@/domain/purchases";
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
  users,
} from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";
import { readSettings } from "@/server/settings";

import { orderRecords } from "../order-records";

// The purchase form of one trip: one Open order at /orders/[id]/purchase, or the ticked orders
// and group rows at /orders/purchase (07-purchasing.md, Purchase record; One trip, many orders;
// plans of 3.3 and 3.4). Under `purchase.record`: the Head in any branch, the order's owner with
// RECORD_PURCHASES on (03 Permission matrix "Record purchases"). The branch wall, the draft wall,
// the status and the progress are inside the SQL: an id it does not return (another branch, an
// unknown or malformed id, a Draft, an order that is not Open or whose buying is finished) is
// dropped and never counted (plan of 3.4, spec review Should fix 2). What is left: `null` when
// nothing, or two branches; `forbidden` when the user may record none of it (a colleague's
// orders, a right switched off); else the orders the user may record, by owner (a Manager: only
// own orders; the Head picks one owner on the form, decided item 9) and how many were left out
// (decided item 10). One snapshot, so the plans, the records and the defaults are of one moment.

export type PurchaseFormChoice = { id: string; name: string };

export type PurchaseFormOrder = {
  orderId: string;
  version: number;
  number: string;
  /** The first submit: with the number, the split's order (07 One trip 2). */
  submittedAt: Date;
  ownerId: string;
  variantId: string;
  productName: string;
  /** The subtype's name, or null for a product's hidden default subtype (04 rule 1). */
  subtypeName: string | null;
  /**
   * What "Subtype bought" offers (07 Substitution; plan of 3.6, decided items 4 and 6): the
   * ordered subtype first, even when inactive, then the product's other active subtypes by name
   * while the product is active. One entry (a hidden default, or nothing else to pick): no select.
   */
  subtypes: PurchaseFormChoice[];
  unitShortName: string;
  allowDecimal: boolean;
  /** A service never enters stock and shows Used (A7). */
  isService: boolean;
  plannedQty: string;
  plannedPrice: bigint;
  plannedExtras: { extraCostTypeId: string; typeName: string; amount: bigint }[];
  /** The order's payment type: the comment rule compares with it (07 Comment). */
  paymentType: PaymentType;
  /** The actual quantity before this trip (08 Actual quantity). */
  received: string;
  /** The business date of the Finance approval: no date before it (07). */
  approvedOn: string | null;
  /** The order's company while it is active (07 Supplier; 3.3 spec review, Should fix 4). */
  companyId: string | null;
};

export type PurchaseForm = {
  branchCode: string;
  /** The recordable orders, in the split's order (inSplitOrder()). */
  orders: PurchaseFormOrder[];
  /** The owners of `orders`, with the most orders first, then by name (decided item 9). */
  owners: PurchaseFormChoice[];
  /** Visible ticked orders this user may not record (another owner's): a count only. */
  leftOut: number;
  /** "Default today" (07), the business date in Tashkent. */
  today: string;
  receiptRequiredForCash: boolean;
  suppliers: PurchaseFormChoice[];
  extraCostTypes: PurchaseFormChoice[];
};

const idsInput = z.array(z.uuid()).min(1).max(ORDER_ACTION_MAX);

export async function getPurchaseForm(
  userId: string,
  orderIds: readonly string[],
): Promise<PurchaseForm | null> {
  // Seeing first, so another branch's order is dropped for every role (03 rule 1); then the right
  // to record each order.
  const actor = await authorizeList(userId, "data.view");
  const parsed = idsInput.safeParse([...new Set(orderIds)]);
  if (!parsed.success) return null;

  return readSnapshot(async (db) => {
    const rows = await db
      .select({
        id: orders.id,
        version: orders.version,
        number: orders.number,
        submittedAt: orders.submittedAt,
        branchId: orders.branchId,
        ownerId: orders.ownerId,
        ownerName: users.fullName,
        branchCode: branches.code,
        variantId: orders.variantId,
        productId: products.id,
        productActive: products.isActive,
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
      .innerJoin(users, eq(users.id, orders.ownerId))
      .innerJoin(productVariants, eq(productVariants.id, orders.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(units, eq(units.id, products.unitId))
      .leftJoin(companies, eq(companies.id, orders.companyId))
      .where(
        and(
          inArray(orders.id, parsed.data),
          branchFilter(actor, orders.branchId),
          // Open with its buying not finished, inside the SQL: a numbered Draft is never read
          // (the draft wall; permission review of 3.3, Should fix 1).
          eq(orders.status, "PURCHASING"),
          eq(orders.progress, "OPEN"),
        ),
      );
    if (rows.length === 0) return null;
    // 07 One trip: one branch (decided item 2, Look first).
    if (rows.some((row) => row.branchId !== rows[0]!.branchId)) return null;
    const recordable = rows.filter(
      (row) =>
        decide("purchase.record", actor, { branchId: row.branchId, ownerId: row.ownerId }) ===
        "allow",
    );
    if (recordable.length === 0) throw new AuthorizationError("forbidden");

    const ids = recordable.map((row) => row.id);
    const plannedExtras = await db
      .select({
        orderId: orderExtras.orderId,
        extraCostTypeId: orderExtras.extraCostTypeId,
        typeName: extraCostTypes.name,
        amount: orderExtras.amount,
      })
      .from(orderExtras)
      .innerJoin(extraCostTypes, eq(extraCostTypes.id, orderExtras.extraCostTypeId))
      .where(inArray(orderExtras.orderId, ids))
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
    const productIds = [
      ...new Set(recordable.filter((row) => row.productActive).map((row) => row.productId)),
    ];
    const others =
      productIds.length === 0
        ? []
        : await db
            .select({
              id: productVariants.id,
              productId: productVariants.productId,
              name: productVariants.name,
            })
            .from(productVariants)
            .where(
              and(
                inArray(productVariants.productId, productIds),
                eq(productVariants.isActive, true),
                eq(productVariants.isDefault, false),
              ),
            )
            .orderBy(asc(productVariants.name), asc(productVariants.id));

    const formOrders: PurchaseFormOrder[] = [];
    for (const row of recordable) {
      formOrders.push({
        orderId: row.id,
        version: row.version,
        number: row.number!,
        submittedAt: row.submittedAt!,
        ownerId: row.ownerId,
        variantId: row.variantId!,
        productName: row.productName,
        subtypeName: row.variantIsDefault ? null : row.variantName,
        subtypes: [
          { id: row.variantId!, name: row.variantName },
          ...others
            .filter((other) => other.productId === row.productId && other.id !== row.variantId)
            .map(({ id, name }) => ({ id, name })),
        ],
        unitShortName: row.unitShortName,
        allowDecimal: row.allowDecimal,
        isService: row.productType === "SERVICE",
        plannedQty: row.plannedQty!,
        plannedPrice: row.plannedPrice!,
        plannedExtras: plannedExtras
          .filter((extra) => extra.orderId === row.id)
          .map(({ extraCostTypeId, typeName, amount }) => ({ extraCostTypeId, typeName, amount })),
        paymentType: row.paymentType,
        received: actualQuantity(await orderRecords(db, row.id)),
        approvedOn: row.approvedAt ? businessDate(row.approvedAt) : null,
        companyId: row.companyId && row.companyActive ? row.companyId : null,
      });
    }

    const counts = new Map<string, { id: string; name: string; count: number }>();
    for (const row of recordable) {
      const owner = counts.get(row.ownerId) ?? { id: row.ownerId, name: row.ownerName, count: 0 };
      owner.count += 1;
      counts.set(row.ownerId, owner);
    }
    const owners = [...counts.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .map(({ id, name }) => ({ id, name }));

    return {
      branchCode: rows[0]!.branchCode,
      orders: inSplitOrder(formOrders),
      owners,
      leftOut: rows.length - recordable.length,
      today: businessDate(now()),
      receiptRequiredForCash: settings.receipt_required_for_cash,
      suppliers,
      extraCostTypes: types,
    };
  });
}
