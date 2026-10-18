"use server";

import { revalidatePath } from "next/cache";

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
