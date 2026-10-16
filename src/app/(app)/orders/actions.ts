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
import { approveOrders } from "@/features/orders/actions/approve";
import { submitDrafts } from "@/features/orders/actions/submit";
import { getDraft } from "@/features/orders/queries/drafts";
import { newestMoves } from "@/features/orders/queries/newest-moves";
import { submittedNumbers } from "@/features/orders/queries/submitted";
import { selectAllOnFilter, tickedSummary } from "@/features/orders/queries/order-list";
import { parseListFilters } from "@/features/orders/list-filters";
import { type WireTickedSummary, wireTickedSummary } from "@/features/orders/list-wire";
import { listDraftChoices, searchDraftProducts } from "@/features/orders/queries/draft-picker";
import { alreadyApprovedBy } from "@/domain/already-decided";
import { serverAction } from "@/server/action";
import { type ActionFailure, type ActionResult, failure } from "@/server/action-result";
import { getCurrentUser } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authorize";
import { draftsServerAction } from "@/server/drafts-action";
import { ordersServerAction } from "@/server/order-action";

// The actions of the drafts grid on /orders (plan of 2.5b, Server actions and queries). Each runs
// the 2.5a definition in its wrapper, or the 2.5a query, which calls authorize() itself; none
// checks a permission of its own (developer-rules.md rule 4). Money goes out as text
// (src/features/orders/draft-wire.ts). A write that succeeds revalidates /orders.

const create = serverAction(createDraft);
const update = serverAction(updateDraft);
const remove = serverAction(deleteDraft);
const applyNeededBy = draftsServerAction(setDraftsNeededBy);
const submit = ordersServerAction(submitDrafts);
const approve = ordersServerAction(approveOrders);

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

/** What a Submit answers: each order's status and its new number (05 Order number). */
export type WireSubmitted = { orders: { id: string; status: string; number: string | null }[] };

/**
 * Submits the ticked drafts, all or nothing (05 Drafts 4; Checks at submit; 06 rule 8). The
 * numbers are read after the action by submittedNumbers(), which calls authorize() itself; they
 * never change (`orders_number_fixed`), so a repeat answers the first call's (plan of 2.7, Should
 * fix 3). Never retried by the screen (progress 2.6, "For 2.7").
 */
export async function submitDraftsAction(input: unknown): Promise<ActionResult<WireSubmitted>> {
  const result = await submit(input);
  if (!result.ok) return result;
  const user = await getCurrentUser();
  const numbers = user
    ? await submittedNumbers(
        user.id,
        result.data.orders.map((order) => order.id),
      )
    : new Map<string, string>();
  revalidatePath("/orders");
  return {
    ok: true,
    data: {
      orders: result.data.orders.map((order) => ({
        id: order.id,
        status: order.status,
        number: numbers.get(order.id) ?? null,
      })),
    },
  };
}

/** One order another user approved since the screen showed it (06 rule 7). */
export type WireDecided = { orderId: string; name: string; at: string };

/** What Approve answers: each order's new status, or the refusal and who approved meanwhile. */
export type ApproveAnswer =
  | { ok: true; data: { orders: { id: string; status: string }[] } }
  | { ok: false; error: ActionFailure; decided: WireDecided[] };

/** The version each ticked order was sent with, read from the raw input for the refusal only. */
function sentVersions(input: unknown): Map<string, number> {
  const sent = (input as { orders?: unknown } | null)?.orders;
  const versions = new Map<string, number>();
  if (!Array.isArray(sent)) return versions;
  for (const order of sent as { id?: unknown; version?: unknown }[]) {
    if (typeof order?.id === "string" && typeof order.version === "number") {
      versions.set(order.id, order.version);
    }
  }
  return versions;
}

/**
 * Approves the ticked orders at the Head, Principal or Finance step, all or nothing (06 Allowed
 * moves; rules 7, 8; plan of 2.10). A refusal names every order that failed; for one another user
 * approved since the screen showed it, newestMoves(), which calls authorize() itself with the
 * walls in its SQL, says who and when (decided item 3, Look first). Never retried by the screen.
 */
export async function approveOrdersAction(input: unknown): Promise<ApproveAnswer> {
  const result = await approve(input);
  if (result.ok) {
    revalidatePath("/orders");
    return { ok: true, data: { orders: result.data.orders } };
  }
  const refused = result.error.orders ?? [];
  const user = await getCurrentUser();
  const decided: WireDecided[] = [];
  const asked = refused.filter(
    (order) => order.code === "stale_version" || order.code === "wrong_status",
  );
  if (user && asked.length > 0) {
    const sent = sentVersions(input);
    // A user who lost the right to see orders meanwhile is told nothing more.
    const newest = await newestMoves(
      user.id,
      asked.map((order) => order.orderId),
    ).catch((error: unknown) => {
      if (error instanceof AuthorizationError) return new Map();
      throw error;
    });
    for (const order of asked) {
      const by = alreadyApprovedBy(
        { code: order.code, sentVersion: sent.get(order.orderId) ?? 0 },
        newest.get(order.orderId) ?? null,
        user.id,
      );
      if (by) decided.push({ orderId: order.orderId, name: by.name, at: by.at.toISOString() });
    }
  }
  revalidatePath("/orders");
  return { ok: false, error: result.error, decided };
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

/**
 * "Select all on this filter" of the order list (05 Ticking and filters; plan of 2.8, decided item
 * 6): the filters come as the address's query text and are read like the page reads them.
 */
export async function selectAllOnFilterAction(input: {
  query: string;
}): Promise<ActionResult<{ orders: { id: string; version: number }[]; matching: number }>> {
  return asked((userId) => {
    const query = new URLSearchParams(String(input?.query ?? ""));
    return selectAllOnFilter(userId, parseListFilters(Object.fromEntries(query)).filters);
  });
}

/** The count, totals and allowed actions of the ticked orders (11 Order list layout 4). */
export async function tickedSummaryAction(input: {
  ids: string[];
}): Promise<ActionResult<WireTickedSummary>> {
  return asked(async (userId) =>
    wireTickedSummary(await tickedSummary(userId, Array.isArray(input?.ids) ? input.ids : [])),
  );
}
