"use server";

import { revalidatePath } from "next/cache";

import { type StockMinimumResult, setStockMinimum } from "@/features/warehouse/actions/minimum";
import { type ReverseResult, reverseStockDocument } from "@/features/warehouse/actions/reverse";
import {
  type ReversePreview,
  getReversePreview,
} from "@/features/warehouse/queries/reverse-preview";
import { serverAction } from "@/server/action";
import { type ActionResult, failure } from "@/server/action-result";
import { getCurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";

// The page actions of Reverse on the item card (09-warehouse.md, Movement types, last paragraph;
// Issue to a department 3; plan of 5.7). The definition's wrapper and the query check everything
// again: `stock.return_reverse` on the document's branch, its creator or the Head, its status.
// The minimum of the card (plan of 5.10): `stock.set_minimums` on the branch, checked by its
// wrapper.

const reverse = serverAction(reverseStockDocument);
const setMinimum = serverAction(setStockMinimum);

/** Sets or clears the card's minimum (empty: none). */
export async function setStockMinimumAction(
  input: unknown,
): Promise<ActionResult<StockMinimumResult>> {
  const result = await setMinimum(input);
  if (result.ok) revalidatePath("/warehouse", "layout");
  return result;
}

/** Reverses one issue or return with a reason; a second press is refused as `wrong_status`. */
export async function reverseStockDocumentAction(
  input: unknown,
): Promise<ActionResult<ReverseResult>> {
  const result = await reverse(input);
  if (result.ok) revalidatePath("/warehouse", "layout");
  return result;
}

/** The document's number, department and lines for the dialog (11 rule 6). */
export async function reversePreviewAction(input: {
  documentId: string;
}): Promise<ActionResult<ReversePreview>> {
  const user = await getCurrentUser();
  if (!user) return failure("signed_out");
  try {
    return { ok: true, data: await getReversePreview(user.id, input?.documentId) };
  } catch (error) {
    if (error instanceof AuthorizationError) return failure(error.kind);
    throw error;
  }
}
