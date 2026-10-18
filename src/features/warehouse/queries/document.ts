import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import * as z from "zod";

import { decide } from "@/domain/permissions";
import {
  type DocumentReason,
  type DocumentStatus,
  type DocumentType,
  REVERSIBLE_STATUSES,
  reverseAllows,
  writeOffDecisionMove,
} from "@/domain/stock-documents";
import { authorizeList, branchFilter } from "@/server/authorize";
import {
  branches,
  departments,
  productVariants,
  products,
  stockBalances,
  stockDocumentLines,
  stockDocuments,
  units,
  users,
} from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";

// A warehouse document's own page, /warehouse/documents/[id], of every type (09-warehouse.md,
// Movement types; Issue to a department; Other documents; Direct entry by the Head; plan of 5.11,
// decided item 11, opened to every type by 5.12, decided item 3, Look first: the item card's
// number links here). The document is read with the branch filter of `data.view` inside the SQL
// (03 "See orders, stock and reports"), so an unknown id and another branch's document are alike
// "Not found" (03 rule 1). Its lines carry the branch's stock of now, which the Head weighs before
// approving a write-off. No money is read (09 Stock value: "Value is shown in reports only"; plan
// of 5.12, decided item 7). What the user may do now, each asked again by its action:
// - `canDecide`: `stock.approve_write_off` (the Head) and writeOffDecisionMove(), the function
//   the decision action asks (developer-rules.md rule 2);
// - `canReverse`: `stock.return_reverse` on the branch, a reversible status and reverseAllows(),
//   the item card's rule (plan of 5.7);
// - `canDownloadNote`: an issue, and `data.export` on the branch (plan of 5.4, decided item 8).
// Document and lines in one snapshot.

export type DocumentLine = {
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

export type StockDocument = {
  id: string;
  number: string;
  type: DocumentType;
  status: DocumentStatus;
  docDate: string;
  branchCode: string;
  branchName: string;
  /** An issue's or a return's department; null for the other types. */
  departmentName: string | null;
  receivedByName: string | null;
  /** A direct entry's or a write-off's reason; null for the other types. */
  reason: DocumentReason | null;
  comment: string | null;
  /** A direct entry made by an Excel import (plan of 5.9). */
  imported: boolean;
  createdBy: string;
  createdAt: Date;
  decidedBy: string | null;
  decidedAt: Date | null;
  reversedBy: string | null;
  reversedAt: Date | null;
  reverseReason: string | null;
  lines: DocumentLine[];
  canDecide: boolean;
  canReverse: boolean;
  canDownloadNote: boolean;
};

const idInput = z.uuid();

/** One document, or null ("Not found") for an unknown id or another branch's document. */
export async function getStockDocument(
  userId: string,
  documentId: string,
): Promise<StockDocument | null> {
  const parsed = idInput.safeParse(documentId);
  const actor = await authorizeList(userId, "data.view");
  if (!parsed.success) return null;
  const decider = alias(users, "decider");
  const reverser = alias(users, "reverser");
  return readSnapshot(async (tx) => {
    const [document] = await tx
      .select({
        id: stockDocuments.id,
        number: stockDocuments.number,
        type: stockDocuments.type,
        status: stockDocuments.status,
        docDate: stockDocuments.docDate,
        branchId: stockDocuments.branchId,
        branchCode: branches.code,
        branchName: branches.name,
        departmentName: departments.name,
        receivedByName: stockDocuments.receivedByName,
        reason: stockDocuments.reason,
        comment: stockDocuments.comment,
        imported: sql<boolean>`${stockDocuments.importId} is not null`,
        createdById: stockDocuments.createdBy,
        createdBy: users.fullName,
        createdAt: stockDocuments.createdAt,
        decidedBy: decider.fullName,
        decidedAt: stockDocuments.decidedAt,
        reversedBy: reverser.fullName,
        reversedAt: stockDocuments.reversedAt,
        reverseReason: stockDocuments.reverseReason,
      })
      .from(stockDocuments)
      .innerJoin(branches, eq(branches.id, stockDocuments.branchId))
      .innerJoin(users, eq(users.id, stockDocuments.createdBy))
      .leftJoin(departments, eq(departments.id, stockDocuments.departmentId))
      .leftJoin(decider, eq(decider.id, stockDocuments.decidedBy))
      .leftJoin(reverser, eq(reverser.id, stockDocuments.reversedBy))
      .where(and(eq(stockDocuments.id, parsed.data), branchFilter(actor, stockDocuments.branchId)));
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
    const { branchId, createdById, ...header } = document;
    const target = { branchId };
    return {
      ...header,
      lines: lines.map(({ isDefault, subtypeName, ...line }) => ({
        ...line,
        subtypeName: isDefault ? null : subtypeName,
      })),
      canDecide:
        document.type === "WRITE_OFF" &&
        decide("stock.approve_write_off", actor, target) === "allow" &&
        writeOffDecisionMove(document.status, "APPROVE") !== null,
      canReverse:
        decide("stock.return_reverse", actor, target) === "allow" &&
        REVERSIBLE_STATUSES.includes(document.status) &&
        reverseAllows(actor, { type: document.type, createdBy: createdById }),
      canDownloadNote:
        document.type === "ISSUE" && decide("data.export", actor, target) === "allow",
    };
  });
}
