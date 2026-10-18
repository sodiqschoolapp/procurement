// The stock ledger's arithmetic (09-warehouse.md, first paragraph; Movement types; Stock value).
// One movement changes a branch's quantity of one subtype and its moving average cost; this file
// says how, and src/server/stock-ledger.ts (postMovement) is the one writer that asks it
// (developer-rules.md rule 1: "average cost" is a pure function in src/domain/).
//
// A quantity enters and leaves as the decimal text of numeric(14,3); money as whole so'm in
// bigint. Both meet only inside a private decimal.js clone, and the average is rounded half up to
// whole so'm once per change (developer-rules.md rule 6; plan of 3.1, decided item 1, Look first).

import Decimal from "decimal.js";

import { QUANTITY } from "./order-totals";

/** The movement types of 14-data-model.md, stock_movements.type, in its order. */
export const MOVEMENT_TYPES = [
  "RECEIPT",
  "ISSUE",
  "RETURN",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "WRITE_OFF",
  "CORRECTION",
  "DIRECT_ENTRY",
  "REVERSAL",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/**
 * How each type moves stock and meets the average (plan of 3.1, decided item 2, Look first).
 * `direction`: the Stock column of 09 Movement types. `cost`: "priced" enters the average at the
 * movement's own unit cost; "average" moves at the average of that moment and leaves it as it is;
 * "either" lets the caller say which.
 * - RECEIPT: 09 Stock value, "On a receipt". DIRECT_ENTRY: like a receipt (Decided ahead, question
 *   12). TRANSFER_IN: at the sender's average (09 Stock value, second bullet).
 * - ISSUE, WRITE_OFF, TRANSFER_OUT: "use the average at that moment" (09 Stock value).
 * - RETURN: at the current average, which it leaves unchanged (Decided ahead, question 11); into
 *   an empty stock at its `emptyCost` (plan of 5.6, decided item 1, Look first).
 * - CORRECTION: a stock count's difference has no price of its own.
 * - REVERSAL: a cancelled purchase removes its quantity at its own price (09 Stock value, third
 *   bullet); a document's reversal moves the opposite quantity at the reversed movement's own
 *   cost (reversalOf() of ./stock-documents.ts; plan of 5.1, decided item 2, Look first).
 */
export const MOVEMENT_RULES = {
  RECEIPT: { direction: "in", cost: "priced" },
  ISSUE: { direction: "out", cost: "average" },
  RETURN: { direction: "in", cost: "average" },
  TRANSFER_OUT: { direction: "out", cost: "average" },
  TRANSFER_IN: { direction: "in", cost: "priced" },
  WRITE_OFF: { direction: "out", cost: "average" },
  CORRECTION: { direction: "either", cost: "average" },
  DIRECT_ENTRY: { direction: "in", cost: "priced" },
  REVERSAL: { direction: "either", cost: "either" },
} as const satisfies Record<
  MovementType,
  { direction: "in" | "out" | "either"; cost: "priced" | "average" | "either" }
>;

/** A branch's stock of one subtype: its quantity as numeric(14,3) text and its average cost. */
export type StockBalance = { qty: string; avgCost: bigint };

/**
 * One movement: `qtyDelta` is signed numeric(14,3) text ("5", "-2.5"), never 0; `unitCost` is
 * whole so'm of 0 or more for a priced movement (an item can be free: edge-cases/
 * purchasing-and-money.md, "The item was free"), `null` for one at the average. `emptyCost`, on a
 * RETURN only: the cost it comes in at when the stock under the lock is 0 (plan of 5.6, decided
 * item 1, Look first).
 */
export type StockMovement = {
  type: MovementType;
  qtyDelta: string;
  unitCost: bigint | null;
  emptyCost?: bigint;
};

export type NextBalance =
  | {
      ok: true;
      /** The quantity after the movement, the movement's `balance_after`. */
      qty: string;
      avgCost: bigint;
      /** The unit cost the movement is written with: its own price, or the average it moved at. */
      unitCost: bigint;
    }
  /** The movement would take the stock below 0 (09, first paragraph); `available` is the stock. */
  | { ok: false; available: string };

/**
 * Our own decimal.js, as in ./order-totals.ts: 64 significant digits, rounding half up, safe
 * from any other code's settings.
 */
const Exact = Decimal.clone({ precision: 64, rounding: Decimal.ROUND_HALF_UP });

const SIGNED_QUANTITY = /^-?[0-9]{1,11}(\.[0-9]{1,3})?$/;

function stockOf(text: string): Decimal {
  if (!QUANTITY.test(text)) throw new RangeError(`A stock is "${text}": not numeric(14,3)`);
  return new Exact(text);
}

function wholeSom(value: Decimal): bigint {
  return BigInt(value.toDecimalPlaces(0, Exact.ROUND_HALF_UP).toFixed(0));
}

/**
 * The stock and average after one movement (09 Stock value), or a refusal when it would go below
 * 0 (09, first paragraph). A movement that does not fit its type in MOVEMENT_RULES is a mistake
 * of the caller: RangeError.
 * - Priced in: (old quantity × old average + quantity × price) ÷ new quantity.
 * - Priced out (a cancelled purchase): (old quantity × old average − quantity × price) ÷ new
 *   quantity, never below 0 (plan of 3.1, decided item 3, Look first).
 * - At the average: the average stays.
 * - A return into a stock of 0 (quantity 0, not only an average of 0): priced at its `emptyCost`,
 *   which becomes the average. Into free stock (above 0 at an average of 0) it comes in at the
 *   average of 0, as Decided ahead 11 says (plan of 5.6, decided item 1 and correction 3).
 * - Whatever the movement, a stock of 0 has the average 0 (decided item 4, Look first).
 */
export function nextBalance(balance: StockBalance, movement: StockMovement): NextBalance {
  const rule = MOVEMENT_RULES[movement.type];
  if (!SIGNED_QUANTITY.test(movement.qtyDelta)) {
    throw new RangeError(`A movement's quantity is "${movement.qtyDelta}": not numeric(14,3)`);
  }
  const delta = new Exact(movement.qtyDelta);
  if (delta.isZero()) throw new RangeError("A movement's quantity is 0");
  if (rule.direction !== "either" && delta.isPositive() !== (rule.direction === "in")) {
    throw new RangeError(`A ${movement.type} of ${movement.qtyDelta}: the wrong direction`);
  }
  const priced = movement.unitCost !== null;
  if (rule.cost !== "either" && priced !== (rule.cost === "priced")) {
    throw new RangeError(`A ${movement.type} ${priced ? "with" : "without"} a unit cost`);
  }
  if (movement.unitCost !== null && movement.unitCost < 0n) {
    throw new RangeError(`A unit cost of ${String(movement.unitCost)}: below 0`);
  }
  if (movement.emptyCost !== undefined) {
    if (movement.type !== "RETURN" || priced || movement.emptyCost < 0n) {
      throw new RangeError(`A ${movement.type} with an empty-stock cost`);
    }
  }
  if (balance.avgCost < 0n) throw new RangeError(`An average of ${String(balance.avgCost)}`);

  const held = stockOf(balance.qty);
  const after = held.plus(delta);
  if (after.isNegative()) return { ok: false, available: held.toFixed() };
  const qty = after.toFixed();
  if (!QUANTITY.test(qty)) {
    throw new RangeError(`A stock of ${qty}: past numeric(14,3)`);
  }

  if (movement.emptyCost !== undefined && held.isZero()) {
    return { ok: true, qty, avgCost: movement.emptyCost, unitCost: movement.emptyCost };
  }
  if (movement.unitCost === null) {
    return {
      ok: true,
      qty,
      avgCost: after.isZero() ? 0n : balance.avgCost,
      unitCost: balance.avgCost,
    };
  }
  if (after.isZero()) return { ok: true, qty, avgCost: 0n, unitCost: movement.unitCost };
  const value = held
    .times(balance.avgCost.toString())
    .plus(delta.times(movement.unitCost.toString()));
  const avgCost = value.isNegative() ? 0n : wholeSom(value.dividedBy(after));
  return { ok: true, qty, avgCost, unitCost: movement.unitCost };
}

/**
 * A stock line's value: quantity × moving average cost, rounded half up once to whole so'm (09
 * Stock value; 08 Rounding; plan of 5.2, decided item 1, Look first). The one formula of the value
 * Stock on hand shows per row; the reports of 6.x reuse it for their rows.
 */
export function stockValue(qty: string, avgCost: bigint): bigint {
  if (avgCost < 0n) throw new RangeError(`An average of ${String(avgCost)}`);
  return wholeSom(stockOf(qty).times(avgCost.toString()));
}

/** Stock on hand shows 25 rows per page (11-screens-and-ux.md rule 8). */
export const STOCK_PAGE_SIZE = 25;

/** The item card shows 50 movements per page (developer-rules.md rule 12; plan of 5.3, item 6). */
export const ITEM_CARD_PAGE_SIZE = 50;

/**
 * Whether an item is "Low": its quantity at or below its minimum (09 Low stock: "falls to its
 * minimum or below"; 00-definitions, Minimum stock: "No minimum means never low"; plan of 5.10,
 * decided item 1, Look first). `minimum` null: no minimum.
 */
export function isLow(qty: string, minimum: string | null): boolean {
  if (minimum === null) return false;
  return stockOf(qty).lessThanOrEqualTo(stockOf(minimum));
}

/**
 * What a change of stock or of the minimum does to "Item reached its minimum stock" (10
 * Notifications: "once per item until restocked"; plan of 5.10, decided item 2, Look first):
 * Low and not yet told, "send"; no longer Low with the mark set, "clear" (restocked, or the
 * minimum lowered or removed); otherwise nothing.
 */
export function minimumStep(
  qty: string,
  minimum: string | null,
  notified: boolean,
): "send" | "clear" | "none" {
  const low = isLow(qty, minimum);
  if (low) return notified ? "none" : "send";
  return notified ? "clear" : "none";
}
