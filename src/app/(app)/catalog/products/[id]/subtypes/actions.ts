"use server";

import { revalidatePath } from "next/cache";

import {
  createSubtype,
  setSubtypeActive,
  updateSubtype,
} from "@/features/catalog/actions/subtypes";
import { serverAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";

// The actions of a product's subtypes (plan of 1.8, "Server actions and queries"): each runs the
// subtype action in the wrapper, under catalog.manage (03, "Manage catalogs …"). A success
// revalidates the catalog pages. Each returns only what the screen needs.

const create = serverAction(createSubtype);
const update = serverAction(updateSubtype);
const setActive = serverAction(setSubtypeActive);

async function revalidated<T>(result: ActionResult<T>): Promise<ActionResult<T>> {
  if (result.ok) revalidatePath("/catalog", "layout");
  return result;
}

/** Adds a subtype; the same client key twice gives the first (developer-rules rule 8). */
export async function createSubtypeAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const result = await revalidated(await create(input));
  return result.ok
    ? { ok: true, data: { id: (result.data as { entry: { id: string } }).entry.id } }
    : result;
}

/** Saves the name or photo the Head changed; the price is not one of them (decision 2). */
export async function updateSubtypeAction(
  input: unknown,
): Promise<ActionResult<{ changed: string[] }>> {
  const result = await revalidated(await update(input));
  return result.ok
    ? { ok: true, data: { changed: (result.data as { changed: string[] }).changed } }
    : result;
}

/** Deactivates or activates a subtype; the last active one stays (decision 3). */
export async function setSubtypeActiveAction(
  input: unknown,
): Promise<ActionResult<{ id: string; isActive: boolean }>> {
  const result = await revalidated(await setActive(input));
  if (!result.ok) return result;
  const { id, isActive } = result.data as { id: string; isActive: boolean };
  return { ok: true, data: { id, isActive } };
}
