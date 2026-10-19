import { sql } from "drizzle-orm";

import { businessYear } from "@/domain/business-date";
import {
  type DocumentReason,
  type DocumentStatus,
  type DocumentType,
  DOCUMENT_PREFIX,
  REVERSIBLE_STATUSES,
  countCorrection,
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
// The caller's contract, as for postMovement() (header of ./stock-ledger.ts; permission review of
// 5.1). None of these functions authorizes; the caller's action has (developer-rules.md rule 4):
// - Who makes each type (03-roles-and-permissions.md, Permission matrix; Manager rights): an issue,
//   a return and a transfer in the actor's own branches, a Manager only with ISSUE_STOCK,
//   RETURN_REVERSE, TRANSFER_STOCK; a write-off or count is created PENDING_APPROVAL, a Manager
//   only with WRITE_OFF_COUNT, and becomes POSTED only by the Head's approval, which sets
//   `decided_by`; a direct entry by the Head alone.
// - Who reverses each type (Decided ahead, question 19): an issue and a return by their creator or
//   the Head, a Manager only with RETURN_REVERSE; a direct entry, an approved write-off, a received
//   transfer and an approved count by the Head alone. The caller takes lockDocument() first,
//   decides on the row it returns (another branch is "Not found"; a transfer is of its sending
//   branch, `branchId`), and only then calls reverseDocument(), in the same transaction.
// - `branchId`, `toBranchId`, `departmentId` and every `variantId` of createDocument() come from
//   the browser: the caller checks the branch against the user's branches (and that it is active)
//   and each id against what the user may use; the database ties the department to the branch.
// - `createdBy`, `decidedBy` and `reversedBy` are the wrapper's `userId`.
// - A line's `unit_cost` is a direct entry's own cost, and on a return the cost it comes in at if
//   the stock under the lock is 0 (plan of 5.6, decided item 1); what a line really moved at is
//   its movement's `unit_cost`, the one a report reads.
// postLines() locks the document and reads its type and branch itself, and posts a document only
// once (a line that already moved is `wrong_status`). A StockShortError leaves the caller's
// transaction to save nothing (rule 3).

export type DocumentLineInput = {
  variantId: string;
  /** numeric(14,3) text. */
  qty: string;
  countedQty?: string | null;
  receivedQty?: string | null;
  /** A count line's `seq` of the item's newest movement at the start (plan of 7.3, decided item 2). */
  startSeq?: bigint | null;
  /**
   * Whole so'm: a direct entry's own cost (09 Direct entry, Lines); a return's cost into an empty
   * stock, required (plan of 5.6, decided item 1, Look first: not the cost it entered at, which is
   * its movement's `unit_cost`); empty for the others.
   */
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
  /** The Head who approved it, when a write-off or count is created already approved. */
  decidedBy?: string | null;
  /** The Excel import a direct entry comes from (plan of 5.9). */
  importId?: string | null;
  lines: readonly DocumentLineInput[];
};

export type PostedLine = { lineId: string; variantId: string; movement: PostedMovement };

export type CreatedDocument = {
  documentId: string;
  number: string;
  /** The ids of the lines in the order they were given. */
  lineIds: string[];
  /** The movements written, one per line that moved; empty for a document that waits. */
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
      received_by_name, doc_date, status, reason, comment, client_key, created_by, decided_by,
      decided_at, import_id, created_at)
    values (${number}, ${input.type}, ${input.branchId}, ${input.toBranchId ?? null},
      ${input.departmentId ?? null}, ${input.receivedByName ?? null}, ${input.docDate},
      ${input.status}, ${input.reason ?? null}, ${input.comment ?? null}, ${input.clientKey},
      ${input.createdBy}, ${input.decidedBy ?? null}, ${input.decidedBy ? moment : null},
      ${input.importId ?? null}, ${moment})
    returning id`);
  const documentId = inserted.rows[0]!.id;

  const rows = sql.join(
    input.lines.map(
      (line) => sql`(${documentId}::uuid, ${line.variantId}::uuid, ${line.qty}::numeric,
        ${line.countedQty ?? null}::numeric, ${line.receivedQty ?? null}::numeric,
        ${line.unitCost?.toString() ?? null}::bigint, ${line.startSeq?.toString() ?? null}::bigint,
        ${moment})`,
    ),
    sql`, `,
  );
  // One line per subtype (stock_document_lines_document_id_variant_id_key), so the subtype names
  // the line.
  const lines = await tx.execute<{ id: string; variant_id: string }>(sql`
    insert into stock_document_lines (document_id, variant_id, qty, counted_qty, received_qty,
      unit_cost, start_seq, created_at)
    values ${rows}
    returning id, variant_id`);
  const idOf = new Map(lines.rows.map((row) => [row.variant_id, row.id]));
  const lineIds = input.lines.map((line) => idOf.get(line.variantId)!);

  const posted =
    input.status === "PENDING_APPROVAL"
      ? []
      : await postLines(tx, { documentId, postedBy: input.createdBy });
  return { documentId, number, lineIds, posted };
}

/** A document as lockDocument() holds it, for the caller to authorize (header contract). */
export type LockedDocument = {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  branchId: string;
  toBranchId: string | null;
  createdBy: string;
};

/** Locks one document FOR UPDATE and returns what a caller authorizes on; unknown: `not_found`. */
export async function lockDocument(tx: Executor, documentId: string): Promise<LockedDocument> {
  const held = await tx.execute<{
    id: string;
    type: DocumentType;
    status: DocumentStatus;
    branch_id: string;
    to_branch_id: string | null;
    created_by: string;
  }>(sql`
    select id, type, status, branch_id, to_branch_id, created_by
    from stock_documents where id = ${documentId} for update`);
  const row = held.rows[0];
  if (!row) throw new ActionError("not_found");
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    branchId: row.branch_id,
    toBranchId: row.to_branch_id,
    createdBy: row.created_by,
  };
}

/**
 * Writes the movement of each line of one document (lineMovement() of src/domain/
 * stock-documents.ts; a count line's countCorrection(), which writes nothing for a difference of
 * 0: plan of 7.4, decided items 8 and 13), in postMovements()' fixed order, each pointing at its
 * line. Returns the lines that moved, each with its own id. The document
 * is locked here and its type and branch read from it; it must be POSTED or IN_TRANSIT (the
 * caller sets the status first) and none of its lines may have moved yet: `wrong_status`
 * otherwise (permission review of 5.1, Must fix 1). The lines are read after the lock, in a
 * statement of their own.
 */
export async function postLines(
  tx: Executor,
  input: { documentId: string; postedBy: string },
): Promise<PostedLine[]> {
  const document = await lockDocument(tx, input.documentId);
  if (document.status !== "POSTED" && document.status !== "IN_TRANSIT") {
    throw new ActionError("wrong_status");
  }
  const found = await tx.execute<{
    id: string;
    variant_id: string;
    qty: string;
    unit_cost: string | null;
    counted_qty: string | null;
    moved: boolean;
  }>(sql`
    select l.id, l.variant_id, l.qty::text as qty, l.unit_cost::text as unit_cost,
      l.counted_qty::text as counted_qty,
      exists (select 1 from stock_movements m where m.document_line_id = l.id) as moved
    from stock_document_lines l where l.document_id = ${document.id}
    order by l.id`);
  if (found.rows.some((line) => line.moved)) throw new ActionError("wrong_status");
  const lines = found.rows.flatMap((line) => {
    const movement =
      document.type === "COUNT"
        ? countCorrection(line.qty, line.counted_qty)
        : lineMovement(document.type, {
            qty: line.qty,
            unitCost: line.unit_cost === null ? null : BigInt(line.unit_cost),
          });
    return movement ? [{ ...line, movement }] : [];
  });
  const movements = await postMovements(
    tx,
    lines.map((line) => ({
      ...line.movement,
      branchId: document.branchId,
      variantId: line.variant_id,
      createdBy: input.postedBy,
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
 * original is then marked 'Reversed'"). The caller has taken lockDocument() and authorized on its row
 * (header contract); the lock is taken again here, at no cost in the same transaction; then, in a statement of its
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
  const { status } = await lockDocument(tx, input.documentId);
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
