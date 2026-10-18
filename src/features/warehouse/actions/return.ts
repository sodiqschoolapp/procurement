import { and, asc, eq, inArray } from "drizzle-orm";
import * as z from "zod";

import { businessDate, isBusinessDate } from "@/domain/business-date";
import { draftComment, isDraftComment, quantityRefusal } from "@/domain/drafts";
import { DOCUMENT_LINES_MAX, overReturn } from "@/domain/stock-documents";
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
import { departmentIssueCost, departmentReceived } from "@/server/department-received";
import { createDocument } from "@/server/stock-documents";

// Return from a department (09-warehouse.md, Other documents: "Pick the department, items and
// quantities; stock goes up. Returning more than that department ever received shows a warning and
// needs a comment"; 03-roles-and-permissions.md, Permission matrix "Issue, return, transfer
// stock", Manager right RETURN_REVERSE; plan of 5.6). The shape of ./issue.ts: a create in the
// action wrapper, authorize `stock.return_reverse` on the input's branch (the Head in any branch,
// a Manager in their own with RETURN_REVERSE on; decided item 4, Look first), the safe repeat on
// `stock_documents.client_key`, then the write:
//
//   1  the branch, active (FOR SHARE); the date, up to today in Tashkent (decided item 6); the
//      department, active and of the branch, FOR UPDATE (decided item 3): two returns of one
//      department wait here, so the second counts the first; an issue takes it FOR SHARE
//   2  the products FOR SHARE in the order of their ids, then the subtypes FOR SHARE in the order
//      of their ids: each an active subtype of an active product of goods (decided item 8), its
//      quantity by the measure (edge case "Half a piece")
//   3  the department's net received amount per subtype (departmentReceived(), decided item 2,
//      Look first): a line over it needs the document's comment; without one the whole return is
//      refused, each line over named with its amount (decided item 5)
//   4  the cost each line comes in at if the stock is empty (departmentIssueCost(), decided item
//      1, Look first), kept in the line's `unit_cost`; then createDocument() of src/server/
//      stock-documents.ts: the RET number, the document, its lines and their RETURN movements,
//      at the average, under the balance locks of the ledger.
//
// One lock order with the issue and Record purchase: branch, department, products, subtypes,
// balances, then the number counter. No notification and no audit row (decided item 9).

export type ReturnInput = {
  clientKey: string;
  branchId: string;
  /** `YYYY-MM-DD`, a Tashkent business date. */
  docDate: string;
  departmentId: string;
  comment: string | null;
  lines: { variantId: string; qty: string }[];
};

export type ReturnResult = { documentId: string; number: string };

const input = z
  .object({
    clientKey: z.uuid(),
    branchId: z.uuid(),
    docDate: z.string().refine(isBusinessDate),
    departmentId: z.uuid(),
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
      .max(DOCUMENT_LINES_MAX),
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

/** Step 1: the branch, the date and the department (header); the department FOR UPDATE. */
async function refuseHeader(tx: Executor, typed: ReturnInput) {
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
    .for("update");
  if (!department) refuse("departmentId", "errors.field.notAllowed");
  if (!department.isActive) refuse("departmentId", "errors.field.inactive");
}

/** Step 2: the products, then the subtypes, locked in the one order; each line checked. */
async function refuseLines(tx: Executor, typed: ReturnInput) {
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
    // A service never enters stock (A7), so it is never returned.
    if (!row || row.type !== "GOODS") refuse(`lines.${at}.variantId`, "errors.field.notAllowed");
    if (!row.isActive || !row.productActive) {
      refuse(`lines.${at}.variantId`, "errors.field.inactive");
    }
    const refusal = quantityRefusal(line.qty, row.allowDecimal);
    if (refusal) refuse(`lines.${at}.qty`, `errors.field.${refusal}`);
  }
}

/** Step 3: a line over what the department received needs the comment (decided items 2 and 5). */
async function refuseOverReturn(tx: Executor, typed: ReturnInput) {
  if (typed.comment !== null) return;
  const received = await departmentReceived(tx, {
    branchId: typed.branchId,
    departmentId: typed.departmentId,
    variantIds: typed.lines.map((line) => line.variantId),
  });
  const fields: Record<string, FieldMessageKey> = {};
  const amounts: Record<string, string> = {};
  for (const [at, line] of typed.lines.entries()) {
    const got = received.get(line.variantId)!;
    if (!overReturn(line.qty, got)) continue;
    fields[`lines.${at}.qty`] = "errors.field.overReturn";
    amounts[`lines.${at}.qty`] = got;
  }
  if (Object.keys(fields).length === 0) return;
  // The branch is the input's, which authorize() passed: the amounts are of a branch the actor
  // may return in.
  throw new ActionError(
    "invalid_input",
    { ...fields, comment: "errors.field.overReturnComment" },
    amounts,
  );
}

export const returnStock = defineAction({
  name: "returnStock",
  permission: "stock.return_reverse",
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
        result: { documentId: row.documentId, number: row.number } satisfies ReturnResult,
        userId: row.userId,
        branchId: row.branchId,
      };
    },
  },
  async write({ tx, input: typed, userId }): Promise<ReturnResult> {
    await refuseHeader(tx, typed);
    await refuseLines(tx, typed);
    const lines = typed.lines.map((line) => ({ variantId: line.variantId, qty: line.qty.trim() }));
    await refuseOverReturn(tx, { ...typed, lines });
    const costs = await departmentIssueCost(tx, {
      branchId: typed.branchId,
      departmentId: typed.departmentId,
      variantIds: lines.map((line) => line.variantId),
    });
    const created = await createDocument(tx, {
      type: "RETURN",
      branchId: typed.branchId,
      departmentId: typed.departmentId,
      docDate: typed.docDate,
      status: "POSTED",
      comment: typed.comment,
      clientKey: typed.clientKey,
      createdBy: userId,
      lines: lines.map((line) => ({ ...line, unitCost: costs.get(line.variantId)! })),
    });
    return { documentId: created.documentId, number: created.number };
  },
});
