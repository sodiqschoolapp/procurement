import { sql } from "drizzle-orm";
import * as z from "zod";

import {
  WRITE_OFF_OUTCOMES,
  type WriteOffOutcome,
  countComplete,
  countDecisionMove,
  countLineMoved,
  countSeenMatches,
} from "@/domain/stock-documents";
import { ActionError, defineAction } from "@/server/action";
import { now } from "@/server/clock";
import { notify } from "@/server/notify";
import { type LockedDocument, lockDocument, postLines } from "@/server/stock-documents";

// The Head approves or refuses a stock count (09-warehouse.md, Movement types: "Correction after a
// stock count | Up or down | Manager asks | Head"; Other documents, Stock count: "the Head approves
// them as corrections. If an item moved between the start of the count and the approval, the system
// asks the Manager to count that item again"; 03-roles-and-permissions.md, Permission matrix
// "Approve a write-off or stock correction": the Head only; 10 Notifications: "the decision goes
// back to the Manager"; plan of 7.4). Not a create: a second decision is `wrong_status` under the
// lock. In the action wrapper:
//
//   target     the count's branch, from the database; another type is "Not found"
//   authorize  `stock.approve_write_off` on it: the Head, any branch (decided item 5, Look first)
//   lock       lockDocument() (FOR UPDATE), then its lines; on Approve, for each line in subtype
//              order the product FOR SHARE and the balance row FOR UPDATE, the order of
//              postMovements() (decided item 9), and then each item's newest movement in the branch
//   check      countDecisionMove() of src/domain/stock-documents.ts (the one place for its moves):
//              else `wrong_status`; on Approve, `seen` names exactly the count's lines with the
//              counted quantities held now, else `conflict`: the Head posts only what was shown,
//              while typing stays open (decided item 2, Look first)
//   write      Refuse: REJECTED with `decided_by` and `decided_at`. Approve: the lines whose item
//              moved after the start (countLineMoved()) are sent back: stock at start and
//              `start_seq` read again, counted quantity cleared, `recount` set; nothing is posted
//              and the count keeps waiting (outcome RECOUNT). None moved: POSTED with `decided_by`
//              and `decided_at`, then postLines() writes one CORRECTION per line whose difference
//              is not 0, at the average of the moment (decided items 3 and 8).
//
// Approval does not ask again whether the branch, the product or the subtype is still active, as a
// write-off's (decided item 12). No audit row (decided item 10). The count's starter is told the
// outcome; notify() leaves out the Head who decided.

export type CountOutcome = WriteOffOutcome | "RECOUNT";

export type CountDecisionInput = {
  documentId: string;
  outcome: WriteOffOutcome;
  /** On Approve: each line with the counted quantity the Head was shown. */
  seen?: { lineId: string; countedQty: string }[];
};

export type CountDecisionResult = {
  documentId: string;
  number: string;
  outcome: CountOutcome;
  /** The lines sent back to be counted again; 0 unless RECOUNT. */
  recount: number;
};

/** A size limit of one request, as the save's (plan of 7.3, decided item 8). */
const SEEN_LINES_MAX = 5_000;

const input = z.object({
  documentId: z.uuid(),
  outcome: z.enum(WRITE_OFF_OUTCOMES),
  seen: z
    .array(z.object({ lineId: z.uuid(), countedQty: z.string().max(40) }))
    .max(SEEN_LINES_MAX)
    .optional(),
});

type HeldLine = {
  id: string;
  variant_id: string;
  counted_qty: string | null;
  start_seq: string | null;
  newest_seq: string | null;
  stock_now: string;
};

export const decideCount = defineAction({
  name: "decideCount",
  permission: "stock.approve_write_off",
  input,
  async target({ tx, input: typed }) {
    const found = await tx.execute<{ branch_id: string }>(
      // Only a count has a branch here: another type is "Not found" before any right is asked.
      sql`select branch_id from stock_documents where id = ${typed.documentId} and type = 'COUNT'`,
    );
    const branchId = found.rows[0]?.branch_id;
    return branchId ? { branchId } : null;
  },
  async lock({ tx, input: typed }) {
    const document: LockedDocument = await lockDocument(tx, typed.documentId);
    if (typed.outcome === "APPROVE" && document.type === "COUNT") {
      const variants = await tx.execute<{ variant_id: string }>(sql`
        select variant_id from stock_document_lines
        where document_id = ${document.id} order by variant_id`);
      for (const { variant_id } of variants.rows) {
        await tx.execute(sql`
          select p.id from product_variants v join products p on p.id = v.product_id
          where v.id = ${variant_id} for share of p`);
        await tx.execute(sql`
          select variant_id from stock_balances
          where branch_id = ${document.branchId} and variant_id = ${variant_id} for update`);
      }
    }
    // The lines, their stock now and their item's newest movement, in a statement of their own
    // after the locks.
    const found = await tx.execute<HeldLine>(sql`
      select l.id, l.variant_id, l.counted_qty::text as counted_qty,
        l.start_seq::text as start_seq,
        (select max(m.seq) from stock_movements m
          where m.branch_id = ${document.branchId} and m.variant_id = l.variant_id)::text
          as newest_seq,
        coalesce((select b.qty from stock_balances b
          where b.branch_id = ${document.branchId} and b.variant_id = l.variant_id), 0)::text
          as stock_now
      from stock_document_lines l
      where l.document_id = ${document.id}
      order by l.variant_id`);
    return {
      target: { branchId: document.branchId },
      rows: { document, lines: found.rows } as { document: LockedDocument; lines: HeldLine[] },
    };
  },
  check({ input: typed, locked }) {
    const { document, lines } = locked!.rows;
    if (document.type !== "COUNT") throw new ActionError("not_found");
    const complete = countComplete(lines.map((line) => line.counted_qty));
    if (countDecisionMove(document.status, typed.outcome, complete) === null) {
      throw new ActionError("wrong_status");
    }
    if (typed.outcome !== "APPROVE") return;
    const held = lines.map((line) => ({ id: line.id, countedQty: line.counted_qty }));
    if (!countSeenMatches(held, typed.seen ?? [])) throw new ActionError("conflict");
  },
  async write({ tx, input: typed, userId, locked }): Promise<CountDecisionResult> {
    const { document, lines } = locked!.rows;
    const at = now();
    if (typed.outcome === "APPROVE") {
      const moved = lines.filter((line) =>
        countLineMoved(
          line.start_seq === null ? null : BigInt(line.start_seq),
          line.newest_seq === null ? null : BigInt(line.newest_seq),
        ),
      );
      if (moved.length > 0) {
        const rows = sql.join(
          moved.map(
            (line) =>
              sql`(${line.id}::uuid, ${line.stock_now}::numeric, ${line.newest_seq}::bigint)`,
          ),
          sql`, `,
        );
        // A moved line always has a movement, so its new start is never null (decided item 2).
        await tx.execute(sql`
          update stock_document_lines l
          set qty = fresh.qty, start_seq = fresh.start_seq, counted_qty = null, recount = true
          from (values ${rows}) as fresh(id, qty, start_seq)
          where l.id = fresh.id and l.document_id = ${document.id}`);
        const held = await tx.execute<{ number: string }>(
          sql`select number from stock_documents where id = ${document.id}`,
        );
        return {
          documentId: document.id,
          number: held.rows[0]!.number,
          outcome: "RECOUNT",
          recount: moved.length,
        };
      }
    }
    const status = countDecisionMove(document.status, typed.outcome, true)!;
    const updated = await tx.execute<{ number: string }>(sql`
      update stock_documents
      set status = ${status}, decided_by = ${userId}, decided_at = ${at}
      where id = ${document.id}
      returning number`);
    // Nothing moved since the start under the balance locks, so a correction cannot take a stock
    // below 0: the stock after is the counted quantity.
    if (status === "POSTED") await postLines(tx, { documentId: document.id, postedBy: userId });
    return {
      documentId: document.id,
      number: updated.rows[0]!.number,
      outcome: typed.outcome,
      recount: 0,
    };
  },
  async notify({ tx, userId, locked }, result) {
    const { document } = locked!.rows;
    const branch = await tx.execute<{ code: string }>(
      sql`select code from branches where id = ${document.branchId}`,
    );
    await notify(
      { tx, userId },
      {
        to: [document.createdBy],
        type: "STOCK_CHANGE_DECIDED",
        params: {
          number: result.number,
          branch: branch.rows[0]!.code,
          kind: "COUNT",
          outcome:
            result.outcome === "APPROVE"
              ? "approved"
              : result.outcome === "RECOUNT"
                ? "recount"
                : "refused",
        },
        branchId: document.branchId,
        link: `/warehouse/documents/${document.id}`,
        at: now(),
      },
    );
  },
});
