// The warehouse documents (09-warehouse.md, Movement types; Issue to a department; Other
// documents; 14-data-model.md, stock_documents and stock_document_lines). Pure: the helpers of
// src/server/stock-documents.ts ask this file for a document's number, the movement each posted
// line writes and the movement that reverses it; the arithmetic of a movement stays in ./stock.ts
// (developer-rules.md rule 1).

import Decimal from "decimal.js";

import { type QuantityRefusal, quantityRefusal } from "./drafts";
import { orderNumber } from "./order-numbers";
import { QUANTITY } from "./order-totals";
import type { Actor } from "./permissions";
import type { StockMovement } from "./stock";

/** 14-data-model.md, stock_documents.type, in its order. */
export const DOCUMENT_TYPES = [
  "ISSUE",
  "RETURN",
  "TRANSFER",
  "WRITE_OFF",
  "COUNT",
  "DIRECT_ENTRY",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** 14-data-model.md, stock_documents.status, in its order. */
export const DOCUMENT_STATUSES = [
  "PENDING_APPROVAL",
  "POSTED",
  "IN_TRANSIT",
  "RECEIVED",
  "REJECTED",
  "REVERSED",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/**
 * The reasons of a direct entry (09 Direct entry: "stock we already had, gift or donation,
 * other") and of a write-off (Decided ahead, question 13), one enum checked by type in the
 * database (plan of 5.1, decided item 3, Look first).
 */
export const DIRECT_ENTRY_REASONS = ["EXISTING_STOCK", "GIFT", "OTHER"] as const;
export const WRITE_OFF_REASONS = [
  "DAMAGED",
  "EXPIRED",
  "LOST",
  "RETURNED_TO_SUPPLIER",
  "LOST_IN_TRANSFER",
  "OTHER",
] as const;
export const DOCUMENT_REASONS = [
  "EXISTING_STOCK",
  "GIFT",
  "DAMAGED",
  "EXPIRED",
  "LOST",
  "RETURNED_TO_SUPPLIER",
  "LOST_IN_TRANSFER",
  "OTHER",
] as const;
export type DocumentReason = (typeof DOCUMENT_REASONS)[number];

/** The `number_counters` scope and number prefix of each type (14, number_counters; 09). */
export const DOCUMENT_PREFIX = {
  ISSUE: "ISS",
  RETURN: "RET",
  TRANSFER: "TRF",
  WRITE_OFF: "WOF",
  COUNT: "CNT",
  DIRECT_ENTRY: "ENT",
} as const satisfies Record<DocumentType, string>;

/**
 * The statuses whose stock moved for good, the only ones a reverse undoes (plan of 5.1, decided
 * item 8). Who may reverse which type is the reverse action's (Decided ahead, question 19).
 */
export const REVERSIBLE_STATUSES: readonly DocumentStatus[] = ["POSTED", "RECEIVED"];

/**
 * Whether the actor may reverse a document of this type and maker (09 Issue to a department 3: "A
 * posted issue can be reversed by its creator or the Head"; Decided ahead, question 19; plan of
 * 5.7, decided item 1, Look first): an issue and a return by their creator or the Head; a direct
 * entry and an approved write-off by the Head only (plans of 5.8 and 5.11). Every other type is no
 * until its task adds it, the Head only (7.2, 7.4). A Manager's right RETURN_REVERSE and the
 * branch are authorize()'s (`stock.return_reverse`), asked beside this.
 */
export function reverseAllows(
  actor: Pick<Actor, "userId" | "role">,
  document: { type: DocumentType; createdBy: string },
): boolean {
  if (document.type === "DIRECT_ENTRY" || document.type === "WRITE_OFF") {
    return actor.role === "HEAD";
  }
  if (document.type !== "ISSUE" && document.type !== "RETURN") return false;
  if (actor.role === "HEAD") return true;
  return actor.role === "MANAGER" && document.createdBy === actor.userId;
}

export type DirectEntryReason = (typeof DIRECT_ENTRY_REASONS)[number];

/**
 * What is wrong with a direct entry's comment for its reason (09 Direct entry, Reason: "'Other'
 * needs a comment"; Comment: "Optional, except for 'Other'"): `required` when the reason is OTHER
 * and the comment is empty or blank; null otherwise. The form and the action both ask this.
 */
export function directEntryCommentRefusal(
  reason: DirectEntryReason,
  comment: string | null,
): "required" | null {
  return reason === "OTHER" && (comment ?? "").trim() === "" ? "required" : null;
}

export type WriteOffReason = (typeof WRITE_OFF_REASONS)[number];

/**
 * What is wrong with a write-off's comment (09 Other documents, Write-off: "a reason from a fixed
 * list plus a comment"; Decided ahead, question 13: "Every write-off still has its comment"):
 * `required` when it is empty or blank, whatever the reason. The form and the action both ask this.
 */
export function writeOffCommentRefusal(comment: string | null): "required" | null {
  return (comment ?? "").trim() === "" ? "required" : null;
}

/** The Head's two answers to a waiting write-off (09 Other documents, Write-off). */
export const WRITE_OFF_OUTCOMES = ["APPROVE", "REFUSE"] as const;
export type WriteOffOutcome = (typeof WRITE_OFF_OUTCOMES)[number];

/**
 * The status a write-off's decision moves it to (09 Other documents, Write-off: "Stock changes
 * only after the Head approves"; plan of 5.11, decided item 4, Look first): from PENDING_APPROVAL,
 * APPROVE to POSTED and REFUSE to REJECTED; from any other status no move (null), so a second
 * decision is refused. The one place for these moves (developer-rules.md rule 2): the decision
 * action asks it under the lock, the write-off's page asks it for its buttons. Who decides (the
 * Head) is the permission `stock.approve_write_off`.
 */
export function writeOffDecisionMove(
  status: DocumentStatus,
  outcome: WriteOffOutcome,
): Extract<DocumentStatus, "POSTED" | "REJECTED"> | null {
  if (status !== "PENDING_APPROVAL") return null;
  return outcome === "APPROVE" ? "POSTED" : "REJECTED";
}

/** A subtype of a direct-entry line as it was read under its lock. */
export type DirectEntrySubtype = {
  isActive: boolean;
  productActive: boolean;
  type: "GOODS" | "SERVICE";
  allowsDecimals: boolean;
};

/**
 * What is wrong with one direct-entry line's subtype and quantity (09 Direct entry, Lines; plan of
 * 5.8, decided item 7; edge case "Half a piece"): an unknown subtype or a service, which never
 * enters stock (A7), is `notAllowed` on `variantId`; an inactive subtype or product `inactive`
 * (04 rule 2); then the quantity rules of ./drafts.ts by the measure. The form's action and the
 * Excel import (plan of 5.9) both ask this of the rows they locked; each reads its cost itself.
 */
export function directEntryLineRefusal(
  subtype: DirectEntrySubtype | undefined,
  qty: string,
): { field: "variantId" | "qty"; kind: "notAllowed" | "inactive" | QuantityRefusal } | null {
  if (!subtype || subtype.type !== "GOODS") return { field: "variantId", kind: "notAllowed" };
  if (!subtype.isActive || !subtype.productActive) return { field: "variantId", kind: "inactive" };
  const refusal = quantityRefusal(qty, subtype.allowsDecimals);
  return refusal ? { field: "qty", kind: refusal } : null;
}

/**
 * The number of a document: `documentNumber("ISSUE", "CHL", 2026, 31)` is `ISS-CHL-26-0031`
 * (09 Issue 2). The branch code, year and counter are written as an order number's
 * (./order-numbers.ts), so one formula makes both.
 */
export function documentNumber(type: DocumentType, code: string, year: number, value: number) {
  return `${DOCUMENT_PREFIX[type]}-${orderNumber(code, year, value)}`;
}

/**
 * One line of a document as it is posted: its quantity and its `unit_cost`: on a direct entry the
 * line's own cost; on a return the cost it comes in at if the stock is empty (plan of 5.6, decided
 * item 1, Look first), not the cost it entered at, which is its movement's; on the others none.
 */
export type PostedLine = { qty: string; unitCost: bigint | null };

/**
 * The movement a posted line writes (09 Movement types; Stock value; decisions 3.1 item 2):
 * an issue and a write-off leave at the average, a return comes in at it (into an empty stock at
 * the line's cost, as `emptyCost`), a direct entry comes in at the line's own cost, a transfer leaves the sender at its average. The movement of a
 * count line and of a transfer's receipt are 7.4's and 7.2's. A line that does not fit is a
 * mistake of the caller: RangeError.
 */
export function lineMovement(type: DocumentType, line: PostedLine): StockMovement {
  if (!QUANTITY.test(line.qty) || /^0+(\.0+)?$/.test(line.qty)) {
    throw new RangeError(`A posted line of "${line.qty}"`);
  }
  const costed = type === "DIRECT_ENTRY" || type === "RETURN";
  if (costed !== (line.unitCost !== null)) {
    throw new RangeError(`A ${type} line ${costed ? "without" : "with"} a unit cost`);
  }
  switch (type) {
    case "ISSUE":
      return { type: "ISSUE", qtyDelta: `-${line.qty}`, unitCost: null };
    case "RETURN":
      return { type: "RETURN", qtyDelta: line.qty, unitCost: null, emptyCost: line.unitCost! };
    case "WRITE_OFF":
      return { type: "WRITE_OFF", qtyDelta: `-${line.qty}`, unitCost: null };
    case "TRANSFER":
      return { type: "TRANSFER_OUT", qtyDelta: `-${line.qty}`, unitCost: null };
    case "DIRECT_ENTRY":
      return { type: "DIRECT_ENTRY", qtyDelta: line.qty, unitCost: line.unitCost };
    case "COUNT":
      throw new RangeError("A count line's movement is 7.4's");
  }
}

/**
 * The movement that undoes one (09 Movement types, last paragraph: "writes the opposite
 * movement"): the opposite quantity at the reversed movement's own unit cost, whatever its type,
 * so the value it put in or took out is given back exactly (plan of 5.1, decided item 2, Look
 * first; the rule 09 Stock value gives a cancelled purchase).
 */
export function reversalOf(movement: { qtyDelta: string; unitCost: bigint }): StockMovement {
  const qtyDelta = movement.qtyDelta.startsWith("-")
    ? movement.qtyDelta.slice(1)
    : `-${movement.qtyDelta}`;
  return { type: "REVERSAL", qtyDelta, unitCost: movement.unitCost };
}

/**
 * At most this many lines on one issue, return or write-off (plan of 5.4, decided item 7; 5.6,
 * item 10; 5.11, item 9).
 */
export const DOCUMENT_LINES_MAX = 100;

/** A stock as stored, compared exactly (numeric(14,3) text, 0 or more). */
const Stock = Decimal.clone({ precision: 64, rounding: Decimal.ROUND_HALF_UP });

/**
 * What is wrong with a typed issue quantity (09 Issue to a department 1: "Quantity cannot be more
 * than the stock"; edge case "Half a piece"): the quantity rules of ./drafts.ts, then more than
 * the stock shown (`stockShort`). Equal to the stock is allowed. The screen asks this as it types;
 * the server's own check is the ledger's, under the lock (src/server/stock-ledger.ts).
 */
export function issueQuantityRefusal(
  text: string | null | undefined,
  allowsDecimals: boolean,
  inStock: string,
): QuantityRefusal | "stockShort" | null {
  const refusal = quantityRefusal(text, allowsDecimals);
  if (refusal) return refusal;
  return new Stock((text ?? "").trim()).gt(new Stock(inStock)) ? "stockShort" : null;
}

/**
 * Whether a returned quantity is more than the department's net received amount of that subtype
 * (09 Other documents, Return: "Returning more than that department ever received shows a warning
 * and needs a comment"; plan of 5.6, decided item 2, Look first). Equal is not over. The amount
 * received is `departmentReceived()`'s of src/server/department-received.ts, the one reader both
 * the screen and the server use; below 0 when the department returned more than it got.
 */
export function overReturn(qty: string, received: string): boolean {
  return new Stock(qty.trim()).gt(new Stock(received));
}

/** Whether the department holds some of an item: its net received amount is above 0. */
export function departmentHolds(received: string): boolean {
  return new Stock(received).gt(0);
}
