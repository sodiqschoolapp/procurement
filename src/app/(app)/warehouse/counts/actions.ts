"use server";

import { revalidatePath } from "next/cache";

import { type StartCountResult, startCount } from "@/features/warehouse/actions/count";
import { serverAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";

// The page action of /warehouse/counts (09-warehouse.md, Other documents, Stock count; plan of
// 7.3): start a count. The definition's wrapper checks everything again: `stock.start_count` on
// the input's branch, the branch active, the items under their locks.

const startAction = serverAction(startCount);

/** Starts one count of a branch or a category. */
export async function startCountAction(input: unknown): Promise<ActionResult<StartCountResult>> {
  const result = await startAction(input);
  if (result.ok) revalidatePath("/warehouse", "layout");
  return result;
}
