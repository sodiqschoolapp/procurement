import { sql } from "drizzle-orm";
import * as z from "zod";

import { isMoveReason, moveReason } from "@/domain/order-moves";
import { REVERSIBLE_STATUSES, overReturn, reverseAllows } from "@/domain/stock-documents";
import { ActionError, defineAction } from "@/server/action";
import type { FieldMessageKey } from "@/server/action-result";
import { audit } from "@/server/audit";
import { now } from "@/server/clock";
import { departmentReceived } from "@/server/department-received";
import { reasonFields } from "@/server/order-moves";
import { type LockedDocument, lockDocument, reverseDocument } from "@/server/stock-documents";
import type { Executor } from "@/server/authorize";
import { StockShortError } from "@/server/stock-ledger";

// Reverse a warehouse document (09-warehouse.md, Movement types, last paragraph: "A wrong document
// is fixed with 'Reverse', which writes the opposite movement and needs a reason"; Issue to a
// department 3; Decided ahead, question 19; 03-roles-and-permissions.md, Manager right
// RETURN_REVERSE; plans of 5.7 and 5.7b). Not a create: a second reverse is `wrong_status` under
// the lock (decided item 4). In the action wrapper:
//
//   target     the document's branch, from the database
//   authorize  `stock.return_reverse` on it: the Head in any branch, a Manager in their own with
//              RETURN_REVERSE on; another branch is "Not found"
//   lock       the document's department FOR NO KEY UPDATE (it never changes, so it is read first
//              without a lock), then lockDocument() (plan of 5.7b, decided item 2, Look first): two
//              reverses, a reverse and a return (FOR UPDATE) and a reverse and an issue (FOR
//              SHARE) of the same department wait for each other, so what the department holds
//              is read after the other has committed; the FOR KEY SHARE of a foreign-key check (a
//              "Give straight" issue inserted under a purchase that holds the balance) does not
//              wait, so the two cannot deadlock, and such an issue only raises what is held
//   check      reverseAllows(): an issue or a return, by its creator or the Head (decided item 1,
//              Look first), else `forbidden`; then POSTED (REVERSIBLE_STATUSES), else
//              `wrong_status`; the reason 5 to 500; then, for an issue, every line at most what
//              the department still holds of its subtype (departmentReceived(), which counts this
//              issue itself; overReturn()), else `invalid_input` with `reverseOverHeld` on the
//              line and the amount held: the return is reversed first (09 Issue to a department
//              3; D57; plan of 5.7b, decided items 1 and 6, Look first). One line over refuses all
//   write      reverseDocument() of src/server/stock-documents.ts: one REVERSAL per movement at
//              its own cost, the document REVERSED with who, when and why. A stock that would go
//              below 0 refuses the whole reverse, naming the line and what is left.
//
// A return keeps no such rule: reversing it only raises what the department holds (09 Other
// documents, Return). No history event or notification (decided item 5); an issue and a return
// write no audit row, a direct entry one (plan of 5.8, decided item 3: its making is in the audit
// log, so its undoing is too).

export type ReverseInput = { documentId: string; reason: string };
export type ReverseResult = { documentId: string; number: string };

type ReverseRows = LockedDocument & { departmentId: string | null };

const input = z.object({
  documentId: z.uuid(),
  reason: z.string().max(4000),
});

export const reverseStockDocument = defineAction({
  name: "reverseStockDocument",
  permission: "stock.return_reverse",
  input,
  async target({ tx, input: typed }) {
    const found = await tx.execute<{ branch_id: string }>(
      sql`select branch_id from stock_documents where id = ${typed.documentId}`,
    );
    const row = found.rows[0];
    return row ? { branchId: row.branch_id } : null;
  },
  async lock({ tx, input: typed }) {
    const found = await tx.execute<{ department_id: string | null }>(
      sql`select department_id from stock_documents where id = ${typed.documentId}`,
    );
    const departmentId = found.rows[0]?.department_id;
    if (departmentId) {
      await tx.execute(
        sql`select id from departments where id = ${departmentId} for no key update`,
      );
    }
    const document = await lockDocument(tx, typed.documentId);
    const rows: ReverseRows = { ...document, departmentId: departmentId ?? null };
    return { target: { branchId: document.branchId }, rows };
  },
  async check({ tx, actor, input: typed, locked }) {
    const document = locked!.rows;
    if (!reverseAllows(actor, document)) throw new ActionError("forbidden");
    if (!REVERSIBLE_STATUSES.includes(document.status)) throw new ActionError("wrong_status");
    if (!isMoveReason(typed.reason)) {
      throw new ActionError("invalid_input", reasonFields(typed.reason));
    }
    if (document.type === "ISSUE" && document.departmentId) {
      await refuseOverHeld(tx, document.id, {
        branchId: document.branchId,
        departmentId: document.departmentId,
      });
    }
  },
  async write({ tx, input: typed, userId, locked }): Promise<ReverseResult> {
    const document = locked!.rows;
    try {
      await reverseDocument(tx, {
        documentId: document.id,
        reason: moveReason(typed.reason),
        reversedBy: userId,
      });
    } catch (error) {
      if (!(error instanceof StockShortError)) throw error;
      // The branch is the document's, which authorize() passed: the amount is of a branch the
      // actor may reverse in. A line is named by its id, which the dialog's preview holds.
      const line = await tx.execute<{ id: string }>(sql`
        select id from stock_document_lines
        where document_id = ${document.id} and variant_id = ${error.variantId}`);
      const field = `lines.${line.rows[0]!.id}.qty`;
      throw new ActionError(
        "invalid_input",
        { [field]: "errors.field.reverseStockShort" },
        { [field]: error.available },
      );
    }
    const numbered = await tx.execute<{ number: string }>(
      sql`select number from stock_documents where id = ${document.id}`,
    );
    return { documentId: document.id, number: numbered.rows[0]!.number };
  },
  async history({ tx, input: typed, userId, locked }, result) {
    if (locked!.rows.type !== "DIRECT_ENTRY") return;
    await audit(
      { tx, userId },
      {
        action: "direct_entry.reverse",
        entity: "stock_documents",
        entityId: result.documentId,
        before: { number: result.number, status: "POSTED" },
        after: { number: result.number, status: "REVERSED", reason: moveReason(typed.reason) },
        at: now(),
      },
    );
  },
});

/**
 * Refuses the reverse of an issue when a line is more than the department still holds of its
 * subtype (09 Issue to a department 3; plan of 5.7b): `invalid_input`, `reverseOverHeld` on each
 * such line with the amount held. Read under the department's lock. The branch is the document's,
 * which authorize() passed.
 */
async function refuseOverHeld(
  tx: Executor,
  documentId: string,
  scope: { branchId: string; departmentId: string },
): Promise<void> {
  const lines = await tx.execute<{ id: string; variant_id: string; qty: string }>(sql`
    select id, variant_id, qty::text as qty from stock_document_lines
    where document_id = ${documentId}
    order by id`);
  const held = await departmentReceived(tx, {
    ...scope,
    variantIds: lines.rows.map((line) => line.variant_id),
  });
  const fields: Record<string, FieldMessageKey> = {};
  const available: Record<string, string> = {};
  for (const line of lines.rows) {
    const holds = held.get(line.variant_id)!;
    if (!overReturn(line.qty, holds)) continue;
    fields[`lines.${line.id}.qty`] = "errors.field.reverseOverHeld";
    available[`lines.${line.id}.qty`] = holds;
  }
  if (Object.keys(fields).length > 0) throw new ActionError("invalid_input", fields, available);
}
