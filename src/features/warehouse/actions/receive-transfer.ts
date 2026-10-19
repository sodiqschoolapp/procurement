import { and, eq, sql } from "drizzle-orm";
import * as z from "zod";

import { businessDate } from "@/domain/business-date";
import {
  DOCUMENT_LINES_MAX,
  receivedQuantityRefusal,
  transferReceipt,
  transferReceiveMove,
} from "@/domain/stock-documents";
import { fullName, isFullName } from "@/domain/users";
import { ActionError, defineAction } from "@/server/action";
import type { FieldMessageKey } from "@/server/action-result";
import { now } from "@/server/clock";
import { branches, users } from "@/server/db/schema";
import { notify } from "@/server/notify";
import {
  type LockedDocument,
  createDocument,
  lockDocument,
  postLines,
} from "@/server/stock-documents";
import { type PostedMovementInput, postMovements } from "@/server/stock-ledger";

// Receive a transfer (09-warehouse.md, Movement types: "Transfer to another branch | Down at the
// sender, up at the receiver | Sending Manager; the receiving Manager confirms"; Other documents,
// Transfer: "The receiving Manager enters what really arrived. Any shortage becomes a write-off
// request 'Lost in transfer' on the sending branch for the Head to decide"; Stock value: "A
// transfer arrives at the receiver with the sender's average"; edge case "A transfer arrives
// short"; plan of 7.2). Not a create: a second receipt is `wrong_status` under the lock (decided
// item 9). In the action wrapper:
//
//   target     the transfer's receiving branch, from the database; a document of no receiving
//              branch (any other type) has none, so it is "Not found"
//   authorize  `stock.receive_transfer` on it: the Head in any branch, a Manager of the receiving
//              branch, whatever their rights (decided item 2, Look first)
//   lock       lockDocument() (FOR UPDATE)
//   check      a TRANSFER, else `not_found`; transferReceiveMove() of src/domain/stock-documents.ts
//              (IN_TRANSIT to RECEIVED, the one place for the move), else `wrong_status`; then, on
//              the lines read after the lock, one received quantity for each line of the document
//              and none other, each by receivedQuantityRefusal(): 0 up to the quantity sent, by the
//              measure (decided item 4, Look first)
//   write      the transfer RECEIVED with "Received by" as typed (decided item 8), `decided_by` and
//              `decided_at` the receiver and now, `received_qty` on each line; when a line is
//              short, the write-off "Lost in transfer" of the sending branch with its number,
//              waiting, before any balance is locked (askWriteOff's order: the counter, then the
//              balances; review of the plan, should fix 2); then one postMovements() of
//              transferReceipt()'s movements: TRANSFER_IN at the receiver of what arrived, and
//              TRANSFER_IN at the sender of what did not, both at the line's TRANSFER_OUT cost
//              (decided item 1, Look first); when the Head receives, the write-off is approved at
//              once by the Head and posted, as the Head's own write-off (plan of 5.11, decided item
//              1; decided item 6).
//
// The branches are not locked: a branch with a transfer In transit cannot be closed (plan of 7.1,
// decided item 4), and receipt does not ask whether the products are still active, as a
// write-off's approval does not (decided item 10). No audit row (decided item 11). The notify step
// tells every active Head of a waiting write-off ("Write-off or correction asked"); nobody is told
// of the receipt itself.

export type ReceiveTransferInput = {
  documentId: string;
  /** Who took the items, as typed; replaces the sender's text (decided item 8). */
  receivedByName: string | null;
  lines: { lineId: string; receivedQty: string }[];
};

export type ReceiveTransferResult = {
  documentId: string;
  number: string;
  /**
   * The write-off "Lost in transfer", when a line was short. Its id and number only for one who
   * sees the sending branch: it is that branch's document (permission review of 7.2, should fix 1).
   */
  writeOff: { documentId: string | null; number: string | null; posted: boolean } | null;
};

const input = z
  .object({
    documentId: z.uuid(),
    receivedByName: z
      .string()
      .nullish()
      .transform((value) => (value == null ? null : fullName(value) || null))
      .refine((value) => value === null || isFullName(value)),
    lines: z
      .array(z.object({ lineId: z.uuid(), receivedQty: z.string().trim().min(1).max(40) }))
      .min(1)
      .max(DOCUMENT_LINES_MAX),
  })
  .refine((value) => new Set(value.lines.map((line) => line.lineId)).size === value.lines.length, {
    path: ["lines"],
    message: "A line is given twice.",
  });

type HeldLine = {
  id: string;
  variant_id: string;
  qty: string;
  allow_decimal: boolean;
  /** The unit cost of the line's TRANSFER_OUT: the sender's average when it left. */
  sent_cost: string | null;
};

type Locked = {
  document: LockedDocument;
  lines: HeldLine[];
  /** Filled by the write step for the notify step: the write-off it made, if any. */
  writeOff?: { documentId: string; number: string; posted: boolean };
};

function refuse(field: string, kind: FieldMessageKey): never {
  throw new ActionError("invalid_input", { [field]: kind });
}

export const receiveTransfer = defineAction({
  name: "receiveTransfer",
  permission: "stock.receive_transfer",
  input,
  async target({ tx, input: typed }) {
    const found = await tx.execute<{ to_branch_id: string | null }>(
      sql`select to_branch_id from stock_documents where id = ${typed.documentId}`,
    );
    const branchId = found.rows[0]?.to_branch_id;
    return branchId ? { branchId } : null;
  },
  async lock({ tx, input: typed }) {
    const document = await lockDocument(tx, typed.documentId);
    // The lines and their TRANSFER_OUT, in a statement of their own after the lock.
    const found = await tx.execute<HeldLine>(sql`
      select l.id, l.variant_id, l.qty::text as qty, u.allow_decimal,
        m.unit_cost::text as sent_cost
      from stock_document_lines l
      join product_variants v on v.id = l.variant_id
      join products p on p.id = v.product_id
      join units u on u.id = p.unit_id
      left join stock_movements m on m.document_line_id = l.id and m.type = 'TRANSFER_OUT'
      where l.document_id = ${document.id}
      order by l.id`);
    return {
      target: { branchId: document.toBranchId ?? document.branchId },
      rows: { document, lines: found.rows } as Locked,
    };
  },
  check({ input: typed, locked }) {
    const { document, lines } = locked!.rows;
    if (document.type !== "TRANSFER") throw new ActionError("not_found");
    if (transferReceiveMove(document.status) === null) throw new ActionError("wrong_status");
    // Exactly the document's lines: none missing, none of another document.
    if (
      typed.lines.length !== lines.length ||
      typed.lines.some((line) => !lines.some((held) => held.id === line.lineId))
    ) {
      refuse("lines", "errors.field.notAllowed");
    }
    for (const line of typed.lines) {
      const held = lines.find((each) => each.id === line.lineId)!;
      const refusal = receivedQuantityRefusal(line.receivedQty, held.allow_decimal, held.qty);
      if (refusal) refuse(`lines.${line.lineId}.receivedQty`, `errors.field.${refusal}`);
    }
  },
  async write({ tx, input: typed, userId, actor, locked }): Promise<ReceiveTransferResult> {
    const { document, lines } = locked!.rows;
    const moment = now();
    const receipts = lines.map((held) => {
      const typedLine = typed.lines.find((line) => line.lineId === held.id)!;
      // A TRANSFER_OUT is written with every line at sending (createDocument(), IN_TRANSIT).
      if (held.sent_cost === null) throw new ActionError("unexpected");
      return {
        held,
        receivedQty: typedLine.receivedQty.trim(),
        ...transferReceipt({
          qty: held.qty,
          receivedQty: typedLine.receivedQty.trim(),
          sentCost: BigInt(held.sent_cost),
        }),
      };
    });

    const updated = await tx.execute<{ number: string }>(sql`
      update stock_documents
      set status = ${transferReceiveMove(document.status)!},
        received_by_name = ${typed.receivedByName}, decided_by = ${userId}, decided_at = ${moment}
      where id = ${document.id}
      returning number`);
    const number = updated.rows[0]!.number;
    for (const receipt of receipts) {
      await tx.execute(sql`
        update stock_document_lines set received_qty = ${receipt.receivedQty}::numeric
        where id = ${receipt.held.id}`);
    }

    const short = receipts.filter((receipt) => receipt.short !== null);
    const byHead = actor.role === "HEAD";
    // The write-off and its number first, before any balance lock (review of the plan, should
    // fix 2). Its key is made here, so nobody can take it first (decided item 6).
    const writeOff =
      short.length === 0
        ? null
        : await createDocument(tx, {
            type: "WRITE_OFF",
            branchId: document.branchId,
            docDate: businessDate(moment),
            status: "PENDING_APPROVAL",
            reason: "LOST_IN_TRANSFER",
            comment: number,
            clientKey: crypto.randomUUID(),
            createdBy: userId,
            lines: short.map((receipt) => ({
              variantId: receipt.held.variant_id,
              qty: receipt.short!,
            })),
          });

    const movements: PostedMovementInput[] = [];
    for (const receipt of receipts) {
      if (receipt.received) {
        movements.push({
          ...receipt.received,
          branchId: document.toBranchId!,
          variantId: receipt.held.variant_id,
          createdBy: userId,
          documentLineId: receipt.held.id,
        });
      }
      if (receipt.back) {
        movements.push({
          ...receipt.back,
          branchId: document.branchId,
          variantId: receipt.held.variant_id,
          createdBy: userId,
          documentLineId: receipt.held.id,
        });
      }
    }
    // Movements into stock only: no line can fall short of stock here.
    if (movements.length > 0) await postMovements(tx, movements);

    if (writeOff && byHead) {
      await tx.execute(sql`
        update stock_documents
        set status = 'POSTED', decided_by = ${userId}, decided_at = ${moment}
        where id = ${writeOff.documentId}`);
      // The short quantity is back in the sender's stock above, so it is there to take out.
      await postLines(tx, { documentId: writeOff.documentId, postedBy: userId });
    }

    if (writeOff) {
      locked!.rows.writeOff = {
        documentId: writeOff.documentId,
        number: writeOff.number,
        posted: byHead,
      };
    }
    const seesSender = byHead || actor.branchIds.includes(document.branchId);
    return {
      documentId: document.id,
      number,
      writeOff: writeOff
        ? {
            documentId: seesSender ? writeOff.documentId : null,
            number: seesSender ? writeOff.number : null,
            posted: byHead,
          }
        : null,
    };
  },
  async notify({ tx, userId, locked }) {
    const { document, writeOff } = locked!.rows;
    if (!writeOff || writeOff.posted) return;
    const heads = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "HEAD"), eq(users.isActive, true)));
    const [maker] = await tx
      .select({ name: users.fullName })
      .from(users)
      .where(eq(users.id, userId));
    const [sender] = await tx
      .select({ code: branches.code })
      .from(branches)
      .where(eq(branches.id, document.branchId));
    await notify(
      { tx, userId },
      {
        to: heads.map((head) => head.id),
        type: "STOCK_CHANGE_ASKED",
        params: {
          actor: maker!.name,
          number: writeOff.number,
          branch: sender!.code,
          kind: "WRITE_OFF",
        },
        // The sending branch: the write-off is its document.
        branchId: document.branchId,
        link: `/warehouse/documents/${writeOff.documentId}`,
        at: now(),
      },
    );
  },
});
