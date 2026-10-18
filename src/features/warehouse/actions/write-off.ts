import { and, asc, eq, inArray } from "drizzle-orm";
import * as z from "zod";

import { businessDate, isBusinessDate } from "@/domain/business-date";
import { draftComment, isDraftComment } from "@/domain/drafts";
import {
  DOCUMENT_LINES_MAX,
  WRITE_OFF_REASONS,
  issueQuantityRefusal,
  writeOffCommentRefusal,
} from "@/domain/stock-documents";
import { ActionError, defineAction } from "@/server/action";
import type { FieldMessageKey } from "@/server/action-result";
import type { Executor } from "@/server/authorize";
import { now } from "@/server/clock";
import {
  branches,
  productVariants,
  products,
  stockBalances,
  stockDocuments,
  units,
  users,
} from "@/server/db/schema";
import { notify } from "@/server/notify";
import { createDocument } from "@/server/stock-documents";
import { StockShortError } from "@/server/stock-ledger";

// Ask for a write-off (09-warehouse.md, Movement types: "Write-off … Down | Manager asks | Head";
// Other documents, Write-off; 03-roles-and-permissions.md, Permission matrix "Ask for a write-off
// or stock correction", Manager right WRITE_OFF_COUNT; Decided ahead, question 13; plan of 5.11).
// The issue's shape (./issue.ts): a create in the action wrapper, authorize `stock.ask_write_off`
// on the input's branch (the Head in any branch, a Manager in their own with WRITE_OFF_COUNT on),
// the safe repeat on `stock_documents.client_key`, then the write:
//
//   1  the branch, active (FOR SHARE); the date, up to today in Tashkent (decided item 8); the
//      comment, required for every reason (writeOffCommentRefusal(); decided item 7)
//   2  the products FOR SHARE in the order of their ids, then the subtypes FOR SHARE in the order
//      of their ids: each an active subtype of an active product of goods (decided item 9; 04
//      rule 2), its quantity by the measure and not above the stock of this moment
//      (issueQuantityRefusal(); decided item 3, Look first)
//   3  createDocument() of src/server/stock-documents.ts: the WOF number and the document with its
//      lines. A Manager's waits PENDING_APPROVAL and moves no stock ("Stock changes only after
//      the Head approves"); the Head's is POSTED at once with `decided_by` the Head (decided item
//      1, Look first), its WRITE_OFF movements at the average (09 Stock value) under the ledger's
//      locks, and a line the stock cannot cover there is refused as the issue's is.
//
// The lock order of the issue: branch, products, subtypes, then the number counter (and, for the
// Head, the balances). No audit row (decided item 10). A Manager's write-off tells every active
// Head ("Write-off or correction asked"); the Head's tells nobody, since nobody else decides it.

export type WriteOffInput = {
  clientKey: string;
  branchId: string;
  /** `YYYY-MM-DD`, a Tashkent business date. */
  docDate: string;
  reason: (typeof WRITE_OFF_REASONS)[number];
  comment: string;
  lines: { variantId: string; qty: string }[];
};

export type WriteOffResult = { documentId: string; number: string; posted: boolean };

const input = z
  .object({
    clientKey: z.uuid(),
    branchId: z.uuid(),
    docDate: z.string().refine(isBusinessDate),
    reason: z.enum(WRITE_OFF_REASONS),
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

type Typed = z.output<typeof input>;

function refuse(field: string, kind: FieldMessageKey): never {
  throw new ActionError("invalid_input", { [field]: kind });
}

/** Step 1: the branch, the date and the comment. */
async function refuseHeader(tx: Executor, typed: Typed) {
  const [branch] = await tx
    .select({ isActive: branches.isActive })
    .from(branches)
    .where(eq(branches.id, typed.branchId))
    .for("share");
  if (!branch) refuse("branchId", "errors.field.notAllowed");
  if (!branch.isActive) refuse("branchId", "errors.field.branchInactive");

  if (typed.docDate > businessDate(now())) refuse("docDate", "errors.field.inFuture");

  const refusal = writeOffCommentRefusal(typed.comment);
  if (refusal) refuse("comment", `errors.field.${refusal}`);
}

/** Step 2: the products, then the subtypes, locked in the one order; each line checked. */
async function refuseLines(tx: Executor, typed: Typed) {
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
  // The stock of this moment, read without a lock: a waiting write-off holds none, and the check
  // that counts is the approval's, under the ledger's locks (decided items 2 and 3).
  const held = await tx
    .select({ variantId: stockBalances.variantId, qty: stockBalances.qty })
    .from(stockBalances)
    .where(and(eq(stockBalances.branchId, typed.branchId), inArray(stockBalances.variantId, ids)));
  for (const [at, line] of typed.lines.entries()) {
    const row = rows.find((each) => each.id === line.variantId);
    // A service never enters stock (A7), so it is never written off.
    if (!row || row.type !== "GOODS") refuse(`lines.${at}.variantId`, "errors.field.notAllowed");
    if (!row.isActive || !row.productActive) {
      refuse(`lines.${at}.variantId`, "errors.field.inactive");
    }
    const inStock = held.find((each) => each.variantId === line.variantId)?.qty ?? "0";
    const refusal = issueQuantityRefusal(line.qty, row.allowDecimal, inStock);
    if (refusal === "stockShort") {
      const field = `lines.${at}.qty`;
      throw new ActionError(
        "invalid_input",
        { [field]: "errors.field.stockShort" },
        { [field]: inStock },
      );
    }
    if (refusal) refuse(`lines.${at}.qty`, `errors.field.${refusal}`);
  }
}

export const askWriteOff = defineAction({
  name: "askWriteOff",
  permission: "stock.ask_write_off",
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
          status: stockDocuments.status,
          userId: stockDocuments.createdBy,
          branchId: stockDocuments.branchId,
        })
        .from(stockDocuments)
        .where(eq(stockDocuments.clientKey, clientKey));
      if (!row) return null;
      // The wrapper answers it only to its maker in its branch (developer-rules.md rule 8).
      return {
        result: {
          documentId: row.documentId,
          number: row.number,
          posted: row.status !== "PENDING_APPROVAL",
        } satisfies WriteOffResult,
        userId: row.userId,
        branchId: row.branchId,
      };
    },
  },
  async write({ tx, input: typed, userId, actor }): Promise<WriteOffResult> {
    await refuseHeader(tx, typed);
    await refuseLines(tx, typed);
    const lines = typed.lines.map((line) => ({ variantId: line.variantId, qty: line.qty.trim() }));
    const byHead = actor.role === "HEAD";
    try {
      const created = await createDocument(tx, {
        type: "WRITE_OFF",
        branchId: typed.branchId,
        docDate: typed.docDate,
        status: byHead ? "POSTED" : "PENDING_APPROVAL",
        reason: typed.reason,
        comment: typed.comment,
        clientKey: typed.clientKey,
        createdBy: userId,
        decidedBy: byHead ? userId : null,
        lines,
      });
      return { documentId: created.documentId, number: created.number, posted: byHead };
    } catch (error) {
      if (!(error instanceof StockShortError)) throw error;
      // The branch is the input's, which authorize() passed (progress 5.1, "For 5.4").
      const at = lines.findIndex((line) => line.variantId === error.variantId);
      const field = `lines.${at}.qty`;
      throw new ActionError(
        "invalid_input",
        { [field]: "errors.field.stockShort" },
        { [field]: error.available },
      );
    }
  },
  async notify({ tx, input: typed, userId }, result) {
    if (result.posted) return;
    const heads = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "HEAD"), eq(users.isActive, true)));
    const [maker] = await tx
      .select({ name: users.fullName })
      .from(users)
      .where(eq(users.id, userId));
    const [branch] = await tx
      .select({ code: branches.code })
      .from(branches)
      .where(eq(branches.id, typed.branchId));
    await notify(
      { tx, userId },
      {
        to: heads.map((head) => head.id),
        type: "STOCK_CHANGE_ASKED",
        params: {
          actor: maker!.name,
          number: result.number,
          branch: branch!.code,
          kind: "WRITE_OFF",
        },
        branchId: typed.branchId,
        link: `/warehouse/documents/${result.documentId}`,
        at: now(),
      },
    );
  },
});
