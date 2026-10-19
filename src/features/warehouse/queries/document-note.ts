import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import * as z from "zod";

import type { DocumentStatus } from "@/domain/stock-documents";
import { authorize, authorizeList } from "@/server/authorize";
import {
  branches,
  departments,
  productVariants,
  products,
  stockDocumentLines,
  stockDocuments,
  units,
  users,
} from "@/server/db/schema";
import { readSnapshot } from "@/server/read-snapshot";
import { readSettings } from "@/server/settings";

import { documentWall } from "./documents";

// What the issue note and the transfer note PDF show, GET /warehouse/documents/[id]/note
// (09-warehouse.md, Issue to a department 2: "a PDF issue note naming who gave the items and who
// received them, as typed. There are no signature lines"; Other documents, Transfer: "a PDF
// transfer note naming who sent the items and who received them, as typed, with no signature
// lines"; plan of 5.4, decided item 8; plan of 7.1, decided item 12). A transfer is seen by its
// sending and its receiving branch (documentWall(); plan of 7.2, decided item 3, Look first). The
// document is read with that wall of `data.view` inside the SQL, so an unknown id and another
// branch's document are alike "Not found" (03 rule 1; .claude/rules/server-actions.md, several
// ids); then `data.export` on the branch through which the user sees it (03 matrix "Export to
// Excel, download PDF, print"). Once received, a transfer's lines carry what arrived (plan of
// 7.2, decided item 12). Document and lines in one snapshot.

export type IssueNoteLine = {
  productName: string;
  /** The subtype's name; null for the hidden default subtype (04 rule 1). */
  subtypeName: string | null;
  /** numeric(14,3) text as stored. */
  qty: string;
  /** What arrived of a received transfer's line; null otherwise. */
  receivedQty: string | null;
  unitShortName: string;
};

export type DocumentNote = {
  type: "ISSUE" | "TRANSFER";
  number: string;
  status: DocumentStatus;
  docDate: string;
  branchCode: string;
  branchName: string;
  /** An issue's department; null on a transfer. */
  departmentName: string | null;
  /** A transfer's receiving branch; null on an issue. */
  toBranchCode: string | null;
  toBranchName: string | null;
  /** Who gave or sent the items: the document's maker. */
  givenBy: string;
  /**
   * Who received them, as typed; empty on an issue of "Give straight to requester" with nobody
   * named, and on a transfer whose sender named nobody (plan of 7.1, decided item 6).
   */
  receivedBy: string | null;
  comment: string | null;
  lines: IssueNoteLine[];
  /** Who downloads it, for the line on every page (05 Download 2, the style of the note). */
  downloadedBy: string;
  schoolName: string | null;
};

const idInput = z.uuid();

/**
 * The note of one issue or transfer, or null ("Not found") for an unknown id, another type, or
 * another branch's document.
 */
export async function getDocumentNote(
  userId: string,
  documentId: string,
): Promise<DocumentNote | null> {
  const parsed = idInput.safeParse(documentId);
  const actor = await authorizeList(userId, "data.view");
  if (!parsed.success) return null;
  const toBranch = alias(branches, "to_branch");
  return readSnapshot(async (tx) => {
    const [document] = await tx
      .select({
        id: stockDocuments.id,
        type: stockDocuments.type,
        number: stockDocuments.number,
        status: stockDocuments.status,
        docDate: stockDocuments.docDate,
        branchId: stockDocuments.branchId,
        toBranchId: stockDocuments.toBranchId,
        branchCode: branches.code,
        branchName: branches.name,
        departmentName: departments.name,
        toBranchCode: toBranch.code,
        toBranchName: toBranch.name,
        givenBy: users.fullName,
        receivedBy: stockDocuments.receivedByName,
        comment: stockDocuments.comment,
      })
      .from(stockDocuments)
      .innerJoin(branches, eq(branches.id, stockDocuments.branchId))
      .leftJoin(departments, eq(departments.id, stockDocuments.departmentId))
      .leftJoin(toBranch, eq(toBranch.id, stockDocuments.toBranchId))
      .innerJoin(users, eq(users.id, stockDocuments.createdBy))
      .where(
        and(
          eq(stockDocuments.id, parsed.data),
          inArray(stockDocuments.type, ["ISSUE", "TRANSFER"]),
          documentWall(actor),
        ),
      );
    if (!document) return null;
    // The sending branch, or, for one who sees a transfer only as its receiver, the receiving one.
    const seenFrom =
      actor.role === "HEAD" || actor.branchIds.includes(document.branchId) || !document.toBranchId
        ? document.branchId
        : document.toBranchId;
    await authorize(userId, "data.export", { branchId: seenFrom }, tx);
    const [me] = await tx.select({ name: users.fullName }).from(users).where(eq(users.id, userId));
    const settings = await readSettings(tx);
    const lines = await tx
      .select({
        productName: products.name,
        subtypeName: productVariants.name,
        isDefault: productVariants.isDefault,
        qty: stockDocumentLines.qty,
        receivedQty: stockDocumentLines.receivedQty,
        unitShortName: units.shortName,
      })
      .from(stockDocumentLines)
      .innerJoin(productVariants, eq(productVariants.id, stockDocumentLines.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(units, eq(units.id, products.unitId))
      .where(eq(stockDocumentLines.documentId, document.id))
      .orderBy(asc(products.name), asc(productVariants.name), asc(stockDocumentLines.id));
    return {
      type: document.type as DocumentNote["type"],
      number: document.number,
      status: document.status,
      docDate: document.docDate,
      branchCode: document.branchCode,
      branchName: document.branchName,
      departmentName: document.departmentName,
      toBranchCode: document.toBranchCode,
      toBranchName: document.toBranchName,
      givenBy: document.givenBy,
      receivedBy: document.receivedBy,
      comment: document.comment,
      lines: lines.map(({ isDefault, subtypeName, ...line }) => ({
        ...line,
        subtypeName: isDefault ? null : subtypeName,
      })),
      downloadedBy: me?.name ?? "",
      schoolName: settings.school_name,
    };
  });
}
