"use server";

import { revalidatePath } from "next/cache";

import { addPrice } from "@/features/catalog/actions/prices";
import { serverAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";

// The action of a new price (plan of 1.9, "Server actions and queries"): it runs addPrice in the
// wrapper, under price.add (03, "Add a new price for a product": Head only). A success revalidates
// the price pages and the catalog pages that show the price. It returns only what the screen needs.

const add = serverAction(addPrice);

/** Adds a new price with its note; the same client key twice gives the first (rule 8). */
export async function addPriceAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const result = await add(input);
  if (!result.ok) return result;
  revalidatePath("/prices", "layout");
  revalidatePath("/catalog", "layout");
  return { ok: true, data: { id: (result.data as { historyId: string }).historyId } };
}
