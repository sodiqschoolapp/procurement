// The rules of a draft order (05-order-request-form.md, Order fields 7, 10, 11, 12, 14, 15, 16;
// Drafts 2, 3 and 5; edge-cases/warehouse.md, "Half a piece is typed for an item counted in
// pieces"; plan of 2.5a). Pure: the draft actions of src/features/orders/actions/ and the grid read
// these; the database holds the CHECKs of migration 0019 as its last defence. A quantity is the
// decimal text of numeric(14,3), read only by ./order-totals.ts (developer-rules.md rules 1, 6).

import { catalogName, isCatalogName } from "./catalogs";
import { isSomOrZero } from "./money";
import {
  type OrderPlan,
  type OrdersTotals,
  QUANTITY,
  orderTotal,
  ordersTotals,
  quantityOf,
} from "./order-totals";
import type { PaymentType } from "./payment-types";
import { allowedActions } from "./order-moves";
import { type Actor, type Role, decide } from "./permissions";
import type { ProductType } from "./products";
import type { RequestStatus } from "./request-status";

/** Why a typed quantity is refused, as a field error kind (`errors.field.<kind>`). */
export type QuantityRefusal =
  "required" | "wrongFormat" | "tooSmall" | "tooLarge" | "tooManyDecimals" | "wholeOnly";

/** Digits, and digits after one point: anything else is not a quantity at all. */
const PLAIN_DECIMAL = /^([0-9]+)(?:\.([0-9]+))?$/;

/**
 * Why a quantity is refused, or `null` when it is good (05 field 10: "More than 0. Up to 3
 * decimals, only when the measure allows decimals"; plan of 2.5a, decided item 5). A whole value
 * written with zero decimals, such as the stored "10.000", is whole.
 */
export function quantityRefusal(
  text: string | null | undefined,
  allowsDecimals: boolean,
): QuantityRefusal | null {
  const typed = (text ?? "").trim();
  if (typed === "") return "required";
  const parts = PLAIN_DECIMAL.exec(typed);
  if (!parts) return "wrongFormat";
  const decimals = parts[2] ?? "";
  if (decimals.length > 3) return "tooManyDecimals";
  if (!QUANTITY.test(typed)) return "tooLarge";
  // No digit other than 0: the value is 0, and a quantity is more than 0.
  if (!/[1-9]/.test(typed)) return "tooSmall";
  if (!allowsDecimals && /[1-9]/.test(decimals)) return "wholeOnly";
  return null;
}

/** A quantity as it is stored: the typed text, trimmed. */
export function draftQuantity(text: string): string {
  return text.trim();
}

/**
 * The quantity of a draft after a merged add (05 Drafts 2: "the existing draft's quantity rises by
 * the new quantity"), exact; `null` when the sum no longer fits numeric(14,3). Each part must be a
 * quantity more than 0, else RangeError.
 */
export function addQuantities(held: string, added: string): string | null {
  const sum = quantityOf(held).plus(quantityOf(added)).toFixed();
  return QUANTITY.test(sum) ? sum : null;
}

/** A stored quantity without the trailing zeros numeric(14,3) keeps: "20.000" is "20". */
export function plainQuantity(stored: string): string {
  return quantityOf(stored).toFixed();
}

/**
 * "In stock" of an order (05 field 4): the branch's stock as stored, without trailing zeros; no
 * stock row is 0; a service has no stock and shows a dash (null).
 */
export function inStock(type: ProductType, stored: string | null): string | null {
  if (type === "SERVICE") return null;
  return stored === null || !/[1-9]/.test(stored) ? "0" : plainQuantity(stored);
}

/**
 * The suggested price of a subtype (05 field 11: "the reference price set by the Head, else the
 * last purchase price, else empty"), never the product's own price (decisions 1.8, item 4).
 */
export function suggestedPrice(
  reference: bigint | null,
  lastPurchase: bigint | null,
): bigint | null {
  return reference ?? lastPurchase ?? null;
}

/** "Urgent needs a short reason" (05 field 14): 1 to 200 code points once trimmed (item 15). */
export const URGENT_REASON_MAX = 200;

/** An Urgent reason as it is stored: trimmed at both ends. */
export function urgentReason(value: string): string {
  return value.trim();
}

export function isUrgentReason(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const length = Array.from(urgentReason(value)).length;
  return length >= 1 && length <= URGENT_REASON_MAX;
}

/** "Optional, up to 1000 characters" (05 field 15; the CHECK of migration 0019). */
export const DRAFT_COMMENT_MAX = 1000;

/** A comment as it is stored: trimmed; an empty one is stored as null by the action. */
export function draftComment(value: string): string {
  return value.trim();
}

export function isDraftComment(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const length = Array.from(value).length;
  return length >= 1 && length <= DRAFT_COMMENT_MAX;
}

/** The named person of "Requested by" (05 field 7): a name, as other names (item 18). */
export const requesterName = catalogName;
export const isRequesterName = isCatalogName;

/** At most 20 extra-cost rows on one order (05 field 12; plan of 2.5a, decided item 13). */
export const DRAFT_EXTRAS_MAX = 20;

/** Drafts on one page of the drafts grid (11-screens-and-ux.md, Rules for a smooth feel 8). */
export const DRAFTS_PAGE_SIZE = 25;

/** Products the picker of a draft shows for one search (plan of 2.5a, Server actions). */
export const DRAFT_PICKER_MAX = 20;

/** The plan of a draft, which may be half filled (05 Drafts 3). */
export type DraftPlan = Omit<OrderPlan, "quantity" | "price"> & {
  quantity: string | null;
  price: bigint | null;
};

/**
 * The total of a draft (05 field 16): orderTotal() once quantity and price are there, else null
 * (plan of 2.5a, decided item 19).
 */
export function draftTotal(plan: DraftPlan): bigint | null {
  if (plan.quantity === null || plan.price === null) return null;
  return orderTotal({ ...plan, quantity: plan.quantity, price: plan.price });
}

/**
 * Whether a draft's total can be stored: none, or whole so'm from 0 to MONEY_MAX (developer-rules
 * rule 6; review of 2.5a, S3). A larger one is refused as too large, never left to the database.
 */
export function totalFits(total: bigint | null): boolean {
  return total === null || isSomOrZero(total);
}

/** The statuses whose plan is edited in the drafts grid (05 Drafts 5; 06 rule 6). */
export function isDraftEditable(status: RequestStatus): boolean {
  return status === "DRAFT" || status === "RETURNED";
}

/**
 * A draft that was never submitted: a DRAFT without a number (05 Drafts 2 and 3; Order number 1).
 * Only such a draft is merged into and deleted (developer-rules.md rule 11).
 */
export function isNeverSubmitted(order: { status: RequestStatus; number: string | null }): boolean {
  return order.status === "DRAFT" && order.number === null;
}

/**
 * Whether a role has a drafts grid: the Manager and the Head (11-screens-and-ux.md, Screens:
 * "Order list, with the drafts grid … drafts for Manager and Head"; Order list layout 3). The
 * Principal and Finance make no drafts, so their list of drafts is refused (plan of 2.5a,
 * decided item 9, Look first).
 */
export function seesDraftsGrid(role: Role): boolean {
  return role === "HEAD" || role === "MANAGER";
}

/**
 * A ticked draft as the server last answered it (plan of 2.5b, decided item 1, Look first): money
 * and quantity as text (plan of 2.5a, decided item 23), never a value still being typed.
 */
export type TickedDraft = {
  quantity: string | null;
  /** Whole so'm as decimal text, or null while no price is given. */
  price: string | null;
  /** Each extra cost in whole so'm as decimal text. */
  extras: readonly string[];
  paymentType: PaymentType;
};

export type TickedDraftsTotals = {
  /** How many drafts are ticked (11 Order list layout 4: the count beside the totals). */
  count: number;
  /** The sums of the drafts that have an order value (05, the totals under the list). */
  totals: OrdersTotals;
  /** Ticked drafts without a quantity or a price: no order value, so left out and counted. */
  withoutPrice: number;
};

const WHOLE_SOM_TEXT = /^[0-9]{1,19}$/;

/** Whole so'm text read with BigInt() only (CLAUDE.md rule 6), refused unless plain digits. */
function somOf(text: string): bigint {
  // BigInt() alone would read "" as 0 and accept spaces and "0x10".
  if (!WHOLE_SOM_TEXT.test(text)) throw new RangeError(`An amount is "${text}": not whole so'm`);
  return BigInt(text);
}

/**
 * The totals of the ticked drafts (05: "Under the list, the totals of the ticked orders: goods,
 * extra costs, grand total, and the grand total split by payment type"; 08: "The totals of a
 * group row or of ticked orders are the sums of the order values"). A draft without a quantity or
 * a price has no order value (plan of 2.5a, decided item 19): the whole draft, its extra costs
 * included, is left out and counted, so a sum never guesses (plan of 2.5b, decided item 1, Look
 * first; review of the plan, correction 2). The sums come from ordersTotals(), the one formula.
 */
export function tickedDraftsTotals(drafts: readonly TickedDraft[]): TickedDraftsTotals {
  const plans: OrderPlan[] = [];
  let withoutPrice = 0;
  for (const draft of drafts) {
    if (draft.quantity === null || draft.price === null) {
      withoutPrice += 1;
      continue;
    }
    plans.push({
      quantity: draft.quantity,
      price: somOf(draft.price),
      extras: draft.extras.map(somOf),
      paymentType: draft.paymentType,
    });
  }
  return { count: drafts.length, totals: ordersTotals(plans), withoutPrice };
}

/**
 * What the drafts grid offers on one row (plan of 2.5b, decided items 2 and 3, Look first;
 * permission review of 2.5b, Should fix 1): edit where the row is a DRAFT or RETURNED order and
 * `request.edit` allows (the owner or the Head, CREATE_REQUESTS on); delete only on the person's
 * own never-submitted draft (05 Drafts 3; 2.5a decided item 7). The same decide() the server asks;
 * the server refuses again.
 */
export function draftRowRights(
  actor: Actor,
  row: { branchId: string; ownerId: string; status: RequestStatus; number: string | null },
): { editable: boolean; deletable: boolean } {
  const editable =
    isDraftEditable(row.status) &&
    decide("request.edit", actor, { branchId: row.branchId, ownerId: row.ownerId }) === "allow";
  return { editable, deletable: editable && row.ownerId === actor.userId && isNeverSubmitted(row) };
}

/** One row of the drafts grid, as the state machine needs it. */
type GridRow = {
  id: string;
  branchId: string;
  ownerId: string;
  status: RequestStatus;
  number: string | null;
};

/** The moves the state machine offers on one grid row (developer-rules.md rule 2). */
function gridRowActions(actor: Actor, row: GridRow) {
  return allowedActions(actor, [
    {
      id: row.id,
      status: row.status,
      branchId: row.branchId,
      ownerId: row.ownerId,
      numbered: row.number !== null,
      // Facts no Submit reads: who created the order changes where it goes, not whether it may.
      createdByHead: false,
      buyingFinished: false,
      exactMatch: false,
      ownerClosesAlone: false,
      readyToClose: false,
    },
  ]);
}

/**
 * Whether the grid offers Submit on one row (05 Drafts 4 and 5; plan of 2.7): the state machine
 * offers SUBMIT (a DRAFT, the owner or the Head, CREATE_REQUESTS on; developer-rules.md rule 2). A
 * taken-back draft is submitted the same way and keeps its number and revision (plan of 2.11,
 * decided item 1, Look first). The Submit button is shown when every ticked row answers true; the
 * server asks again.
 */
export function draftSubmittable(actor: Actor, row: GridRow): boolean {
  return gridRowActions(actor, row).includes("SUBMIT");
}

/**
 * Whether the grid offers Submit again on one row (05 Drafts 5; 06 Allowed moves: Sent back): the
 * state machine offers SUBMIT_AGAIN, the owner's only, the Head on his own orders only (decisions
 * 2.3 item 5; plan of 2.11, review Must fix 1). Never a status test in the screen.
 */
export function draftSubmittableAgain(actor: Actor, row: GridRow): boolean {
  return gridRowActions(actor, row).includes("SUBMIT_AGAIN");
}

/** Whether the grid's add row offers a branch: active, and `request.create` allows (05 field 1). */
export function addsDraftsIn(actor: Actor, branch: { id: string; isActive: boolean }): boolean {
  return branch.isActive && decide("request.create", actor, { branchId: branch.id }) === "allow";
}
