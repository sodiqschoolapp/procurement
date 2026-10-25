"use server";

import { revalidatePath } from "next/cache";

import { markAddedChecked } from "@/features/catalog/actions/manager-adds";
import { serverAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";

// The Head's home: products and subtypes added by Managers marked checked (04-catalogs.md rule 8;
// plan of 1.12b). catalog.manage, the Head only; the action asks it again.

const mark = serverAction(markAddedChecked);

/** Marks the ticked entries checked, all or nothing; the home is read again. */
export async function markAddedCheckedAction(
  input: unknown,
): Promise<ActionResult<{ products: number; subtypes: number }>> {
  const result = await mark(input);
  if (!result.ok) return result;
  revalidatePath("/");
  return result;
}
