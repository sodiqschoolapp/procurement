"use server";

import { revalidatePath } from "next/cache";

import {
  addSuggestedProduct,
  declineSuggestion,
  suggestProduct,
} from "@/features/catalog/actions/suggestions";
import { serverAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";

// The actions of /suggestions (plan of 1.12, "Server actions and queries"): each runs its action
// in the wrapper. Suggesting is catalog.suggest on the branch (Head, Manager); adding and declining
// are catalog.manage (Head). A success revalidates the suggestions and the catalog pages.

const suggest = serverAction(suggestProduct);
const add = serverAction(addSuggestedProduct);
const decline = serverAction(declineSuggestion);

function revalidate() {
  revalidatePath("/suggestions", "layout");
  revalidatePath("/catalog", "layout");
}

/** Sends a suggestion; the same client key twice gives the first (developer-rules rule 8). */
export async function suggestProductAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const result = await suggest(input);
  if (!result.ok) return result;
  revalidate();
  return { ok: true, data: { id: result.data.id } };
}

/** Adds the suggested product to the catalog, as the Head edited it (04 rule 8). */
export async function addSuggestedProductAction(
  input: unknown,
): Promise<ActionResult<{ id: string; productId: string }>> {
  const result = await add(input);
  if (!result.ok) return result;
  revalidate();
  return { ok: true, data: { id: result.data.id, productId: result.data.productId } };
}

/** Declines the suggestion with a reason (04 rule 8). */
export async function declineSuggestionAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const result = await decline(input);
  if (!result.ok) return result;
  revalidate();
  return { ok: true, data: { id: result.data.id } };
}
