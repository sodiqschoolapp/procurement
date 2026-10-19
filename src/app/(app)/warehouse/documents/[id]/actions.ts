"use server";

import { revalidatePath } from "next/cache";

import {
  type SaveCountedQuantitiesResult,
  saveCountedQuantities,
} from "@/features/warehouse/actions/count";
import {
  type ReceiveTransferResult,
  receiveTransfer,
} from "@/features/warehouse/actions/receive-transfer";
import {
  type WriteOffDecisionResult,
  decideWriteOff,
} from "@/features/warehouse/actions/write-off-decision";
import { serverAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";

// The page action of a write-off's page (09-warehouse.md, Other documents, Write-off; plan of
// 5.11): the Head approves or refuses. The definition's wrapper checks everything again:
// `stock.approve_write_off` on the document's branch, the status under the lock, the stock.

const decideAction = serverAction(decideWriteOff);

/** Approves or refuses one waiting write-off. */
export async function decideWriteOffAction(
  input: unknown,
): Promise<ActionResult<WriteOffDecisionResult>> {
  const result = await decideAction(input);
  if (result.ok) revalidatePath("/warehouse", "layout");
  return result;
}

// The receiving branch receives a transfer (09 Other documents, Transfer; plan of 7.2): the
// definition's wrapper checks everything again: `stock.receive_transfer` on the receiving branch,
// the status and the lines under the lock.

const receiveAction = serverAction(receiveTransfer);

/** Receives one In-transit transfer with what really arrived. */
export async function receiveTransferAction(
  input: unknown,
): Promise<ActionResult<ReceiveTransferResult>> {
  const result = await receiveAction(input);
  if (result.ok) revalidatePath("/warehouse", "layout");
  return result;
}

// Type the counted quantities of a count (09 Other documents, Stock count; plan of 7.3): the
// definition's wrapper checks everything again: `stock.start_count` on the count's branch, the
// status and the lines under the lock.

const saveCountedAction = serverAction(saveCountedQuantities);

/** Saves the counted quantities typed on a waiting count. */
export async function saveCountedQuantitiesAction(
  input: unknown,
): Promise<ActionResult<SaveCountedQuantitiesResult>> {
  const result = await saveCountedAction(input);
  if (result.ok) revalidatePath("/warehouse", "layout");
  return result;
}
