"use server";

import { revalidatePath } from "next/cache";

import { type StockMinimumResult, setStockMinimum } from "@/features/warehouse/actions/minimum";
import { serverAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";

// The page action of the minimum on Stock on hand (09-warehouse.md, Low stock: "typed per subtype
// per branch, on the item card or in the Stock on hand list"; plan of 5.10). The definition's
// wrapper checks everything: `stock.set_minimums` on the branch, the subtype, the quantity.

const setMinimum = serverAction(setStockMinimum);

/** Sets or clears one minimum (empty: none). */
export async function setStockMinimumAction(
  input: unknown,
): Promise<ActionResult<StockMinimumResult>> {
  const result = await setMinimum(input);
  if (result.ok) revalidatePath("/warehouse", "layout");
  return result;
}
