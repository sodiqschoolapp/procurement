import { eq, sql } from "drizzle-orm";
import * as z from "zod";

import { businessDate } from "@/domain/business-date";
import { draftComment, isDraftComment } from "@/domain/drafts";
import { countTypingAllowed, countedQuantityRefusal } from "@/domain/stock-documents";
import { ActionError, defineAction } from "@/server/action";
import type { FieldMessageKey } from "@/server/action-result";
import { now } from "@/server/clock";
import { branches, categories, stockDocuments } from "@/server/db/schema";
import { type LockedDocument, createDocument, lockDocument } from "@/server/stock-documents";

// Stock counts (09-warehouse.md, Other documents, Stock count: "The Manager starts a count for a
// branch or a category and types the counted quantities. The system shows the differences";
// 03-roles-and-permissions.md, Manager rights: WRITE_OFF_COUNT, "Ask for write-offs and run stock
// counts"; plan of 7.3). Both actions are `stock.start_count`: the Head in any branch, a Manager in
// their own with WRITE_OFF_COUNT on (decided item 4, Look first).
//
// startCount, a create on the input's branch with the safe repeat on `client_key`:
//   1  the branch, active (FOR SHARE); the category, when given, exists
//   2  the balance rows of the branch (and the category) FOR SHARE in the order of their subtype
//      ids, the order of postMovements(): a ledger writer that holds one commits first and is in
//      the stock at start; one that comes later waits until the start commits (decided item 2,
//      Look first; review of the plan, must fix 1)
//   3  in a statement of its own, each item's stock and the `seq` of its newest movement in the
//      branch; none: `nothingToCount`
//   4  createDocument(): the CNT number, PENDING_APPROVAL (decided item 1, Look first), one line
//      per item with `qty` the stock at start and `start_seq`; no stock moves.
// The items are the rows Stock on hand shows: every balance row, at 0 and of inactive products too
// (decided item 3, Look first). The category is not stored (decided item 7). No notification and
// no audit row (decided item 9).
//
// saveCountedQuantities, not a create: the count locked (lockDocument()), its branch authorized
// from the database; not a count is "Not found"; countTypingAllowed() under the lock; the lines
// must be lines of this count; each quantity is empty (not counted) or countedQuantityRefusal()
// null by the measure. Only the lines sent change, so two people typing different lines both keep
// theirs (decided item 6).

export type StartCountInput = {
  clientKey: string;
  branchId: string;
  /** One category, or null for the whole branch. */
  categoryId: string | null;
  comment: string | null;
};

export type StartCountResult = { documentId: string; number: string };

const startInput = z.object({
  clientKey: z.uuid(),
  branchId: z.uuid(),
  categoryId: z
    .uuid()
    .nullish()
    .transform((value) => value ?? null),
  comment: z
    .string()
    .nullish()
    .transform((value) => (value == null ? null : draftComment(value) || null))
    .refine((value) => value === null || isDraftComment(value), {
      params: { fieldError: "tooLong" },
    }),
});

function refuse(field: string, kind: FieldMessageKey): never {
  throw new ActionError("invalid_input", { [field]: kind });
}

export const startCount = defineAction({
  name: "startCount",
  permission: "stock.start_count",
  input: startInput,
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
        result: { documentId: row.documentId, number: row.number } satisfies StartCountResult,
        userId: row.userId,
        branchId: row.branchId,
      };
    },
  },
  async write({ tx, input: typed, userId }): Promise<StartCountResult> {
    const [branch] = await tx
      .select({ isActive: branches.isActive })
      .from(branches)
      .where(eq(branches.id, typed.branchId))
      .for("share");
    if (!branch) refuse("branchId", "errors.field.notAllowed");
    if (!branch.isActive) refuse("branchId", "errors.field.branchInactive");
    if (typed.categoryId) {
      const [category] = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.id, typed.categoryId));
      if (!category) refuse("categoryId", "errors.field.notAllowed");
    }

    const inCategory = typed.categoryId
      ? sql`and exists (select 1 from product_variants v join products p on p.id = v.product_id
          where v.id = b.variant_id and p.category_id = ${typed.categoryId})`
      : sql``;
    await tx.execute(sql`
      select b.variant_id from stock_balances b
      where b.branch_id = ${typed.branchId} ${inCategory}
      order by b.variant_id
      for share of b`);
    const items = await tx.execute<{ variant_id: string; qty: string; start_seq: string | null }>(
      sql`
      select b.variant_id, b.qty::text as qty,
        (select max(m.seq) from stock_movements m
          where m.branch_id = b.branch_id and m.variant_id = b.variant_id)::text as start_seq
      from stock_balances b
      where b.branch_id = ${typed.branchId} ${inCategory}
      order by b.variant_id`,
    );
    if (items.rows.length === 0) {
      refuse(typed.categoryId ? "categoryId" : "branchId", "errors.field.nothingToCount");
    }

    const created = await createDocument(tx, {
      type: "COUNT",
      branchId: typed.branchId,
      docDate: businessDate(now()),
      status: "PENDING_APPROVAL",
      comment: typed.comment,
      clientKey: typed.clientKey,
      createdBy: userId,
      lines: items.rows.map((item) => ({
        variantId: item.variant_id,
        qty: item.qty,
        countedQty: null,
        startSeq: item.start_seq === null ? null : BigInt(item.start_seq),
      })),
    });
    return { documentId: created.documentId, number: created.number };
  },
});

export type SaveCountedQuantitiesInput = {
  documentId: string;
  /** Each line by its id; null or "" clears it back to not counted. */
  lines: { lineId: string; countedQty: string | null }[];
};

export type SaveCountedQuantitiesResult = { documentId: string; saved: number };

/** A size limit of one request, not a rule of the count (plan of 7.3, decided item 8). */
const SAVE_LINES_MAX = 5_000;

const saveInput = z
  .object({
    documentId: z.uuid(),
    lines: z
      .array(
        z.object({
          lineId: z.uuid(),
          countedQty: z
            .string()
            .max(40)
            .nullish()
            .transform((value) => (value == null || value.trim() === "" ? null : value.trim())),
        }),
      )
      .min(1)
      .max(SAVE_LINES_MAX),
  })
  .refine((value) => new Set(value.lines.map((line) => line.lineId)).size === value.lines.length, {
    path: ["lines"],
    message: "A line is given twice.",
  });

type HeldCountLine = { id: string; allow_decimal: boolean };

export const saveCountedQuantities = defineAction({
  name: "saveCountedQuantities",
  permission: "stock.start_count",
  input: saveInput,
  async target({ tx, input: typed }) {
    const found = await tx.execute<{ branch_id: string }>(
      // Only a count has a branch here: another type is "Not found" before any right is asked
      // (permission review of 7.3, should fix 1).
      sql`select branch_id from stock_documents where id = ${typed.documentId} and type = 'COUNT'`,
    );
    const branchId = found.rows[0]?.branch_id;
    return branchId ? { branchId } : null;
  },
  async lock({ tx, input: typed }) {
    const document = await lockDocument(tx, typed.documentId);
    // The lines and their measure, in a statement of their own after the lock.
    const found = await tx.execute<HeldCountLine>(sql`
      select l.id, u.allow_decimal
      from stock_document_lines l
      join product_variants v on v.id = l.variant_id
      join products p on p.id = v.product_id
      join units u on u.id = p.unit_id
      where l.document_id = ${document.id}`);
    return {
      target: { branchId: document.branchId },
      rows: { document, lines: found.rows } as { document: LockedDocument; lines: HeldCountLine[] },
    };
  },
  check({ input: typed, locked }) {
    const { document, lines } = locked!.rows;
    if (document.type !== "COUNT") throw new ActionError("not_found");
    if (!countTypingAllowed(document.status)) throw new ActionError("wrong_status");
    for (const line of typed.lines) {
      const held = lines.find((each) => each.id === line.lineId);
      if (!held) refuse("lines", "errors.field.notAllowed");
      if (line.countedQty === null) continue;
      const refusal = countedQuantityRefusal(line.countedQty, held.allow_decimal);
      if (refusal) refuse(`lines.${line.lineId}.countedQty`, `errors.field.${refusal}`);
    }
  },
  async write({ tx, input: typed, locked }): Promise<SaveCountedQuantitiesResult> {
    const { document } = locked!.rows;
    const rows = sql.join(
      typed.lines.map((line) => sql`(${line.lineId}::uuid, ${line.countedQty}::numeric)`),
      sql`, `,
    );
    await tx.execute(sql`
      update stock_document_lines l set counted_qty = typed.counted_qty
      from (values ${rows}) as typed(id, counted_qty)
      where l.id = typed.id and l.document_id = ${document.id}`);
    return { documentId: document.id, saved: typed.lines.length };
  },
});
