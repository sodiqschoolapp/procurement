import { and, eq, sql } from "drizzle-orm";
import * as z from "zod";

import { isMoveReason, moveReason } from "@/domain/order-moves";
import { transferCancelMove } from "@/domain/stock-documents";
import { ActionError, defineAction } from "@/server/action";
import { now } from "@/server/clock";
import { branches, userBranches, users } from "@/server/db/schema";
import { notify } from "@/server/notify";
import { reasonFields } from "@/server/order-moves";
import {
  type LockedDocument,
  cancelTransferDocument,
  lockDocument,
} from "@/server/stock-documents";

// Cancel a transfer still In transit (09-warehouse.md, Other documents, Transfer: "Until then the
// sender or the Head can cancel the transfer with a reason, and the stock goes back to the sender
// at the cost it left with"; 10 Notifications: "Transfer cancelled | Managers of the receiving
// branch"; 03-roles-and-permissions.md, Permission matrix "Issue, return, transfer stock", Manager
// right TRANSFER_STOCK; plan of 7.4c). Not a create: a second cancel, or a cancel after the
// receipt, is `wrong_status` under the lock. In the action wrapper:
//
//   target     the transfer's sending branch, from the database
//   authorize  `stock.transfer` on it: the Head in any branch, a Manager of the sending branch
//              with TRANSFER_STOCK on (decided item 3, Look first); a Manager of the receiving
//              branch only is "Not found"
//   lock       lockDocument() (FOR UPDATE): a receipt of the same transfer waits and then finds it
//              CANCELLED, or the cancel waits and finds it RECEIVED
//   check      a TRANSFER, else `not_found`; transferCancelMove() of src/domain/stock-documents.ts
//              (IN_TRANSIT to CANCELLED, the one place for the move; decided item 2, Look first),
//              else `wrong_status`; the reason 5 to 500 (decided item 7)
//   write      cancelTransferDocument() of src/server/stock-documents.ts: one REVERSAL per
//              TRANSFER_OUT at its own unit cost, back into the sender's stock (decided item 1,
//              Look first), and the transfer CANCELLED with who, when and why (decided item 5).
//
// The products' and branches' being active is not asked again (decided item 9). No audit row
// (decided item 10). The notify step tells every active Manager of the receiving branch, whatever
// their rights, and nobody else (decided item 6, Look first).

export type CancelTransferInput = { documentId: string; reason: string };
export type CancelTransferResult = { documentId: string; number: string };

const input = z.object({
  documentId: z.uuid(),
  reason: z.string().max(4000),
});

export const cancelTransfer = defineAction({
  name: "cancelTransfer",
  permission: "stock.transfer",
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
    if (document.type !== "TRANSFER") throw new ActionError("not_found");
    if (transferCancelMove(document.status) === null) throw new ActionError("wrong_status");
    if (!isMoveReason(typed.reason)) {
      throw new ActionError("invalid_input", reasonFields(typed.reason));
    }
  },
  async write({ tx, input: typed, userId, locked }): Promise<CancelTransferResult> {
    const document = locked!.rows;
    const cancelled = await cancelTransferDocument(tx, {
      documentId: document.id,
      reason: moveReason(typed.reason),
      cancelledBy: userId,
    });
    return { documentId: document.id, number: cancelled.number };
  },
  async notify({ tx, userId, locked }, result) {
    const document = locked!.rows;
    const managers = await tx
      .select({ id: users.id })
      .from(users)
      .innerJoin(userBranches, eq(userBranches.userId, users.id))
      .where(
        and(
          eq(userBranches.branchId, document.toBranchId!),
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
      .where(eq(branches.id, document.branchId));
    await notify(
      { tx, userId },
      {
        to: managers.map((manager) => manager.id),
        type: "TRANSFER_CANCELLED",
        params: { actor: maker!.name, number: result.number, branch: sender!.code },
        // The receiving branch: notify() keeps only its people (decided item 6, Look first).
        branchId: document.toBranchId!,
        link: `/warehouse/documents/${document.id}`,
        at: now(),
      },
    );
  },
});
