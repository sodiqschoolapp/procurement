import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import * as z from "zod";

import { decide } from "@/domain/permissions";
import {
  type DocumentReason,
  type DocumentStatus,
  type DocumentType,
  REVERSIBLE_STATUSES,
  countComplete,
  countCorrection,
  countDecisionMove,
  countDifference,
  countTypingAllowed,
  reverseAllows,
  transferReceiveMove,
  transferShort,
  writeOffDecisionMove,
} from "@/domain/stock-documents";
import { authorizeList } from "@/server/authorize";
import {
  branches,
  departments,
  productVariants,
  products,
  stockBalances,
  stockDocumentLines,
  stockDocuments,
  stockMovements,
  units,
  users,
} from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";

import { documentWall } from "../document-wall";

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
// - `canDownloadNote`: an issue or a transfer, and `data.export` on a branch through which the
//   user sees it (plan of 5.4, decided item 8; plan of 7.1, decided item 12);
// - `canReceive`: a transfer, `stock.receive_transfer` on its receiving branch and
//   transferReceiveMove(), the function the receive action asks (plan of 7.2).
// A transfer is seen by its sending and its receiving branch (documentWall(); plan of 7.2, decided
// item 3, Look first). Its lines read no stock at all: the sender's stock is not the receiver's to
// see (review of the plan of 7.2, must fix 1).
// - `canCount`: a count, `stock.start_count` on its branch and countTypingAllowed(), the function
//   the save action asks (plan of 7.3). A count's lines carry the stock at start (`qty`), the
//   counted quantity and countDifference(), and read no stock of now: the difference is against
//   the stock at start only (review of the plan of 7.3, must fix 3). A count is of its own branch
//   only (documentWall()).
// - On a count (plan of 7.4): `canDecide` is `stock.approve_write_off` and countDecisionMove() of
//   Refuse (the count waits), `canApprove` the same of Approve (it is complete too); its lines carry
//   `recount`; `canReverse` also needs a movement of its lines, since a count with no differences
//   moved nothing (review of the plan of 7.4, should fix 5).
// Document and lines in one snapshot.

export type DocumentLine = {
  id: string;
  productName: string;
  /** The subtype's name; null for the hidden default subtype (04 rule 1). */
  subtypeName: string | null;
  /** numeric(14,3) text as stored. */
  qty: string;
  /**
   * The branch's stock of this subtype now, "0" when it never had any; null on a transfer and a
   * count, whose lines read no stock.
   */
  inStock: string | null;
  /** A count line's counted quantity; null while not counted, and on the other types. */
  countedQty: string | null;
  /** A count line's countDifference(); null while not counted, and on the other types. */
  difference: string | null;
  /** What arrived of a transfer's line, once received; null otherwise. */
  receivedQty: string | null;
  /** What did not arrive of it (transferShort()), once received; null otherwise. */
  shortQty: string | null;
  /** A count line sent back to be counted again (plan of 7.4); false on the other types. */
  recount: boolean;
  /** The measure allows decimals (the receive form's check). */
  allowsDecimals: boolean;
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
  /** A transfer's receiving branch; null for the other types. */
  toBranchCode: string | null;
  toBranchName: string | null;
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
  /** The Head may decide it now: Refuse on a count, both answers on a write-off. */
  canDecide: boolean;
  /** The Head may approve it now: a waiting write-off, or a complete waiting count. */
  canApprove: boolean;
  /** A complete count's lines whose approval writes a CORRECTION (countCorrection()); else 0. */
  countChanges: number;
  /** A count every line of which is counted and that waits for the Head (countComplete()). */
  countAsked: boolean;
  canReverse: boolean;
  canDownloadNote: boolean;
  canReceive: boolean;
  canCount: boolean;
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
  const toBranch = alias(branches, "to_branch");
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
        toBranchId: stockDocuments.toBranchId,
        toBranchCode: toBranch.code,
        toBranchName: toBranch.name,
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
      .leftJoin(toBranch, eq(toBranch.id, stockDocuments.toBranchId))
      .leftJoin(departments, eq(departments.id, stockDocuments.departmentId))
      .leftJoin(decider, eq(decider.id, stockDocuments.decidedBy))
      .leftJoin(reverser, eq(reverser.id, stockDocuments.reversedBy))
      .where(and(eq(stockDocuments.id, parsed.data), documentWall(actor)));
    if (!document) return null;
    const transfer = document.type === "TRANSFER";
    const count = document.type === "COUNT";
    const noStock = transfer || count;
    const lines = await tx
      .select({
        id: stockDocumentLines.id,
        productName: products.name,
        subtypeName: productVariants.name,
        isDefault: productVariants.isDefault,
        qty: stockDocumentLines.qty,
        inStock: sql<string | null>`case when ${noStock} then null
          else coalesce(${stockBalances.qty}, 0)::text end`,
        receivedQty: stockDocumentLines.receivedQty,
        countedQty: stockDocumentLines.countedQty,
        recount: stockDocumentLines.recount,
        allowsDecimals: units.allowDecimal,
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
          // A transfer's and a count's lines join no stock (must fix 1 of the plan review of 7.2;
          // must fix 3 of the plan review of 7.3).
          sql`not ${noStock}`,
        ),
      )
      .where(eq(stockDocumentLines.documentId, document.id))
      .orderBy(asc(products.name), asc(productVariants.name), asc(stockDocumentLines.id));
    const { branchId, toBranchId, createdById, ...header } = document;
    const target = { branchId };
    const writeOff = document.type === "WRITE_OFF";
    const approver = decide("stock.approve_write_off", actor, target) === "allow";
    const complete = countComplete(lines.map((line) => line.countedQty));
    const waiting = () =>
      writeOff
        ? writeOffDecisionMove(document.status, "APPROVE") !== null
        : countDecisionMove(document.status, "REFUSE", complete) !== null;
    const approvable = countDecisionMove(document.status, "APPROVE", complete) !== null;
    // Whether a count's approval wrote any CORRECTION, which a reverse would undo.
    const corrected =
      count &&
      (
        await tx
          .select({ id: stockMovements.id })
          .from(stockMovements)
          .innerJoin(stockDocumentLines, eq(stockDocumentLines.id, stockMovements.documentLineId))
          .where(eq(stockDocumentLines.documentId, document.id))
          .limit(1)
      ).length > 0;
    const receiving = toBranchId ? { branchId: toBranchId } : null;
    return {
      ...header,
      lines: lines.map(({ isDefault, subtypeName, ...line }) => ({
        ...line,
        shortQty: line.receivedQty === null ? null : transferShort(line.qty, line.receivedQty),
        difference: count ? countDifference(line.qty, line.countedQty) : null,
        subtypeName: isDefault ? null : subtypeName,
      })),
      canDecide: approver && (writeOff || count) && waiting(),
      canApprove: approver && (writeOff ? waiting() : count && approvable),
      countAsked: count && complete && document.status === "PENDING_APPROVAL",
      countChanges:
        count && complete
          ? lines.filter((line) => countCorrection(line.qty, line.countedQty) !== null).length
          : 0,
      canReverse:
        decide("stock.return_reverse", actor, target) === "allow" &&
        REVERSIBLE_STATUSES.includes(document.status) &&
        reverseAllows(actor, { type: document.type, createdBy: createdById }) &&
        (!count || corrected),
      canDownloadNote:
        (document.type === "ISSUE" || transfer) &&
        (decide("data.export", actor, target) === "allow" ||
          (receiving !== null && decide("data.export", actor, receiving) === "allow")),
      canReceive:
        transfer &&
        receiving !== null &&
        decide("stock.receive_transfer", actor, receiving) === "allow" &&
        transferReceiveMove(document.status) !== null,
      canCount:
        count &&
        decide("stock.start_count", actor, target) === "allow" &&
        countTypingAllowed(document.status),
    };
  });
}
