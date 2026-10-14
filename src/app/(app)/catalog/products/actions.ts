"use server";

import { revalidatePath } from "next/cache";

import {
  createProduct,
  setProductActive,
  updateProduct,
} from "@/features/catalog/actions/products";
import { serverAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";

// The actions of /catalog/products (plan of 1.7, "Server actions and queries"): each runs the
// product action in the wrapper, under catalog.manage (03, "Manage catalogs …"). A success
// revalidates the catalog pages, /catalog's counts included.

const create = serverAction(createProduct);
const update = serverAction(updateProduct);
const setActive = serverAction(setProductActive);

async function revalidated<T>(result: ActionResult<T>): Promise<ActionResult<T>> {
  if (result.ok) revalidatePath("/catalog", "layout");
  return result;
}

/** Adds a product or service; the same client key twice gives the first (developer-rules rule 8). */
export async function createProductAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const result = await revalidated(await create(input));
  // Only the id goes back: the screen opens the new product's page and needs nothing else.
  return result.ok ? { ok: true, data: { id: (result.data as { id: string }).id } } : result;
}

/** Saves the fields the Head changed; the price is not one of them (plan of 1.7, decision 2). */
export async function updateProductAction(
  input: unknown,
): Promise<ActionResult<{ changed: string[] }>> {
  const result = await revalidated(await update(input));
  return result.ok
    ? { ok: true, data: { changed: (result.data as { changed: string[] }).changed } }
    : result;
}

/** Deactivates or activates a product (04 rule 2). */
export async function setProductActiveAction(
  input: unknown,
): Promise<ActionResult<{ id: string; isActive: boolean }>> {
  const result = await revalidated(await setActive(input));
  if (!result.ok) return result;
  const { id, isActive } = result.data as { id: string; isActive: boolean };
  return { ok: true, data: { id, isActive } };
}
