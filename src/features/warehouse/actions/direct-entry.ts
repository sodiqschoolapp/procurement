import { asc, eq, inArray } from "drizzle-orm";
import * as z from "zod";

import { businessDate, isBusinessDate } from "@/domain/business-date";
import { draftComment, isDraftComment } from "@/domain/drafts";
import { parseSomOrZero } from "@/domain/money";
import {
  DIRECT_ENTRY_REASONS,
  DOCUMENT_LINES_MAX,
  type DirectEntryReason,
  directEntryCommentRefusal,
  directEntryLineRefusal,
} from "@/domain/stock-documents";
import { ActionError, defineAction } from "@/server/action";
import type { FieldMessageKey } from "@/server/action-result";
import { audit } from "@/server/audit";
import type { Executor } from "@/server/authorize";
import { now } from "@/server/clock";
import { branches, productVariants, products, stockDocuments, units } from "@/server/db/schema";
import { createDocument } from "@/server/stock-documents";

// Direct entry by the Head (09-warehouse.md, Direct entry by the Head; 03-roles-and-permissions.md,
// Permission matrix "Enter stock directly, without an order": the Head only; Decided ahead,
// question 12; plan of 5.8). The shape of ./return.ts: a create in the action wrapper, authorize
// `stock.enter_direct` on the input's branch (the Head, any branch), the safe repeat on
// `stock_documents.client_key`, then the write:
//
//   1  the branch, active (FOR SHARE; decided item 5); the date, up to today in Tashkent (decided
//      item 6); the comment, required for the reason "other" (directEntryCommentRefusal())
//   2  the products FOR SHARE in the order of their ids, then the subtypes FOR SHARE in the order
//      of their ids: each an active subtype of an active product of goods (decided item 7), its
//      quantity by the measure (edge case "Half a piece"); the cost whole so'm, 0 or more (decided
//      item 1, Look first)
//   3  createDocument() of src/server/stock-documents.ts: the ENT number, the document POSTED,
//      its lines with their cost and their DIRECT_ENTRY movements, which enter the moving average
//      like a receipt (Decided ahead, question 12), under the balance locks of the ledger. The
//      first movement of a product locks its type and measure (STOCK_USES of src/features/
//      catalog/actions/product-uses.ts).
//
// One lock order with the issue, the return and Record purchase: branch, products, subtypes,
// balances, then the number counter. The history step writes the audit row (09 Direct entry 2;
// decided item 4). No notification (decided item 9). The Excel import of ./import-stock.ts takes
// the branch through lockDirectEntryBranch(), checks its lines by directEntryLineRefusal() and
// writes its audit rows through recordDirectEntry() (plan of 5.9).

export type DirectEntryInput = {
  clientKey: string;
  branchId: string;
  /** `YYYY-MM-DD`, a Tashkent business date. */
  docDate: string;
  reason: (typeof DIRECT_ENTRY_REASONS)[number];
  comment: string | null;
  /** `unitCost`: whole so'm as typed ("12 000"), 0 or more. */
  lines: { variantId: string; qty: string; unitCost: string }[];
};

export type DirectEntryResult = { documentId: string; number: string };

const input = z
  .object({
    clientKey: z.uuid(),
    branchId: z.uuid(),
    docDate: z.string().refine(isBusinessDate),
    reason: z.enum(DIRECT_ENTRY_REASONS),
    comment: z
      .string()
      .nullish()
      .transform((value) => (value == null ? null : draftComment(value) || null))
      .refine((value) => value === null || isDraftComment(value), {
        params: { fieldError: "tooLong" },
      }),
    lines: z
      .array(
        z.object({
          variantId: z.uuid(),
          qty: z.string().trim().min(1).max(40),
          unitCost: z.string().max(40),
        }),
      )
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

/** The branch of a direct entry, held FOR SHARE (decided item 5): unknown or inactive is refused. */
export async function lockDirectEntryBranch(tx: Executor, branchId: string): Promise<void> {
  const [branch] = await tx
    .select({ isActive: branches.isActive })
    .from(branches)
    .where(eq(branches.id, branchId))
    .for("share");
  if (!branch) refuse("branchId", "errors.field.notAllowed");
  if (!branch.isActive) refuse("branchId", "errors.field.branchInactive");
}

/** Step 1: the branch, the date and the comment of "other". */
async function refuseHeader(tx: Executor, typed: DirectEntryInput) {
  await lockDirectEntryBranch(tx, typed.branchId);

  if (typed.docDate > businessDate(now())) refuse("docDate", "errors.field.inFuture");

  const refusal = directEntryCommentRefusal(typed.reason, typed.comment);
  if (refusal) refuse("comment", `errors.field.${refusal}`);
}

/** Step 2: the products, then the subtypes, locked in the one order; each line checked. */
async function refuseLines(tx: Executor, typed: DirectEntryInput): Promise<bigint[]> {
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
      allowsDecimals: units.allowDecimal,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(units, eq(units.id, products.unitId))
    .where(inArray(productVariants.id, ids))
    .orderBy(asc(productVariants.id))
    .for("share", { of: productVariants });
  const costs: bigint[] = [];
  for (const [at, line] of typed.lines.entries()) {
    const refusal = directEntryLineRefusal(
      rows.find((each) => each.id === line.variantId),
      line.qty,
    );
    if (refusal) refuse(`lines.${at}.${refusal.field}`, `errors.field.${refusal.kind}`);
    if (line.unitCost.trim() === "") refuse(`lines.${at}.unitCost`, "errors.field.required");
    const cost = parseSomOrZero(line.unitCost);
    if (cost === null) refuse(`lines.${at}.unitCost`, "errors.field.wrongFormat");
    costs.push(cost);
  }
  return costs;
}

export const enterStockDirectly = defineAction({
  name: "enterStockDirectly",
  permission: "stock.enter_direct",
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
        result: { documentId: row.documentId, number: row.number } satisfies DirectEntryResult,
        userId: row.userId,
        branchId: row.branchId,
      };
    },
  },
  async write({ tx, input: typed, userId }): Promise<DirectEntryResult> {
    await refuseHeader(tx, typed);
    const costs = await refuseLines(tx, typed);
    const created = await createDocument(tx, {
      type: "DIRECT_ENTRY",
      branchId: typed.branchId,
      docDate: typed.docDate,
      status: "POSTED",
      reason: typed.reason,
      comment: typed.comment,
      clientKey: typed.clientKey,
      createdBy: userId,
      lines: typed.lines.map((line, at) => ({
        variantId: line.variantId,
        qty: line.qty.trim(),
        unitCost: costs[at]!,
      })),
    });
    return { documentId: created.documentId, number: created.number };
  },
  async history({ tx, input: typed, userId }, result) {
    await recordDirectEntry(tx, userId, {
      ...result,
      branchId: typed.branchId,
      docDate: typed.docDate,
      reason: typed.reason,
      comment: typed.comment,
      lines: typed.lines.map((line) => ({
        variantId: line.variantId,
        qty: line.qty.trim(),
        unitCost: parseSomOrZero(line.unitCost)!,
      })),
    });
  },
});

/** What the audit row of one direct entry holds (09 Direct entry 2; decided item 4). */
export type RecordedDirectEntry = DirectEntryResult & {
  branchId: string;
  docDate: string;
  reason: DirectEntryReason;
  comment: string | null;
  lines: { variantId: string; qty: string; unitCost: bigint }[];
};

/** The `direct_entry.create` audit row of one document, typed in the form or imported. */
export async function recordDirectEntry(
  tx: Executor,
  userId: string,
  entry: RecordedDirectEntry,
): Promise<void> {
  const [branch] = await tx
    .select({ code: branches.code })
    .from(branches)
    .where(eq(branches.id, entry.branchId));
  await audit(
    { tx, userId },
    {
      action: "direct_entry.create",
      entity: "stock_documents",
      entityId: entry.documentId,
      before: null,
      after: {
        number: entry.number,
        branchId: entry.branchId,
        branch: branch!.code,
        docDate: entry.docDate,
        reason: entry.reason,
        comment: entry.comment,
        status: "POSTED",
        lines: entry.lines.map((line) => ({
          variantId: line.variantId,
          qty: line.qty,
          unitCost: line.unitCost.toString(),
        })),
      },
      at: now(),
    },
  );
}
