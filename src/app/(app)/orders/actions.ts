"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";

import {
  createDraft,
  deleteDraft,
  setDraftsNeededBy,
  updateDraft,
} from "@/features/orders/actions/drafts";
import {
  type WireChoices,
  type WireCreated,
  type WireDraftRow,
  type WireProduct,
  type WireUpdated,
  wireCreated,
  wireDraft,
  wireProduct,
  wireUpdated,
} from "@/features/orders/draft-wire";
import { getDraft } from "@/features/orders/queries/drafts";
import { listDraftChoices, searchDraftProducts } from "@/features/orders/queries/draft-picker";
import { serverAction } from "@/server/action";
import { type ActionResult, failure } from "@/server/action-result";
import { getCurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { draftsServerAction } from "@/server/drafts-action";

// The actions of the drafts grid on /orders (plan of 2.5b, Server actions and queries). Each runs
// the 2.5a definition in its wrapper, or the 2.5a query, which calls authorize() itself; none
// checks a permission of its own (developer-rules.md rule 4). Money goes out as text
// (src/features/orders/draft-wire.ts). A write that succeeds revalidates /orders.

const create = serverAction(createDraft);
const update = serverAction(updateDraft);
const remove = serverAction(deleteDraft);
const applyNeededBy = draftsServerAction(setDraftsNeededBy);

/** A query as an answer: a refusal of authorize() or of the input is returned, never thrown. */
async function asked<T>(read: (userId: string) => Promise<T>): Promise<ActionResult<T>> {
  const user = await getCurrentUser();
  if (!user) return failure("signed_out");
  try {
    return { ok: true, data: await read(user.id) };
  } catch (error) {
    if (error instanceof AuthorizationError) return failure(error.kind);
    if (error instanceof z.ZodError) return failure("invalid_input");
    throw error;
  }
}

/** Adds a draft, or raises the owner's draft of the same trio (05 Drafts 2); safe to repeat. */
export async function createDraftAction(input: unknown): Promise<ActionResult<WireCreated>> {
  const result = await create(input);
  if (!result.ok) return result;
  revalidatePath("/orders");
  return { ok: true, data: wireCreated(result.data) };
}

/** Saves the changed fields of one draft with its version (05 Drafts 3; rule 9). */
export async function updateDraftAction(input: unknown): Promise<ActionResult<WireUpdated>> {
  const result = await update(input);
  if (!result.ok) return result;
  revalidatePath("/orders");
  return { ok: true, data: wireUpdated(result.data) };
}

/** Deletes the owner's never-submitted draft (05 Drafts 3; developer-rules.md rule 11). */
export async function deleteDraftAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const result = await remove(input);
  if (!result.ok) return result;
  revalidatePath("/orders");
  return { ok: true, data: { id: result.data.id } };
}

/** One needed-by date on the ticked drafts, all or nothing (05 field 8; 06 rule 8). */
export async function setDraftsNeededByAction(
  input: unknown,
): Promise<ActionResult<{ orders: { id: string; version: number }[] }>> {
  const result = await applyNeededBy(input);
  if (!result.ok) return result;
  revalidatePath("/orders");
  return result;
}

/** The product picker of a branch (05 field 2): photo, category, type, stock, subtypes. */
export async function searchDraftProductsAction(input: {
  branchId: string;
  q: string;
}): Promise<ActionResult<WireProduct[]>> {
  return asked(async (userId) =>
    (await searchDraftProducts(userId, { branchId: input?.branchId, q: input?.q })).map(
      wireProduct,
    ),
  );
}

/** The departments, companies, extra cost types and two settings of a branch (05 fields 6, 7, 12, 13). */
export async function listDraftChoicesAction(input: {
  branchId: string;
}): Promise<ActionResult<WireChoices>> {
  return asked((userId) => listDraftChoices(userId, { branchId: input?.branchId }));
}

/** One row of the grid as the server holds it now, or null for every kind of not found. */
export async function getDraftAction(input: {
  id: string;
}): Promise<ActionResult<WireDraftRow | null>> {
  return asked(async (userId) => {
    const row = await getDraft(userId, String(input?.id ?? ""));
    return row && wireDraft(row);
  });
}
