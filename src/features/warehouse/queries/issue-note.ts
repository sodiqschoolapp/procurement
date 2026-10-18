import { and, asc, eq } from "drizzle-orm";
import * as z from "zod";

import type { DocumentStatus } from "@/domain/stock-documents";
import { authorize, authorizeList, branchFilter } from "@/server/authorize";
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

// What the issue note PDF shows, GET /warehouse/documents/[id]/note (09-warehouse.md, Issue to a
// department 2: "a PDF issue note naming who gave the items and who received them, as typed. There
// are no signature lines"; plan of 5.4, decided item 8). The document is read with the branch
// filter of `data.view` inside the SQL, so an unknown id and another branch's document are alike
// "Not found" (03 rule 1; .claude/rules/server-actions.md, several ids); then `data.export` on its
// branch (03 matrix "Export to Excel, download PDF, print"). Document and lines in one snapshot.

export type IssueNoteLine = {
  productName: string;
  /** The subtype's name; null for the hidden default subtype (04 rule 1). */
  subtypeName: string | null;
  /** numeric(14,3) text as stored. */
  qty: string;
  unitShortName: string;
};

export type IssueNote = {
  number: string;
  status: DocumentStatus;
  docDate: string;
  branchCode: string;
  branchName: string;
  departmentName: string;
  /** Who gave the items: the document's maker. */
  givenBy: string;
  /** Who received them, as typed; empty on an issue of "Give straight to requester" with nobody named. */
  receivedBy: string | null;
  comment: string | null;
  lines: IssueNoteLine[];
};

const idInput = z.uuid();

/** The note of one issue, or null ("Not found") for an unknown id or another branch's document. */
export async function getIssueNote(userId: string, documentId: string): Promise<IssueNote | null> {
  const parsed = idInput.safeParse(documentId);
  const actor = await authorizeList(userId, "data.view");
  if (!parsed.success) return null;
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
        departmentName: departments.name,
        givenBy: users.fullName,
        receivedBy: stockDocuments.receivedByName,
        comment: stockDocuments.comment,
      })
      .from(stockDocuments)
      .innerJoin(branches, eq(branches.id, stockDocuments.branchId))
      .innerJoin(departments, eq(departments.id, stockDocuments.departmentId))
      .innerJoin(users, eq(users.id, stockDocuments.createdBy))
      .where(
        and(
          eq(stockDocuments.id, parsed.data),
          eq(stockDocuments.type, "ISSUE"),
          branchFilter(actor, stockDocuments.branchId),
        ),
      );
    if (!document) return null;
    await authorize(userId, "data.export", { branchId: document.branchId }, tx);
    const lines = await tx
      .select({
        productName: products.name,
        subtypeName: productVariants.name,
        isDefault: productVariants.isDefault,
        qty: stockDocumentLines.qty,
        unitShortName: units.shortName,
      })
      .from(stockDocumentLines)
      .innerJoin(productVariants, eq(productVariants.id, stockDocumentLines.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .innerJoin(units, eq(units.id, products.unitId))
      .where(eq(stockDocumentLines.documentId, document.id))
      .orderBy(asc(products.name), asc(productVariants.name), asc(stockDocumentLines.id));
    const { id: _id, branchId: _branch, ...shown } = document;
    return {
      ...shown,
      lines: lines.map(({ isDefault, subtypeName, ...line }) => ({
        ...line,
        subtypeName: isDefault ? null : subtypeName,
      })),
    };
  });
}
