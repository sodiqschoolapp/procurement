import { randomUUID } from "node:crypto";

import { db } from "@/server/db/client";
import { createDocument } from "@/server/stock-documents";
import { postMovement } from "@/server/stock-ledger";

// Warehouse scenes for the tests of 5.7: a receipt, and an issue or a return posted straight
// through createDocument() of src/server/stock-documents.ts, made by the user a test names, in
// any branch (the matrix needs a document in a branch its user does not see).

/** A RECEIPT of `qty` at `unitCost` into the branch's stock. */
export async function receive(
  branchId: string,
  variantId: string,
  qty: string,
  unitCost: bigint,
  createdBy: string,
): Promise<void> {
  await db.transaction((tx) =>
    postMovement(tx, { branchId, variantId, type: "RECEIPT", qtyDelta: qty, unitCost, createdBy }),
  );
}

/** A POSTED issue or return of one department; a return's lines come in at 1 000 so'm if empty. */
export async function postDocument(input: {
  type: "ISSUE" | "RETURN";
  branchId: string;
  departmentId: string;
  createdBy: string;
  lines: { variantId: string; qty: string }[];
}): Promise<{ documentId: string; number: string; lineIds: string[] }> {
  const created = await db.transaction((tx) =>
    createDocument(tx, {
      type: input.type,
      branchId: input.branchId,
      departmentId: input.departmentId,
      receivedByName: input.type === "ISSUE" ? "Sinov Qabulqiluvchi" : null,
      docDate: "2031-05-03",
      status: "POSTED",
      clientKey: randomUUID(),
      createdBy: input.createdBy,
      lines: input.lines.map((line) => ({
        ...line,
        unitCost: input.type === "RETURN" ? 1000n : null,
      })),
    }),
  );
  return { documentId: created.documentId, number: created.number, lineIds: created.lineIds };
}
