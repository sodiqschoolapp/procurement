import { and, asc, eq, inArray } from "drizzle-orm";
import * as z from "zod";

import { businessDate, isBusinessDate } from "@/domain/business-date";
import { draftComment, isDraftComment, quantityRefusal } from "@/domain/drafts";
import { DOCUMENT_LINES_MAX } from "@/domain/stock-documents";
import { fullName, isFullName } from "@/domain/users";
import { ActionError, defineAction } from "@/server/action";
import type { FieldMessageKey } from "@/server/action-result";
import type { Executor } from "@/server/authorize";
import { now } from "@/server/clock";
import {
  branches,
  productVariants,
  products,
  stockDocuments,
  units,
  userBranches,
  users,
} from "@/server/db/schema";
import { notify } from "@/server/notify";
import { createDocument } from "@/server/stock-documents";
import { StockShortError } from "@/server/stock-ledger";

// Send a transfer (09-warehouse.md, Movement types: "Transfer to another branch | Down at the
// sender, up at the receiver | Sending Manager; the receiving Manager confirms"; Other documents,
// Transfer: "The sender picks the other branch and the items; stock leaves the sender at once and
// the transfer shows 'In transit'"; 03-roles-and-permissions.md, Permission matrix "Issue, return,
// transfer stock", Manager right TRANSFER_STOCK; plan of 7.1). The issue's shape (./issue.ts): a
// create in the action wrapper, authorize `stock.transfer` on the input's sending branch (the
// Head in any branch, a Manager in their own with TRANSFER_STOCK on), the safe repeat on
// `stock_documents.client_key`, then the write:
//
//   1  both branches FOR SHARE in the order of their ids, each active under that lock, so a
//      deactivation (setBranchActive, FOR UPDATE) waits and then sees the transfer (decided item
//      4, Look first); the receiving branch any active branch but the sender (decided item 1,
//      Look first); the date, up to today in Tashkent
//   2  the products FOR SHARE in the order of their ids, then the subtypes FOR SHARE in the order
//      of their ids: each an active subtype of an active product of goods (decided item 10), its
//      quantity by the measure (edge case "Half a piece")
//   3  createDocument() of src/server/stock-documents.ts: the TRF number of the sender, the
//      document IN_TRANSIT with `to_branch_id`, its lines and their TRANSFER_OUT movements at the
//      sender's average (09 Stock value; decided item 2, Look first), under the balance locks of
//      the ledger. Nothing moves at the receiver until 7.2 receives it. A line the stock cannot
//      cover is refused under the lock, as the issue's is; nothing is saved.
//
// No audit row (decided item 11). The notify step tells every active Manager of the receiving
// branch, whatever their rights, and nobody else ("Transfer sent"; decided items 3 and 8).

export type TransferInput = {
  clientKey: string;
  branchId: string;
  toBranchId: string;
  /** `YYYY-MM-DD`, a Tashkent business date. */
  docDate: string;
  /** Who will take the items, as typed; optional (decided item 6). */
  receivedByName: string | null;
  comment: string | null;
  lines: { variantId: string; qty: string }[];
};

export type TransferResult = { documentId: string; number: string };

const input = z
  .object({
    clientKey: z.uuid(),
    branchId: z.uuid(),
    toBranchId: z.uuid(),
    docDate: z.string().refine(isBusinessDate),
    receivedByName: z
      .string()
      .nullish()
      .transform((value) => (value == null ? null : fullName(value) || null))
      .refine((value) => value === null || isFullName(value)),
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

/** Step 1: both branches under one lock order, and the date (header). */
async function refuseHeader(tx: Executor, typed: Typed) {
  if (typed.toBranchId === typed.branchId) refuse("toBranchId", "errors.field.notAllowed");
  const held = await tx
    .select({ id: branches.id, isActive: branches.isActive })
    .from(branches)
    .where(inArray(branches.id, [typed.branchId, typed.toBranchId]))
    .orderBy(asc(branches.id))
    .for("share");
  const from = held.find((row) => row.id === typed.branchId);
  const to = held.find((row) => row.id === typed.toBranchId);
  if (!from) refuse("branchId", "errors.field.notAllowed");
  if (!from.isActive) refuse("branchId", "errors.field.branchInactive");
  if (!to) refuse("toBranchId", "errors.field.notAllowed");
  if (!to.isActive) refuse("toBranchId", "errors.field.branchInactive");

  if (typed.docDate > businessDate(now())) refuse("docDate", "errors.field.inFuture");
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
  for (const [at, line] of typed.lines.entries()) {
    const row = rows.find((each) => each.id === line.variantId);
    // A service never enters stock (A7), so it is never sent.
    if (!row || row.type !== "GOODS") refuse(`lines.${at}.variantId`, "errors.field.notAllowed");
    if (!row.isActive || !row.productActive) {
      refuse(`lines.${at}.variantId`, "errors.field.inactive");
    }
    const refusal = quantityRefusal(line.qty, row.allowDecimal);
    if (refusal) refuse(`lines.${at}.qty`, `errors.field.${refusal}`);
  }
}

export const sendTransfer = defineAction({
  name: "sendTransfer",
  permission: "stock.transfer",
  input,
  // A create: the sending branch comes from the input and is authorized as such (decisions 0.7).
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
        result: { documentId: row.documentId, number: row.number } satisfies TransferResult,
        userId: row.userId,
        branchId: row.branchId,
      };
    },
  },
  async write({ tx, input: typed, userId }): Promise<TransferResult> {
    await refuseHeader(tx, typed);
    await refuseLines(tx, typed);
    const lines = typed.lines.map((line) => ({ variantId: line.variantId, qty: line.qty.trim() }));
    try {
      const created = await createDocument(tx, {
        type: "TRANSFER",
        branchId: typed.branchId,
        toBranchId: typed.toBranchId,
        receivedByName: typed.receivedByName,
        docDate: typed.docDate,
        status: "IN_TRANSIT",
        comment: typed.comment,
        clientKey: typed.clientKey,
        createdBy: userId,
        lines,
      });
      return { documentId: created.documentId, number: created.number };
    } catch (error) {
      if (!(error instanceof StockShortError)) throw error;
      // The branch is the input's sending branch, which authorize() passed (progress 5.1).
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
    const managers = await tx
      .select({ id: users.id })
      .from(users)
      .innerJoin(userBranches, eq(userBranches.userId, users.id))
      .where(
        and(
          eq(userBranches.branchId, typed.toBranchId),
          eq(users.role, "MANAGER"),
          eq(users.isActive, true),
        ),
      );
    const [maker] = await tx
      .select({ name: users.fullName })
      .from(users)
      .where(eq(users.id, userId));
    const [sender] = await tx
      .select({ code: branches.code })
      .from(branches)
      .where(eq(branches.id, typed.branchId));
    await notify(
      { tx, userId },
      {
        to: managers.map((manager) => manager.id),
        type: "TRANSFER_SENT",
        params: { actor: maker!.name, number: result.number, branch: sender!.code },
        // The receiving branch: notify() keeps only its people (decided item 3, Look first).
        branchId: typed.toBranchId,
        link: `/warehouse/documents/${result.documentId}`,
        at: now(),
      },
    );
  },
});
