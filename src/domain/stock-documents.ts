// The warehouse documents (09-warehouse.md, Movement types; Issue to a department; Other
// documents; 14-data-model.md, stock_documents and stock_document_lines). Pure: the helpers of
// src/server/stock-documents.ts ask this file for a document's number, the movement each posted
// line writes and the movement that reverses it; the arithmetic of a movement stays in ./stock.ts
// (developer-rules.md rule 1).

import Decimal from "decimal.js";

import { type QuantityRefusal, quantityRefusal } from "./drafts";
import { orderNumber } from "./order-numbers";
import { QUANTITY } from "./order-totals";
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
 * The number of a document: `documentNumber("ISSUE", "CHL", 2026, 31)` is `ISS-CHL-26-0031`
 * (09 Issue 2). The branch code, year and counter are written as an order number's
 * (./order-numbers.ts), so one formula makes both.
 */
export function documentNumber(type: DocumentType, code: string, year: number, value: number) {
  return `${DOCUMENT_PREFIX[type]}-${orderNumber(code, year, value)}`;
}

/** One line of a document as it is posted: its quantity and, on a direct entry, its cost. */
export type PostedLine = { qty: string; unitCost: bigint | null };

/**
 * The movement a posted line writes (09 Movement types; Stock value; decisions 3.1 item 2):
 * an issue and a write-off leave at the average, a return comes in at it, a direct entry comes
 * in at the line's own cost, a transfer leaves the sender at its average. The movement of a
 * count line and of a transfer's receipt are 7.4's and 7.2's. A line that does not fit is a
 * mistake of the caller: RangeError.
 */
export function lineMovement(type: DocumentType, line: PostedLine): StockMovement {
  if (!QUANTITY.test(line.qty) || /^0+(\.0+)?$/.test(line.qty)) {
    throw new RangeError(`A posted line of "${line.qty}"`);
  }
  const priced = type === "DIRECT_ENTRY";
  if (priced !== (line.unitCost !== null)) {
    throw new RangeError(`A ${type} line ${priced ? "without" : "with"} a unit cost`);
  }
  switch (type) {
    case "ISSUE":
      return { type: "ISSUE", qtyDelta: `-${line.qty}`, unitCost: null };
    case "RETURN":
      return { type: "RETURN", qtyDelta: line.qty, unitCost: null };
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

/** At most this many lines on one issue (plan of 5.4, decided item 7). */
export const ISSUE_LINES_MAX = 100;

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
