import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import * as z from "zod";

import { decide } from "@/domain/permissions";
import {
  type DocumentStatus,
  type WriteOffReason,
  writeOffDecisionMove,
} from "@/domain/stock-documents";
import { authorizeList, branchFilter } from "@/server/authorize";
import {
  branches,
  productVariants,
  products,
  stockBalances,
  stockDocumentLines,
  stockDocuments,
  units,
  users,
} from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";

// A write-off's own page, /warehouse/documents/[id] (09-warehouse.md, Other documents, Write-off;
// plan of 5.11, decided item 11: write-offs only until 5.12 opens it to every type). The document
// is read with the branch filter of `data.view` inside the SQL (03 "See orders, stock and
// reports"), so an unknown id, another branch's document and a document of another type are alike
// "Not found" (03 rule 1). Its lines carry the branch's stock of now, which the Head weighs before
// approving. `canDecide` asks the permission registry (`stock.approve_write_off`, the Head) and
// writeOffDecisionMove(), the same function the decision action asks (developer-rules.md rule 2).
// Document and lines in one snapshot.

export type WriteOffLine = {
  id: string;
  productName: string;
  /** The subtype's name; null for the hidden default subtype (04 rule 1). */
  subtypeName: string | null;
  /** numeric(14,3) text as stored. */
  qty: string;
  /** The branch's stock of this subtype now, "0" when it never had any. */
  inStock: string;
  unitShortName: string;
};

export type WriteOff = {
  id: string;
  number: string;
  status: DocumentStatus;
  docDate: string;
  branchCode: string;
  branchName: string;
  reason: WriteOffReason;
  comment: string | null;
  askedBy: string;
  askedAt: Date;
  decidedBy: string | null;
  decidedAt: Date | null;
  lines: WriteOffLine[];
  canDecide: boolean;
};

const idInput = z.uuid();

/** One write-off, or null ("Not found") for an unknown id, another branch or another type. */
export async function getWriteOff(userId: string, documentId: string): Promise<WriteOff | null> {
  const parsed = idInput.safeParse(documentId);
  const actor = await authorizeList(userId, "data.view");
  if (!parsed.success) return null;
  const decider = alias(users, "decider");
  return readSnapshot(async (tx) => {
    const [document] = await tx
      .select({
        id: stockDocuments.id,
        number: stockDocuments.number,
        status: stockDocuments.status,
        docDate: stockDocuments.docDate,
        branchId: stockDocuments.branchId,
        branchCode: branches.code,
        branchName: branches.name,
        reason: stockDocuments.reason,
        comment: stockDocuments.comment,
        askedBy: users.fullName,
        askedAt: stockDocuments.createdAt,
        decidedBy: decider.fullName,
        decidedAt: stockDocuments.decidedAt,
      })
      .from(stockDocuments)
      .innerJoin(branches, eq(branches.id, stockDocuments.branchId))
      .innerJoin(users, eq(users.id, stockDocuments.createdBy))
      .leftJoin(decider, eq(decider.id, stockDocuments.decidedBy))
      .where(
        and(
          eq(stockDocuments.id, parsed.data),
          eq(stockDocuments.type, "WRITE_OFF"),
          branchFilter(actor, stockDocuments.branchId),
        ),
      );
    if (!document) return null;
    const lines = await tx
      .select({
        id: stockDocumentLines.id,
        productName: products.name,
        subtypeName: productVariants.name,
        isDefault: productVariants.isDefault,
        qty: stockDocumentLines.qty,
        inStock: sql<string>`coalesce(${stockBalances.qty}, 0)::text`,
        unitShortName: units.shortName,
      })
      .from(stockDocumentLines)
      .innerJoin(productVariants, eq(productVariants.id, stockDocumentLines.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(units, eq(units.id, products.unitId))
      .leftJoin(
        stockBalances,
        and(
          eq(stockBalances.variantId, stockDocumentLines.variantId),
          eq(stockBalances.branchId, document.branchId),
        ),
      )
      .where(eq(stockDocumentLines.documentId, document.id))
      .orderBy(asc(products.name), asc(productVariants.name), asc(stockDocumentLines.id));
    const { branchId, reason, ...header } = document;
    return {
      ...header,
      reason: reason as WriteOffReason,
      lines: lines.map(({ isDefault, subtypeName, ...line }) => ({
        ...line,
        subtypeName: isDefault ? null : subtypeName,
      })),
      canDecide:
        decide("stock.approve_write_off", actor, { branchId }) === "allow" &&
        writeOffDecisionMove(document.status, "APPROVE") !== null,
    };
  });
}
