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
import { cancelOrders } from "@/features/orders/actions/cancel";
import { closeExactOrders } from "@/features/orders/actions/close-exact";
import { closeSkippedOrders } from "@/features/orders/actions/close-skipped";
import { copyOrdersAsNew } from "@/features/orders/actions/copy-as-new";
import { rejectOrders } from "@/features/orders/actions/reject";
import { sendBackOrders } from "@/features/orders/actions/send-back";
import { closeOrders } from "@/features/orders/actions/close";
import { moveOrdersToManager } from "@/features/orders/actions/move-owner";
import { reopenOrders } from "@/features/orders/actions/reopen";
import { sendBackForCorrectionOrders } from "@/features/orders/actions/send-back-for-correction";
import { sendToSettlementOrders } from "@/features/orders/actions/send-to-settlement";
import { submitAgainOrders } from "@/features/orders/actions/submit-again";
import { submitDrafts } from "@/features/orders/actions/submit";
import { takeBackOrders } from "@/features/orders/actions/take-back";
import { getDraft } from "@/features/orders/queries/drafts";
import {
  finishOrders,
  markNotBought,
  reopenBuying,
} from "@/features/purchasing/actions/finish-buying";
import { cancelPurchase, cancelTrip } from "@/features/purchasing/actions/cancel-purchase";
import { cancelMoney } from "@/features/money/actions/cancel-money";
import { acknowledgeOverspend } from "@/features/money/actions/acknowledge-overspend";
import { confirmSettlement } from "@/features/money/actions/confirm-settlement";
import { recordMoney } from "@/features/money/actions/record-money";
import { settleCash } from "@/features/money/actions/settle-cash";
import { moneyPrefillOrders } from "@/features/money/queries/money-prefill";
import {
  type MoveOwnerChoice,
  moveOwnerChoices,
} from "@/features/orders/queries/move-owner-choices";
import { newestMoves } from "@/features/orders/queries/newest-moves";
import { submittedNumbers } from "@/features/orders/queries/submitted";
import { selectAllOnFilter, tickedSummary } from "@/features/orders/queries/order-list";
import { parseListFilters } from "@/features/orders/list-filters";
import { type WireTickedSummary, wireTickedSummary } from "@/features/orders/list-wire";
import { listDraftChoices, searchDraftProducts } from "@/features/orders/queries/draft-picker";
import {
  type ProductAdd,
  type SubtypeAdd,
  addProductWhileOrdering,
  addSubtypeWhileOrdering,
  subtypeAddShown,
} from "@/features/catalog/actions/manager-adds";
import { type AddChoices, listAddChoices } from "@/features/catalog/queries/manager-adds";
import { type DecidedVerb, alreadyDecidedBy } from "@/domain/already-decided";
import { serverAction } from "@/server/action";
import { type ActionFailure, type ActionResult, failure } from "@/server/action-result";
import { getCurrentUser } from "@/server/auth/session";
import { today } from "@/server/clock";
import { AuthorizationError } from "@/server/authorize";
import { copyServerAction } from "@/server/copy-action";
import { draftsServerAction } from "@/server/drafts-action";
import { ordersServerAction } from "@/server/order-action";

// The actions of the drafts grid on /orders (plan of 2.5b, Server actions and queries). Each runs
// the 2.5a definition in its wrapper, or the 2.5a query, which calls authorize() itself; none
// checks a permission of its own (developer-rules.md rule 4). Money goes out as text
// (src/features/orders/draft-wire.ts). A write that succeeds revalidates /orders.

const create = serverAction(createDraft);
const addProduct = serverAction(addProductWhileOrdering);
const addSubtype = serverAction(addSubtypeWhileOrdering);
const update = serverAction(updateDraft);
const remove = serverAction(deleteDraft);
const applyNeededBy = draftsServerAction(setDraftsNeededBy);
const submit = ordersServerAction(submitDrafts);
const approve = ordersServerAction(approveOrders);
const sendBack = ordersServerAction(sendBackOrders);
const reject = ordersServerAction(rejectOrders);
const cancel = ordersServerAction(cancelOrders);
const takeBack = ordersServerAction(takeBackOrders);
const submitAgain = ordersServerAction(submitAgainOrders);
const copyAsNew = copyServerAction(copyOrdersAsNew);
const finish = ordersServerAction(finishOrders);
const notBought = ordersServerAction(markNotBought);
const reopen = ordersServerAction(reopenBuying);
const closeExact = ordersServerAction(closeExactOrders);
const closeSkipped = ordersServerAction(closeSkippedOrders);
const toSettlement = ordersServerAction(sendToSettlementOrders);
const cancelRecord = ordersServerAction(cancelPurchase);
const cancelWholeTrip = ordersServerAction(cancelTrip);
const recordMoneyRun = ordersServerAction(recordMoney);
const cancelMoneyRun = ordersServerAction(cancelMoney);
const settleCashRun = ordersServerAction(settleCash);
const confirmSettlementRun = ordersServerAction(confirmSettlement);
const toCorrection = ordersServerAction(sendBackForCorrectionOrders);
const close = ordersServerAction(closeOrders);
const reopenClosed = ordersServerAction(reopenOrders);
const acknowledge = ordersServerAction(acknowledgeOverspend);
const moveOwner = ordersServerAction(moveOrdersToManager);

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

/** One order another user moved since the screen showed it (06 rule 7). */
export type WireDecided = { orderId: string; verb: DecidedVerb; name: string; at: string };

/** What a move on ticked orders answers: each order's new status, or the refusal and who moved. */
export type MoveAnswer =
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
 * Runs one move on ticked orders, all or nothing (06 Allowed moves; rules 7, 8; plans of 2.10 and
 * 2.11). A refusal names every order that failed; for one another user moved since the screen
 * showed it, newestMoves(), which calls authorize() itself with the walls in its SQL, says who,
 * how and when (2.10 decided item 3; 2.11 decided item 7, Look first). Never retried by the screen.
 */
async function moveAnswer(
  run: (input: unknown) => Promise<ActionResult<{ orders: { id: string; status: string }[] }>>,
  input: unknown,
): Promise<MoveAnswer> {
  const result = await run(input);
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
      const by = alreadyDecidedBy(
        { code: order.code, sentVersion: sent.get(order.orderId) ?? 0 },
        newest.get(order.orderId) ?? null,
        { id: user.id, role: user.role },
      );
      if (by) {
        decided.push({
          orderId: order.orderId,
          verb: by.verb,
          name: by.name,
          at: by.at.toISOString(),
        });
      }
    }
  }
  revalidatePath("/orders");
  return { ok: false, error: result.error, decided };
}

/** Approves the ticked orders at the Head, Principal or Finance step (plan of 2.10). */
export async function approveOrdersAction(input: unknown): Promise<MoveAnswer> {
  return moveAnswer(approve, input);
}

/** Sends the ticked orders back to their owners, one reason, a note per order (plan of 2.11). */
export async function sendBackOrdersAction(input: unknown): Promise<MoveAnswer> {
  return moveAnswer(sendBack, input);
}

/** Rejects the ticked orders for good, with one reason (plan of 2.11). */
export async function rejectOrdersAction(input: unknown): Promise<MoveAnswer> {
  return moveAnswer(reject, input);
}

/** Cancels the ticked orders, by their owner or the Head, with one reason (plan of 2.11). */
export async function cancelOrdersAction(input: unknown): Promise<MoveAnswer> {
  return moveAnswer(cancel, input);
}

/** Takes the ticked orders back to Draft before the Head decides (plan of 2.11). */
export async function takeBackOrdersAction(input: unknown): Promise<MoveAnswer> {
  return moveAnswer(takeBack, input);
}

/** Submits the ticked sent-back orders again: revision + 1, back to the Head (plan of 2.11). */
export async function submitAgainOrdersAction(input: unknown): Promise<MoveAnswer> {
  return moveAnswer(submitAgain, input);
}

/** Closes the ticked finished orders that match exactly (08 Closing 1; plan of 4.4). */
export async function closeExactOrdersAction(input: unknown): Promise<MoveAnswer> {
  return moveAnswer(closeExact, input);
}

/**
 * Closes the ticked finished orders that skipped Finance, whatever their difference (06 Finance
 * step switched off 3; plan of 4.10c).
 */
export async function closeSkippedOrdersAction(input: unknown): Promise<MoveAnswer> {
  return moveAnswer(closeSkipped, input);
}

/** Sends the ticked finished orders to Finance for settlement (06 Allowed moves; plan of 4.4). */
export async function sendToSettlementOrdersAction(input: unknown): Promise<MoveAnswer> {
  return moveAnswer(toSettlement, input);
}

/** Finishes the buying of the ticked Open orders, with one reason (07 Order progress; plan of 3.5). */
export async function finishOrdersAction(input: unknown): Promise<MoveAnswer> {
  return moveAnswer(finish, input);
}

/** Marks the ticked Open orders Not bought, nothing received, with one reason (plan of 3.5). */
export async function markNotBoughtAction(input: unknown): Promise<MoveAnswer> {
  return moveAnswer(notBought, input);
}

/** Reopens the buying of the ticked finished Open orders (07 Order progress; plan of 3.5). */
export async function reopenBuyingAction(input: unknown): Promise<MoveAnswer> {
  return moveAnswer(reopen, input);
}

/** Cancels one purchase record of an Open order, with a reason (07 Fixing a mistake; plan of 3.7). */
export async function cancelPurchaseAction(input: unknown): Promise<MoveAnswer> {
  return moveAnswer(cancelRecord, input);
}

/** Cancels every record of one trip, all or nothing, with a reason (07 Fixing a mistake; 3.7). */
export async function cancelTripAction(input: unknown): Promise<MoveAnswer> {
  return moveAnswer(cancelWholeTrip, input);
}

/** Records a money action of one kind on the ticked orders, one per Manager (08; plan of 4.3). */
export async function recordMoneyAction(input: unknown): Promise<MoveAnswer> {
  return moveAnswer(recordMoneyRun, input);
}

/** Cancels a wrong money action whole, with a reason (08 Money ledger; plan of 4.3). */
export async function cancelMoneyAction(input: unknown): Promise<MoveAnswer> {
  return moveAnswer(cancelMoneyRun, input);
}

/** Finance's settlement action: Receive and Pay rows, one action per Manager (08 Closing 2; 4.5). */
export async function settleCashAction(input: unknown): Promise<MoveAnswer> {
  return moveAnswer(settleCashRun, input);
}

/** Ticks or unticks "Confirmed" of a transfer or card block (08 Closing 2; plan of 4.5). */
export async function confirmSettlementAction(input: unknown): Promise<MoveAnswer> {
  return moveAnswer(confirmSettlementRun, input);
}

/** Sends the ticked settlement orders back to Open with a reason (08 Closing 4; plan of 4.5). */
export async function sendBackForCorrectionOrdersAction(input: unknown): Promise<MoveAnswer> {
  return moveAnswer(toCorrection, input);
}

/** Finance closes the ticked settlement orders that are all ready (08 Closing 3; plan of 4.6). */
export async function closeOrdersAction(input: unknown): Promise<MoveAnswer> {
  return moveAnswer(close, input);
}

/** The Head reopens the ticked Closed orders with one reason (06 Allowed moves; plan of 4.8). */
export async function reopenOrdersAction(input: unknown): Promise<MoveAnswer> {
  return moveAnswer(reopenClosed, input);
}

/** The Head acknowledges the overspend of the ticked orders with one comment (08; plan of 4.7). */
export async function acknowledgeOverspendAction(input: unknown): Promise<MoveAnswer> {
  return moveAnswer(acknowledge, input);
}

/** The Head moves the ticked orders to another Manager of their branch (03 rule 7; plan of 4.10). */
export async function moveOrdersToManagerAction(input: unknown): Promise<MoveAnswer> {
  return moveAnswer(moveOwner, input);
}

/** The Managers the ticked orders can be moved to (03 rule 7; plan of 4.10). */
export async function moveOwnerChoicesAction(input: {
  ids: string[];
}): Promise<ActionResult<MoveOwnerChoice[]>> {
  return asked((userId) => moveOwnerChoices(userId, Array.isArray(input?.ids) ? input.ids : []));
}

/** One ticked order as the Record money dialog shows it; money as text of whole so'm. */
export type WireMoneyOrder = {
  id: string;
  version: number;
  number: string;
  status: string;
  branchId: string;
  ownerId: string;
  ownerName: string;
  plannedCash: string;
  cashCount: string;
  handed: string;
};

/**
 * The ticked orders the Record money dialog prefills from (plan of 4.3, decided item 2), and
 * today in Tashkent from the injected clock, the date it starts at (decided item 8).
 */
export async function moneyPrefillAction(input: {
  ids: string[];
}): Promise<ActionResult<{ today: string; orders: WireMoneyOrder[] }>> {
  return asked(async (userId) => ({
    today: today(),
    orders: (await moneyPrefillOrders(userId, Array.isArray(input?.ids) ? input.ids : [])).map(
      (order) => ({
        ...order,
        plannedCash: order.plannedCash.toString(),
        cashCount: order.cashCount.toString(),
        handed: order.handed.toString(),
      }),
    ),
  }));
}

/** What Copy as new answers: each ticked order's draft, and for a merge the quantity after it. */
export type WireCopied = {
  orders: { id: string; draftId: string; merged: boolean; quantity: string | null }[];
};

/**
 * Copies the ticked orders into drafts of the user, all or nothing (05 Ticking and filters: Copy
 * as new; Drafts 2; 06 rule 8; plan of 2.13). Each order carries its own client key, so a retry
 * gives the first answer (developer-rules.md rule 8).
 */
export async function copyOrdersAsNewAction(input: unknown): Promise<ActionResult<WireCopied>> {
  const result = await copyAsNew(input);
  if (!result.ok) return result;
  revalidatePath("/orders");
  return {
    ok: true,
    data: {
      orders: result.data.orders.map(({ id, made }) => ({
        id,
        draftId: made.id,
        merged: made.merged,
        quantity: made.merged ? made.quantity : null,
      })),
    },
  };
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

/**
 * A product added from the product search of the drafts (04-catalogs.md rule 8; plan of 1.12b):
 * made, or the existing entry offered; safe to repeat.
 */
export async function addProductWhileOrderingAction(
  input: unknown,
): Promise<ActionResult<ProductAdd>> {
  const result = await addProduct(input);
  if (result.ok && result.data.outcome === "made") revalidatePath("/catalog", "layout");
  return result;
}

/** A subtype added from the product search of the drafts (04 rule 8; plan of 1.12b). */
export async function addSubtypeWhileOrderingAction(
  input: unknown,
): Promise<ActionResult<SubtypeAdd>> {
  const result = await addSubtype(input);
  if (!result.ok) return result;
  if (result.data.outcome === "made") revalidatePath("/catalog", "layout");
  return { ok: true, data: subtypeAddShown(result.data) };
}

/**
 * The active categories and measures of the add's form (04 rule 8: "category and measure picked
 * from their catalogs"): catalog.pick, every role, active only (plan of 1.12b, decided item 15).
 */
export async function listAddChoicesAction(): Promise<ActionResult<AddChoices>> {
  return asked((userId) => listAddChoices(userId));
}
