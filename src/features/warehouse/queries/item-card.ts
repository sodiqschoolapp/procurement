import { and, count, desc, eq, sql } from "drizzle-orm";
import * as z from "zod";

import { addsDraftsIn } from "@/domain/drafts";
import { type Actor, decide } from "@/domain/permissions";
import { ITEM_CARD_PAGE_SIZE, type MovementType, isLow } from "@/domain/stock";
import { type DocumentStatus, REVERSIBLE_STATUSES, reverseAllows } from "@/domain/stock-documents";
import { AuthorizationError, authorize } from "@/server/authorize";
import {
  branches,
  orders,
  productVariants,
  products,
  purchases,
  stockBalances,
  stockDocumentLines,
  stockDocuments,
  stockMinimums,
  stockMovements,
  units,
} from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";

// The item card, /warehouse/items/[id] (09-warehouse.md, Stock screens: Item card; 11-screens-
// and-ux.md, Screens: "All"; plan of 5.3): every movement of one subtype in one branch, newest
// first by `seq` (decided item 2), each with its stored `balance_after` as the running balance
// (decided item 1, Look first: postMovement() writes it under the lock from the domain's
// arithmetic, so it is never summed a second time). Under `data.view` on the asked branch (03
// matrix "See orders, stock and reports"); another branch is "Not found" (03 rule 1). A
// purchase's movement names its order behind the draft wall, in the SQL: a hidden order leaves
// the row with no number, never out of the card (decided item 9). A document's number links to
// its page, /warehouse/documents/[id] (decided item 4, Look first; plan of 5.12, decided item 3). A document's movement
// carries its status and whether the user may reverse it now (plan of 5.7): `stock.return_reverse`
// on the card's branch, reverseAllows(), a reversible status, and not a REVERSAL row; the server
// asks again. The header carries the minimum, Low and who may set it or add a draft (plan of
// 5.10).

export type ItemMovement = {
  id: string;
  at: Date;
  type: MovementType;
  /** Signed numeric(14,3) text as stored ("-2.500"). */
  qtyDelta: string;
  /** The stock after this movement, as stored. */
  balanceAfter: string;
  /** The order of a purchase's movement, when the user may see it. */
  order: { id: string; number: string } | null;
  /** The number of a document's movement. */
  documentNumber: string | null;
  documentId: string | null;
  documentStatus: DocumentStatus | null;
  /** Whether the Reverse button is offered on this row (plan of 5.7). */
  canReverse: boolean;
};

export type ItemCard = {
  branchId: string;
  branchCode: string;
  branchName: string;
  variantId: string;
  productName: string;
  /** The subtype's name; null for the hidden default subtype of a product without subtypes. */
  subtypeName: string | null;
  /** The quantity on hand, "0" when the branch never held the subtype. */
  quantity: string;
  unitName: string;
  unitShortName: string;
  /** The minimum as stored ("5.000"), null for none (plan of 5.10). */
  minimum: string | null;
  /** isLow() of the quantity and the minimum (09 Low stock). */
  low: boolean;
  /** `stock.set_minimums` on the card's branch; the server asks again. */
  canSetMinimum: boolean;
  /** addsDraftsIn() of the card's branch, for "Add to draft" (plan of 5.10, decided item 8). */
  canAddDraft: boolean;
  movements: ItemMovement[];
  page: number;
  pages: number;
  found: number;
};

const idInput = z.uuid();

/** The draft wall of the order joined through a purchase (03 rule 1; 06 Statuses). */
function orderSeen(actor: Actor) {
  if (actor.role === "HEAD") return sql`true`;
  return sql`(${orders.status} <> 'DRAFT' or ${orders.ownerId} = ${actor.userId})`;
}

/**
 * One page of the card of a subtype in a branch, or null for an unknown subtype or branch or a
 * service.
 * Throws AuthorizationError("not_found") for a branch the user does not see. A page past the last
 * gives the last.
 */
export async function getItemCard(
  userId: string,
  variantId: string,
  branchId: string,
  page = 1,
): Promise<ItemCard | null> {
  const branch = idInput.safeParse(branchId);
  if (!branch.success) throw new AuthorizationError("not_found");
  const actor = await authorize(userId, "data.view", { branchId: branch.data });
  const variant = idInput.safeParse(variantId);
  if (!variant.success) return null;

  return readSnapshot(async (db) => {
    const [head] = await db
      .select({
        branchCode: branches.code,
        branchName: branches.name,
        branchIsActive: branches.isActive,
        productName: products.name,
        variantName: productVariants.name,
        variantIsDefault: productVariants.isDefault,
        qty: stockBalances.qty,
        minimum: stockMinimums.minQty,
        unitName: units.name,
        unitShortName: units.shortName,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(units, eq(units.id, products.unitId))
      .innerJoin(branches, eq(branches.id, branch.data))
      .leftJoin(
        stockBalances,
        and(
          eq(stockBalances.branchId, branches.id),
          eq(stockBalances.variantId, productVariants.id),
        ),
      )
      .leftJoin(
        stockMinimums,
        and(
          eq(stockMinimums.branchId, branches.id),
          eq(stockMinimums.variantId, productVariants.id),
        ),
      )
      .where(and(eq(productVariants.id, variant.data), eq(products.type, "GOODS")));
    if (!head) return null;

    const where = and(
      eq(stockMovements.branchId, branch.data),
      eq(stockMovements.variantId, variant.data),
    );
    const [total] = await db.select({ found: count() }).from(stockMovements).where(where);
    const found = total?.found ?? 0;
    const pages = Math.max(1, Math.ceil(found / ITEM_CARD_PAGE_SIZE));
    const shown = Math.min(Number.isInteger(page) && page >= 1 ? page : 1, pages);
    const rows = await db
      .select({
        id: stockMovements.id,
        at: stockMovements.createdAt,
        type: stockMovements.type,
        qtyDelta: stockMovements.qtyDelta,
        balanceAfter: stockMovements.balanceAfter,
        orderId: orders.id,
        orderNumber: orders.number,
        documentNumber: stockDocuments.number,
        documentId: stockDocuments.id,
        documentType: stockDocuments.type,
        documentStatus: stockDocuments.status,
        documentCreatedBy: stockDocuments.createdBy,
      })
      .from(stockMovements)
      .leftJoin(purchases, eq(purchases.id, stockMovements.purchaseId))
      .leftJoin(
        orders,
        and(
          eq(orders.id, purchases.orderId),
          // The movement's own branch again, beside the draft wall (permission review, should-fix 1).
          eq(orders.branchId, stockMovements.branchId),
          orderSeen(actor),
        ),
      )
      .leftJoin(stockDocumentLines, eq(stockDocumentLines.id, stockMovements.documentLineId))
      .leftJoin(stockDocuments, eq(stockDocuments.id, stockDocumentLines.documentId))
      .where(where)
      .orderBy(desc(stockMovements.seq))
      .limit(ITEM_CARD_PAGE_SIZE)
      .offset((shown - 1) * ITEM_CARD_PAGE_SIZE);

    const reversesHere =
      decide("stock.return_reverse", actor, { branchId: branch.data }) === "allow";
    return {
      branchId: branch.data,
      branchCode: head.branchCode,
      branchName: head.branchName,
      variantId: variant.data,
      productName: head.productName,
      subtypeName: head.variantIsDefault ? null : head.variantName,
      quantity: head.qty ?? "0",
      unitName: head.unitName,
      unitShortName: head.unitShortName,
      minimum: head.minimum,
      low: isLow(head.qty ?? "0", head.minimum),
      canSetMinimum: decide("stock.set_minimums", actor, { branchId: branch.data }) === "allow",
      canAddDraft: addsDraftsIn(actor, { id: branch.data, isActive: head.branchIsActive }),
      movements: rows.map((row) => ({
        id: row.id,
        at: row.at,
        type: row.type,
        qtyDelta: row.qtyDelta,
        balanceAfter: row.balanceAfter,
        order: row.orderId && row.orderNumber ? { id: row.orderId, number: row.orderNumber } : null,
        documentNumber: row.documentNumber,
        documentId: row.documentId,
        documentStatus: row.documentStatus,
        canReverse:
          reversesHere &&
          row.type !== "REVERSAL" &&
          row.documentType !== null &&
          row.documentStatus !== null &&
          row.documentCreatedBy !== null &&
          REVERSIBLE_STATUSES.includes(row.documentStatus) &&
          reverseAllows(actor, { type: row.documentType, createdBy: row.documentCreatedBy }),
      })),
      page: shown,
      pages,
      found,
    };
  });
}
