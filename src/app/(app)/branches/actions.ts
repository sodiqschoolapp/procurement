"use server";

import { revalidatePath } from "next/cache";

import { createBranch, setBranchActive, updateBranch } from "@/features/catalog/actions/branches";
import { serverAction } from "@/server/action";

// The actions of /branches (plan of 1.2, "Server actions and queries"). A success revalidates
// the signed-in layout: the top bar's branch list shows branches too.

const create = serverAction(createBranch);
const update = serverAction(updateBranch);
const setActive = serverAction(setBranchActive);

/** Creates a branch; the same client key twice gives the first one (developer-rules.md rule 8). */
export async function createBranchAction(input: unknown) {
  const result = await create(input);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Saves the fields the Head changed. */
export async function updateBranchAction(input: unknown) {
  const result = await update(input);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Deactivates or activates a branch. */
export async function setBranchActiveAction(input: unknown) {
  const result = await setActive(input);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
