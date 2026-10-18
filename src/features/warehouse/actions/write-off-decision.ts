import { sql } from "drizzle-orm";
import * as z from "zod";

import {
  WRITE_OFF_OUTCOMES,
  type WriteOffOutcome,
  writeOffDecisionMove,
} from "@/domain/stock-documents";
import { ActionError, defineAction } from "@/server/action";
import { now } from "@/server/clock";
import { notify } from "@/server/notify";
import { type LockedDocument, lockDocument, postLines } from "@/server/stock-documents";
import { StockShortError } from "@/server/stock-ledger";

// The Head approves or refuses a waiting write-off (09-warehouse.md, Movement types: "Write-off
// … Needs approval | Head"; Other documents, Write-off: "Stock changes only after the Head
// approves"; 03-roles-and-permissions.md, Permission matrix "Approve a write-off or stock
// correction": the Head only; 10 Notifications: "the decision goes back to the Manager"; plan of
// 5.11). Not a create: a second decision is `wrong_status` under the lock. In the action wrapper:
//
//   target     the document's branch, from the database
//   authorize  `stock.approve_write_off` on it: the Head, any branch
//   lock       lockDocument() (FOR UPDATE)
//   check      a WRITE_OFF, else `not_found`; writeOffDecisionMove() of src/domain/
//              stock-documents.ts (the one place for its moves; decided item 4, Look first): from
//              PENDING_APPROVAL only, else `wrong_status`
//   write      the status (POSTED or REJECTED) with `decided_by` and `decided_at`; on approval
//              then postLines(), its WRITE_OFF movements made by the approving Head at the average
//              of this moment (09 Stock value), under the ledger's locks. A line the stock no longer
//              covers refuses the whole approval, naming the line and what is left; nothing is
//              saved and the write-off keeps waiting (decided item 2, Look first).
//
// Approval does not ask again whether the branch, the product or the subtype is still active: the
// stock it takes out is still there, and 04 rule 2 is about the pickers and the ask only (review of
// the plan, correction 2; as a reverse, plan of 5.7, item 7). 7.2's "Lost in transfer" and 7.4's
// corrections keep this. Only the stock-below-zero refusal applies.
//
// No audit row (decided item 10). The one who asked is told the outcome; the Head who asked for
// their own write-off had it posted at once and never comes here.

export type WriteOffDecisionInput = { documentId: string; outcome: WriteOffOutcome };
export type WriteOffDecisionResult = { documentId: string; number: string; outcome: WriteOffOutcome };

const input = z.object({
  documentId: z.uuid(),
  outcome: z.enum(WRITE_OFF_OUTCOMES),
});

export const decideWriteOff = defineAction({
  name: "decideWriteOff",
  permission: "stock.approve_write_off",
  input,
  async target({ tx, input: typed }) {
    const found = await tx.execute<{ branch_id: string }>(
      sql`select branch_id from stock_documents where id = ${typed.documentId}`,
    );
    const row = found.rows[0];
    return row ? { branchId: row.branch_id } : null;
  },
  async lock({ tx, input: typed }) {
    const document: LockedDocument = await lockDocument(tx, typed.documentId);
    return { target: { branchId: document.branchId }, rows: document };
  },
  check({ input: typed, locked }) {
    const document = locked!.rows;
    if (document.type !== "WRITE_OFF") throw new ActionError("not_found");
    if (writeOffDecisionMove(document.status, typed.outcome) === null) {
      throw new ActionError("wrong_status");
    }
  },
  async write({ tx, input: typed, userId, locked }): Promise<WriteOffDecisionResult> {
    const document = locked!.rows;
    const status = writeOffDecisionMove(document.status, typed.outcome)!;
    const updated = await tx.execute<{ number: string }>(sql`
      update stock_documents
      set status = ${status}, decided_by = ${userId}, decided_at = ${now()}
      where id = ${document.id}
      returning number`);
    if (status === "POSTED") {
      try {
        await postLines(tx, { documentId: document.id, postedBy: userId });
      } catch (error) {
        if (!(error instanceof StockShortError)) throw error;
        // The branch is the document's, which authorize() passed. A line is named by its id,
        // which the write-off's page holds.
        const line = await tx.execute<{ id: string }>(sql`
          select id from stock_document_lines
          where document_id = ${document.id} and variant_id = ${error.variantId}`);
        const field = `lines.${line.rows[0]!.id}.qty`;
        throw new ActionError(
          "invalid_input",
          { [field]: "errors.field.stockShort" },
          { [field]: error.available },
        );
      }
    }
    return { documentId: document.id, number: updated.rows[0]!.number, outcome: typed.outcome };
  },
  async notify({ tx, userId, locked }, result) {
    const document = locked!.rows;
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
          kind: "WRITE_OFF",
          outcome: result.outcome === "APPROVE" ? "approved" : "refused",
        },
        branchId: document.branchId,
        link: `/warehouse/documents/${document.id}`,
        at: now(),
      },
    );
  },
});
