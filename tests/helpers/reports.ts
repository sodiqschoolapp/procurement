import { randomUUID } from "node:crypto";

import { db } from "@/server/db/client";
import { createDocument } from "@/server/stock-documents";
import { postMovement } from "@/server/stock-ledger";

import { type Bought, type SpendingScene, bought } from "./analytics";

// Stock scenes for the stock reports of 6.9a: a purchase record with the RECEIPT it writes (and,
// cancelled, the REVERSAL its cancel writes; 07 What saving a record does 2; 09 Stock value), and
// a direct entry by the Head, both through the stock ledger as the actions post them.

/** `bought()` with its RECEIPT, and the REVERSAL of a cancelled record. Returns the record. */
export async function boughtIn(scene: SpendingScene, row: Bought) {
  const record = await bought(scene, row);
  const qty = row.qty ?? "1.000";
  const unitCost = BigInt(row.unitPrice ?? "10000");
  await db.transaction(async (tx) => {
    const receipt = await postMovement(tx, {
      branchId: scene.branch.id,
      variantId: record.variantId,
      type: "RECEIPT",
      qtyDelta: qty,
      unitCost,
      createdBy: record.ownerId,
      purchaseId: record.purchaseId,
    });
    if (row.cancelled) {
      await postMovement(tx, {
        branchId: scene.branch.id,
        variantId: record.variantId,
        type: "REVERSAL",
        qtyDelta: `-${qty}`,
        unitCost,
        createdBy: record.ownerId,
        purchaseId: record.purchaseId,
        reversesMovementId: receipt.movementId,
      });
    }
  });
  return record;
}

/** A POSTED direct entry of one line into the scene's branch, made by `headId`. */
export async function directEntry(
  scene: SpendingScene,
  headId: string,
  row: { docDate: string; variantId: string; qty: string; unitCost: bigint },
): Promise<string> {
  const created = await db.transaction((tx) =>
    createDocument(tx, {
      type: "DIRECT_ENTRY",
      branchId: scene.branch.id,
      docDate: row.docDate,
      status: "POSTED",
      reason: "EXISTING_STOCK",
      comment: null,
      clientKey: randomUUID(),
      createdBy: headId,
      lines: [{ variantId: row.variantId, qty: row.qty, unitCost: row.unitCost }],
    }),
  );
  return created.documentId;
}
