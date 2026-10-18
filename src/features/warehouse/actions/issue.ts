import { and, asc, eq, inArray } from "drizzle-orm";
import * as z from "zod";

import { businessDate, isBusinessDate } from "@/domain/business-date";
import { draftComment, isDraftComment, quantityRefusal } from "@/domain/drafts";
import { ISSUE_LINES_MAX } from "@/domain/stock-documents";
import { fullName, isFullName } from "@/domain/users";
import { ActionError, defineAction } from "@/server/action";
import type { FieldMessageKey } from "@/server/action-result";
import type { Executor } from "@/server/authorize";
import { now } from "@/server/clock";
import {
  branches,
  departments,
  productVariants,
  products,
  stockDocuments,
  units,
} from "@/server/db/schema";
import { createDocument } from "@/server/stock-documents";
import { StockShortError } from "@/server/stock-ledger";

// Issue to a department (09-warehouse.md, Issue to a department; 03-roles-and-permissions.md,
// Permission matrix "Issue, return, transfer stock", Manager right ISSUE_STOCK; plan of 5.4). A
// create in the action wrapper: authorize `stock.issue` on the input's branch (the Head in any
// branch, a Manager in their own with ISSUE_STOCK on), the safe repeat on
// `stock_documents.client_key`, then the write:
//
//   1  the branch, active (FOR SHARE; decided item 13); the date, up to today in Tashkent
//      (decided item 5); the department, active and of the branch (FOR SHARE)
//   2  the products FOR SHARE in the order of their ids, then the subtypes FOR SHARE in the order
//      of their ids: each an active subtype of an active product of goods (decided item 3, Look
//      first), its quantity by the measure (edge case "Half a piece")
//   3  createDocument() of src/server/stock-documents.ts: the ISS number, the document, its lines
//      and their ISSUE movements at the average (09 Stock value), under the balance locks of the
//      ledger. A line the stock cannot cover is refused there, under the lock (09 Issue 1), as the
//      field of that line with the amount left (decided item 2, Look first); nothing is saved.
//
// One lock order with Record purchase (decided item 15, Look first; .claude/rules/server-actions.md):
// both take the products FOR SHARE, then the subtypes in the order of their ids (this action FOR
// SHARE, record-purchase.ts FOR UPDATE), so two writers of one subtype meet there first. Then this
// action takes the ISS number and the balances; a purchase with "Give straight to requester" takes
// the balances and then the ISS number. They meet at the number counter only on different
// subtypes, where the issue holds the counter and waits for nothing the purchase holds.
//
// No notification and no audit row (decided item 12): the document with its maker is the record.

export type IssueInput = {
  clientKey: string;
  branchId: string;
  /** `YYYY-MM-DD`, a Tashkent business date. */
  docDate: string;
  departmentId: string;
  receivedByName: string;
  comment: string | null;
  lines: { variantId: string; qty: string }[];
};

export type IssueResult = { documentId: string; number: string };

const input = z
  .object({
    clientKey: z.uuid(),
    branchId: z.uuid(),
    docDate: z.string().refine(isBusinessDate),
    departmentId: z.uuid(),
    // Required on the form (decided item 4): the note names who received the items (09 Issue 2).
    receivedByName: z.string().transform(fullName).refine(isFullName),
    comment: z
      .string()
      .nullish()
      .transform((value) => (value == null ? null : draftComment(value) || null))
      .refine((value) => value === null || isDraftComment(value), {
        params: { fieldError: "tooLong" },
      }),
    lines: z
      .array(z.object({ variantId: z.uuid(), qty: z.string().trim().min(1).max(40) }))
      .min(1)
      .max(ISSUE_LINES_MAX),
  })
  .refine(
    (value) => new Set(value.lines.map((line) => line.variantId)).size === value.lines.length,
    {
      path: ["lines"],
      message: "A subtype is given twice.",
    },
  );

function refuse(field: string, kind: FieldMessageKey): never {
  throw new ActionError("invalid_input", { [field]: kind });
}

/** Step 1: the branch, the date and the department (header). */
async function refuseHeader(tx: Executor, typed: IssueInput) {
  const [branch] = await tx
    .select({ isActive: branches.isActive })
    .from(branches)
    .where(eq(branches.id, typed.branchId))
    .for("share");
  if (!branch) refuse("branchId", "errors.field.notAllowed");
  if (!branch.isActive) refuse("branchId", "errors.field.branchInactive");

  if (typed.docDate > businessDate(now())) refuse("docDate", "errors.field.inFuture");

  const [department] = await tx
    .select({ isActive: departments.isActive })
    .from(departments)
    .where(and(eq(departments.id, typed.departmentId), eq(departments.branchId, typed.branchId)))
    .for("share");
  if (!department) refuse("departmentId", "errors.field.notAllowed");
  if (!department.isActive) refuse("departmentId", "errors.field.inactive");
}

/** Step 2: the products, then the subtypes, locked in the one order; each line checked. */
async function refuseLines(tx: Executor, typed: IssueInput) {
  const ids = [...new Set(typed.lines.map((line) => line.variantId))].sort();
  // A subtype's product never changes, so it is read without a lock before the product is locked.
  const owners = await tx
    .select({ productId: productVariants.productId })
    .from(productVariants)
    .where(inArray(productVariants.id, ids));
  const productIds = [...new Set(owners.map((row) => row.productId))].sort();
  if (productIds.length > 0) {
    await tx
      .select({ id: products.id })
      .from(products)
      .where(inArray(products.id, productIds))
      .orderBy(asc(products.id))
      .for("share");
  }
  const rows = await tx
    .select({
      id: productVariants.id,
      isActive: productVariants.isActive,
      productActive: products.isActive,
      type: products.type,
      allowDecimal: units.allowDecimal,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(units, eq(units.id, products.unitId))
    .where(inArray(productVariants.id, ids))
    .orderBy(asc(productVariants.id))
    .for("share", { of: productVariants });
  for (const [at, line] of typed.lines.entries()) {
    const row = rows.find((each) => each.id === line.variantId);
    // A service never enters stock (A7), so it is never issued.
    if (!row || row.type !== "GOODS") refuse(`lines.${at}.variantId`, "errors.field.notAllowed");
    if (!row.isActive || !row.productActive) {
      refuse(`lines.${at}.variantId`, "errors.field.inactive");
    }
    const refusal = quantityRefusal(line.qty, row.allowDecimal);
    if (refusal) refuse(`lines.${at}.qty`, `errors.field.${refusal}`);
  }
}

export const issueStock = defineAction({
  name: "issueStock",
  permission: "stock.issue",
  input,
  // A create: the branch comes from the input and is authorized as such (decisions 0.7).
  async target({ input: typed }) {
    return { branchId: typed.branchId };
  },
  repeat: {
    clientKey: (typed) => typed.clientKey,
    async find(tx, clientKey) {
      const [row] = await tx
        .select({
          documentId: stockDocuments.id,
          number: stockDocuments.number,
          userId: stockDocuments.createdBy,
          branchId: stockDocuments.branchId,
        })
        .from(stockDocuments)
        .where(eq(stockDocuments.clientKey, clientKey));
      if (!row) return null;
      // The wrapper answers it only to its maker in its branch (developer-rules.md rule 8).
      return {
        result: { documentId: row.documentId, number: row.number } satisfies IssueResult,
        userId: row.userId,
        branchId: row.branchId,
      };
    },
  },
  async write({ tx, input: typed, userId }): Promise<IssueResult> {
    await refuseHeader(tx, typed);
    await refuseLines(tx, typed);
    const lines = typed.lines.map((line) => ({ variantId: line.variantId, qty: line.qty.trim() }));
    try {
      const created = await createDocument(tx, {
        type: "ISSUE",
        branchId: typed.branchId,
        departmentId: typed.departmentId,
        receivedByName: typed.receivedByName,
        docDate: typed.docDate,
        status: "POSTED",
        comment: typed.comment,
        clientKey: typed.clientKey,
        createdBy: userId,
        lines,
      });
      return { documentId: created.documentId, number: created.number };
    } catch (error) {
      if (!(error instanceof StockShortError)) throw error;
      // The branch is the input's, which authorize() passed: the amount is of a branch the actor
      // may issue in (progress 5.1, "For 5.4").
      const at = lines.findIndex((line) => line.variantId === error.variantId);
      const field = `lines.${at}.qty`;
      throw new ActionError(
        "invalid_input",
        { [field]: "errors.field.stockShort" },
        { [field]: error.available },
      );
    }
  },
});
