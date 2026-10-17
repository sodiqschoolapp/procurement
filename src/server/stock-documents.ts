import { sql } from "drizzle-orm";

import { businessYear } from "@/domain/business-date";
import {
  type DocumentReason,
  type DocumentStatus,
  type DocumentType,
  DOCUMENT_PREFIX,
  REVERSIBLE_STATUSES,
  documentNumber,
  lineMovement,
  reversalOf,
} from "@/domain/stock-documents";

import { ActionError } from "./action";
import type { Executor } from "./authorize";
import { now } from "./clock";
import { takeNumbers } from "./number-counters";
import { type PostedMovement, postMovements } from "./stock-ledger";

// The warehouse documents' writers (09-warehouse.md, Movement types; Issue to a department;
// Other documents; 14-data-model.md, stock_documents and stock_document_lines; plan of 5.1). Every
// issue, return, transfer, write-off, count and direct entry of later tasks is made by
// createDocument(), posted by postLines() and undone by reverseDocument(), inside its own action's
// transaction; stock changes only through postMovements() of ./stock-ledger.ts.
//
// The caller's contract, as for postMovement() (header of ./stock-ledger.ts): the caller has
// authorized its action (developer-rules.md rule 4), and each type is made, posted and reversed
// only by the action of its matrix row (03-roles-and-permissions.md; Decided ahead, question 19);
// `branchId` comes from what the caller locked or checked against the user's branches, never from
// an unchecked input; `createdBy` and `reversedBy` are the wrapper's `userId`. postLines() is
// called once per document, when its status becomes one whose stock moves, under the lock of the
// document; a StockShortError leaves the caller's transaction to save nothing (rule 3).

export type DocumentLineInput = {
  variantId: string;
  /** numeric(14,3) text. */
  qty: string;
  countedQty?: string | null;
  receivedQty?: string | null;
  /** Whole so'm: a direct entry's own cost (09 Direct entry, Lines); empty for the others. */
  unitCost?: bigint | null;
};

export type DocumentInput = {
  type: DocumentType;
  branchId: string;
  toBranchId?: string | null;
  departmentId?: string | null;
  receivedByName?: string | null;
  /** The business date as `YYYY-MM-DD` (decisions 0.2 style 4). */
  docDate: string;
  /** POSTED and IN_TRANSIT move stock at once; PENDING_APPROVAL waits for the Head. */
  status: Extract<DocumentStatus, "PENDING_APPROVAL" | "POSTED" | "IN_TRANSIT">;
  reason?: DocumentReason | null;
  comment?: string | null;
  clientKey: string;
  createdBy: string;
  lines: readonly DocumentLineInput[];
};

export type PostedLine = { lineId: string; variantId: string; movement: PostedMovement };

export type CreatedDocument = {
  documentId: string;
  number: string;
  /** The ids of the lines in the order they were given. */
  lineIds: string[];
  /** The movements written, one per line; empty for a document that waits. */
  posted: PostedLine[];
};

/**
 * Makes one document: the next number of its type in its branch and the Tashkent year of this
 * moment (plan of 5.1, decided item 7), the document and its lines, and, when it is created
 * POSTED or IN_TRANSIT, the movement of each line.
 */
export async function createDocument(tx: Executor, input: DocumentInput): Promise<CreatedDocument> {
  if (input.lines.length === 0) throw new RangeError("A document without lines");
  const moment = now();
  const year = businessYear(moment);
  const branch = await tx.execute<{ code: string }>(
    sql`select code from branches where id = ${input.branchId}`,
  );
  const code = branch.rows[0]?.code;
  if (!code) throw new ActionError("not_found");
  const value = await takeNumbers(
    tx,
    { scope: DOCUMENT_PREFIX[input.type], branchId: input.branchId, year },
    1,
    moment,
  );
  const number = documentNumber(input.type, code, year, value);

  const inserted = await tx.execute<{ id: string }>(sql`
    insert into stock_documents (number, type, branch_id, to_branch_id, department_id,
      received_by_name, doc_date, status, reason, comment, client_key, created_by, created_at)
    values (${number}, ${input.type}, ${input.branchId}, ${input.toBranchId ?? null},
      ${input.departmentId ?? null}, ${input.receivedByName ?? null}, ${input.docDate},
      ${input.status}, ${input.reason ?? null}, ${input.comment ?? null}, ${input.clientKey},
      ${input.createdBy}, ${moment})
    returning id`);
  const documentId = inserted.rows[0]!.id;

  const rows = sql.join(
    input.lines.map(
      (line) => sql`(${documentId}::uuid, ${line.variantId}::uuid, ${line.qty}::numeric,
        ${line.countedQty ?? null}::numeric, ${line.receivedQty ?? null}::numeric,
        ${line.unitCost?.toString() ?? null}::bigint, ${moment})`,
    ),
    sql`, `,
  );
  // One line per subtype (stock_document_lines_document_id_variant_id_key), so the subtype names
  // the line.
  const lines = await tx.execute<{ id: string; variant_id: string }>(sql`
    insert into stock_document_lines (document_id, variant_id, qty, counted_qty, received_qty,
      unit_cost, created_at)
    values ${rows}
    returning id, variant_id`);
  const idOf = new Map(lines.rows.map((row) => [row.variant_id, row.id]));
  const lineIds = input.lines.map((line) => idOf.get(line.variantId)!);

  const posted =
    input.status === "PENDING_APPROVAL"
      ? []
      : await postLines(tx, {
          documentId,
          type: input.type,
          branchId: input.branchId,
          createdBy: input.createdBy,
        });
  return { documentId, number, lineIds, posted };
}

/**
 * Writes the movement of each line of one document (lineMovement() of src/domain/
 * stock-documents.ts), in postMovements()' fixed order, each pointing at its line. The lines are
 * read here, after the caller locked the document.
 */
export async function postLines(
  tx: Executor,
  document: { documentId: string; type: DocumentType; branchId: string; createdBy: string },
): Promise<PostedLine[]> {
  const found = await tx.execute<{
    id: string;
    variant_id: string;
    qty: string;
    unit_cost: string | null;
  }>(sql`
    select id, variant_id, qty::text as qty, unit_cost::text as unit_cost
    from stock_document_lines where document_id = ${document.documentId}
    order by id`);
  const lines = found.rows;
  const movements = await postMovements(
    tx,
    lines.map((line) => ({
      ...lineMovement(document.type, {
        qty: line.qty,
        unitCost: line.unit_cost === null ? null : BigInt(line.unit_cost),
      }),
      branchId: document.branchId,
      variantId: line.variant_id,
      createdBy: document.createdBy,
      documentLineId: line.id,
    })),
  );
  return lines.map((line, index) => ({
    lineId: line.id,
    variantId: line.variant_id,
    movement: movements[index]!,
  }));
}

type HeldMovement = {
  id: string;
  branch_id: string;
  variant_id: string;
  document_line_id: string;
  qty_delta: string;
  unit_cost: string;
};

/**
 * Undoes one document (09 Movement types, last paragraph: "A wrong document is fixed with
 * 'Reverse', which writes the opposite movement and needs a reason"; Issue to a department 3: "The
 * original is then marked 'Reversed'"). The document is locked first; then, in a statement of its
 * own, every movement of its lines is read and one REVERSAL is written for each (reversalOf(): the
 * opposite quantity at its own unit cost, plan of 5.1, decided item 2, Look first) in its own
 * branch and subtype; then the document is marked REVERSED with who, when and the reason (decided
 * item 1, Look first). Only POSTED and RECEIVED are reversed (decided item 8): another status is
 * `wrong_status`. A stock that would go below 0 throws StockShortError.
 */
export async function reverseDocument(
  tx: Executor,
  input: { documentId: string; reason: string; reversedBy: string },
): Promise<{ reversals: PostedMovement[] }> {
  const held = await tx.execute<{ status: DocumentStatus }>(sql`
    select status from stock_documents where id = ${input.documentId} for update`);
  const status = held.rows[0]?.status;
  if (!status) throw new ActionError("not_found");
  if (!REVERSIBLE_STATUSES.includes(status)) throw new ActionError("wrong_status");

  const found = await tx.execute<HeldMovement>(sql`
    select m.id, m.branch_id, m.variant_id, m.document_line_id, m.qty_delta::text as qty_delta,
      m.unit_cost::text as unit_cost
    from stock_movements m
    join stock_document_lines l on l.id = m.document_line_id
    where l.document_id = ${input.documentId} and m.type <> 'REVERSAL'
    order by m.seq`);
  // A document whose stock moved has its movements (decided item 8).
  if (found.rows.length === 0) throw new ActionError("unexpected");

  const reversals = await postMovements(
    tx,
    found.rows.map((movement) => ({
      ...reversalOf({ qtyDelta: movement.qty_delta, unitCost: BigInt(movement.unit_cost) }),
      branchId: movement.branch_id,
      variantId: movement.variant_id,
      createdBy: input.reversedBy,
      documentLineId: movement.document_line_id,
      reversesMovementId: movement.id,
    })),
  );
  await tx.execute(sql`
    update stock_documents
    set status = 'REVERSED', reversed_by = ${input.reversedBy}, reversed_at = ${now()},
      reverse_reason = ${input.reason}
    where id = ${input.documentId}`);
  return { reversals };
}
