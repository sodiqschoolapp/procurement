"use server";

import { revalidatePath } from "next/cache";

import {
  createDepartment,
  setDepartmentActive,
  updateDepartment,
} from "@/features/catalog/actions/departments";
import { serverAction } from "@/server/action";
import type { ActionResult } from "@/server/action-result";

// The actions of /catalog/departments (plan of 1.6, "Server actions and queries"): each runs the
// department action in the wrapper, under catalog.manage (03, "Manage catalogs …"). A success
// revalidates the catalog pages, /catalog's counts included.

const create = serverAction(createDepartment);
const update = serverAction(updateDepartment);
const setActive = serverAction(setDepartmentActive);

async function revalidated<T>(result: ActionResult<T>): Promise<ActionResult<T>> {
  if (result.ok) revalidatePath("/catalog", "layout");
  return result;
}

/** Adds a department; the same client key twice gives the first one (developer-rules.md rule 8). */
export async function createDepartmentAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return (await revalidated(await create(input))) as ActionResult<{ id: string }>;
}

/** Saves the fields the Head changed; the branch never changes (plan of 1.6, decision 1). */
export async function updateDepartmentAction(
  input: unknown,
): Promise<ActionResult<{ changed: string[] }>> {
  return (await revalidated(await update(input))) as ActionResult<{ changed: string[] }>;
}

/** Deactivates or activates a department (04 rule 2). */
export async function setDepartmentActiveAction(
  input: unknown,
): Promise<ActionResult<{ id: string; isActive: boolean }>> {
  return (await revalidated(await setActive(input))) as ActionResult<{
    id: string;
    isActive: boolean;
  }>;
}
