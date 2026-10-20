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
 * entry, an approved write-off, a received transfer and an approved count by the Head only (plans
 * of 5.8, 5.11, 7.2 decided item 5 and 7.4 decided item 7, Look first). A Manager's right
 * RETURN_REVERSE and the branch are authorize()'s (`stock.return_reverse`), asked beside this.
 */
export function reverseAllows(
  actor: Pick<Actor, "userId" | "role">,
  document: { type: DocumentType; createdBy: string },
): boolean {
  if (
    document.type === "DIRECT_ENTRY" ||
    document.type === "WRITE_OFF" ||
    document.type === "TRANSFER" ||
    document.type === "COUNT"
  ) {
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

/**
 * The status receiving a transfer moves it to (09 Other documents, Transfer: "the transfer shows 'In
 * transit'" until "The receiving Manager enters what really arrived"; 00-definitions, Transfer;
 * plan of 7.2): from IN_TRANSIT to RECEIVED; from any other status no move (null), so a second
 * receipt is refused. The one place for this move (developer-rules.md rule 2): the receive action
 * asks it under the lock, the transfer's page asks it for its form. Who receives is the permission
 * `stock.receive_transfer` on the receiving branch.
 */
export function transferReceiveMove(
  status: DocumentStatus,
): Extract<DocumentStatus, "RECEIVED"> | null {
  return status === "IN_TRANSIT" ? "RECEIVED" : null;
}

/**
 * What is wrong with a typed received quantity (09 Other documents, Transfer: "The receiving
 * Manager enters what really arrived"; edge case "Half a piece"; plan of 7.2, decided item 4, Look
 * first): 0 is allowed (nothing of the line arrived); otherwise the quantity rules of ./drafts.ts
 * by the measure; more than was sent is `aboveSent`, since an excess would make stock out of
 * nothing. The form asks this as it types; the action asks it again under the lock, and the
 * database refuses a received quantity above the line's (`stock_document_lines_received_qty_check`).
 */
export function receivedQuantityRefusal(
  text: string | null | undefined,
  allowsDecimals: boolean,
  sent: string,
): QuantityRefusal | "aboveSent" | null {
  const typed = (text ?? "").trim();
  if (/^0+(\.0+)?$/.test(typed)) return null;
  const refusal = quantityRefusal(typed, allowsDecimals);
  if (refusal) return refusal;
  return new Stock(typed).gt(new Stock(sent)) ? "aboveSent" : null;
}

/**
 * What did not arrive of a transfer line: the quantity sent less the quantity received, as
 * numeric(14,3) text, "0" when all arrived (09 Other documents, Transfer: "Any shortage"). The
 * one formula of the short quantity: transferReceipt(), the receive form and the transfer's page
 * read it. `receivedQty` must be 0 up to `qty`: RangeError otherwise.
 */
export function transferShort(qty: string, receivedQty: string): string {
  if (!QUANTITY.test(qty) || !QUANTITY.test(receivedQty)) {
    throw new RangeError(`A received line of "${receivedQty}" of "${qty}"`);
  }
  const short = new Stock(qty).minus(new Stock(receivedQty));
  if (short.isNegative()) throw new RangeError(`A received line of "${receivedQty}" of "${qty}"`);
  return short.toFixed();
}

/**
 * Whether counted quantities may be typed on a count of this status (09 Other documents, Stock
 * count: "The Manager starts a count … and types the counted quantities"; plan of 7.3, decided
 * item 1, Look first): only while it waits (PENDING_APPROVAL, its status from the start); once the
 * Head decides it (7.4), no more. The save action asks it under the lock, the count's page asks it
 * for its form. Who types is the permission `stock.start_count` on the count's branch.
 */
export function countTypingAllowed(status: DocumentStatus): boolean {
  return status === "PENDING_APPROVAL";
}

/**
 * What is wrong with a typed counted quantity (09 Other documents, Stock count; edge case "Half a
 * piece"): 0 is allowed (the item is not there); otherwise the quantity rules of ./drafts.ts by the
 * measure. The form asks this as it types; the save action asks it again.
 */
export function countedQuantityRefusal(
  text: string | null | undefined,
  allowsDecimals: boolean,
): QuantityRefusal | null {
  if (/^0+(\.0+)?$/.test((text ?? "").trim())) return null;
  return quantityRefusal(text, allowsDecimals);
}

/**
 * The difference of one count line: the counted quantity minus the stock at the start, signed
 * numeric(14,3) text ("-2", "0.5", "0"); null while the line is not counted (09 Other documents,
 * Stock count: "The system shows the differences"; plan of 7.3, decided item 2, Look first). The
 * one formula of a count's difference: the count's page, its form and 7.4's correction read it.
 */
export function countDifference(stockAtStart: string, counted: string | null): string | null {
  if (counted === null) return null;
  if (!QUANTITY.test(stockAtStart) || !QUANTITY.test(counted)) {
    throw new RangeError(`A count line of "${counted}" against "${stockAtStart}"`);
  }
  return new Stock(counted).minus(new Stock(stockAtStart)).toFixed();
}

/**
 * Whether a count is complete, every line counted: what makes it "asked" of the Head (09 Other
 * documents, Stock count: "types the counted quantities … the Head approves them"; plan of 7.4,
 * decided item 1, Look first). The approval, the notice to the Heads and the Head's home list read
 * it; typing stays open while the count waits (countTypingAllowed()).
 */
export function countComplete(counted: readonly (string | null)[]): boolean {
  return counted.length > 0 && counted.every((qty) => qty !== null);
}

/**
 * The status the Head's decision moves a count to (09 Other documents, Stock count: "the Head
 * approves them as corrections"; plan of 7.4, decided items 1 and 6, Look first): from
 * PENDING_APPROVAL, APPROVE to POSTED only when the count is complete, REFUSE to REJECTED at any
 * time; from any other status no move (null), so a second decision is refused. The one place for
 * these moves (developer-rules.md rule 2): the decision action asks it under the lock, the count's
 * page asks it for its buttons. An approval that finds a moved item posts nothing and sends the
 * count back instead (countLineMoved()); its status then stays PENDING_APPROVAL.
 */
export function countDecisionMove(
  status: DocumentStatus,
  outcome: WriteOffOutcome,
  complete: boolean,
): Extract<DocumentStatus, "POSTED" | "REJECTED"> | null {
  if (status !== "PENDING_APPROVAL") return null;
  if (outcome === "REFUSE") return "REJECTED";
  return complete ? "POSTED" : null;
}

/**
 * Whether the counted quantities the Head was shown are the ones held now (plan of 7.4, decided
 * item 2, Look first): `seen` names every line of the count once, each with the same quantity
 * ("8" and "8.000" are the same). Typing stays open while a count waits, so an approval that does
 * not match is refused rather than posting quantities nobody showed the Head.
 */
export function countSeenMatches(
  held: readonly { id: string; countedQty: string | null }[],
  seen: readonly { lineId: string; countedQty: string }[],
): boolean {
  const shown = new Map(seen.map((line) => [line.lineId, line.countedQty.trim()]));
  if (shown.size !== seen.length || shown.size !== held.length) return false;
  return held.every((line) => {
    const qty = shown.get(line.id);
    if (qty === undefined || line.countedQty === null || !QUANTITY.test(qty)) return false;
    return new Stock(qty).eq(new Stock(line.countedQty));
  });
}

/**
 * Whether an item of a count moved after its start (09 Other documents, Stock count: "If an item
 * moved between the start of the count and the approval, the system asks the Manager to count that
 * item again"; progress 7.3: by `seq`, never by time): its newest movement in the count's branch now
 * is later than the newest one at the start (`startSeq`, null when it had none).
 */
export function countLineMoved(startSeq: bigint | null, newestSeq: bigint | null): boolean {
  if (newestSeq === null) return false;
  return startSeq === null || newestSeq > startSeq;
}

/**
 * The CORRECTION one approved count line writes (09 Movement types: "Correction after a stock
 * count | Up or down"; plan of 7.4, decided items 3 and 8): its difference (countDifference(), the
 * one formula) at the average of the moment; null when the difference is 0, since a movement is
 * never 0. The line must be counted: RangeError otherwise. A line that adds stock to a stock at
 * start of 0 carries `lastCost` (lastCost() of ./stock.ts) as its `emptyCost`, so it comes in at
 * the subtype's last cost (09 Stock value, the count bullet; plan of 7.4b, decided items 1 and 2,
 * Look first); a caller that only asks whether the line moves leaves `lastCost` out.
 */
export function countCorrection(
  stockAtStart: string,
  counted: string | null,
  lastCost?: bigint,
): StockMovement | null {
  const difference = countDifference(stockAtStart, counted);
  if (difference === null) throw new RangeError("An approved count line that is not counted");
  const moved = new Stock(difference);
  if (moved.isZero()) return null;
  const correction: StockMovement = { type: "CORRECTION", qtyDelta: difference, unitCost: null };
  if (lastCost !== undefined && moved.isPositive() && new Stock(stockAtStart).isZero()) {
    return { ...correction, emptyCost: lastCost };
  }
  return correction;
}

/** What receiving one transfer line writes (transferReceipt()). */
export type TransferReceipt = {
  /** The receiving branch's TRANSFER_IN; null when nothing arrived. */
  received: StockMovement | null;
  /** The quantity that did not arrive, numeric(14,3) text; null when all arrived. */
  short: string | null;
  /** The sending branch's TRANSFER_IN of the short quantity; null when all arrived. */
  back: StockMovement | null;
};

/**
 * The movements of one received transfer line (09 Stock value, second bullet: "A transfer arrives
 * at the receiver with the sender's average"; Other documents, Transfer: "Any shortage becomes a
 * write-off request 'Lost in transfer' on the sending branch"; plan of 7.2, decided item 1, Look
 * first). `sentCost` is the unit cost of the line's TRANSFER_OUT, the sender's average when it
 * left. What arrived comes in at the receiver at that cost; the short quantity comes back into the
 * sender's stock at the same cost, so that the write-off "Lost in transfer" takes it out only when
 * the Head approves. `receivedQty` must be 0 up to `qty` (receivedQuantityRefusal()): RangeError
 * otherwise.
 */
export function transferReceipt(line: {
  qty: string;
  receivedQty: string;
  sentCost: bigint;
}): TransferReceipt {
  if (line.sentCost < 0n || new Stock(line.qty).isZero()) {
    throw new RangeError(`A received line of "${line.receivedQty}" of "${line.qty}"`);
  }
  const short = new Stock(transferShort(line.qty, line.receivedQty));
  const received = new Stock(line.receivedQty);
  return {
    received: received.isZero()
      ? null
      : { type: "TRANSFER_IN", qtyDelta: received.toFixed(), unitCost: line.sentCost },
    short: short.isZero() ? null : short.toFixed(),
    back: short.isZero()
      ? null
      : { type: "TRANSFER_IN", qtyDelta: short.toFixed(), unitCost: line.sentCost },
  };
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
 * the line's cost, as `emptyCost`), a direct entry comes in at the line's own cost, a transfer leaves the sender at its average. A count
 * line writes countCorrection()'s, which postLines() asks (plan of 7.4, decided item 13); a
 * transfer's receipt writes transferReceipt()'s. A line that does not fit is a
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
      throw new RangeError("A count line's movement is countCorrection()'s");
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

/** Rows on one page of the documents list (11-screens-and-ux.md rule 8; plan of 5.12). */
export const DOCUMENTS_PAGE_SIZE = 25;

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
