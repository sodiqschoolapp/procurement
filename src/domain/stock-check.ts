// The nightly stock check (build-plan 8.2; 14-data-model.md, Notes for the build, first bullet:
// "A nightly job recomputes it from the movements and reports any mismatch"). One branch's stock of
// one subtype is replayed from quantity 0 and average 0, movement by movement in `seq` order,
// through nextBalance() of ./stock.ts, the one formula that wrote it (developer-rules.md rule 1;
// plan of 8.2, decided item 2, Look first). The check corrects nothing: a balance changes only by
// a movement (developer-rules.md rule 7).

import Decimal from "decimal.js";

import { QUANTITY } from "./order-totals";
import {
  MOVEMENT_RULES,
  type MovementType,
  type StockBalance,
  type StockMovement,
  nextBalance,
} from "./stock";

/** A movement as `stock_movements` holds it: its type, signed quantity and the cost it was written with. */
export type StoredMovement = { type: MovementType; qtyDelta: string; unitCost: bigint };

/**
 * A stored movement back into the input nextBalance() took when it was posted:
 * - a type that moves at the average (MOVEMENT_RULES) without a cost: its stored cost is the
 *   average it moved at, which the replay reaches by itself;
 * - a RETURN also carries its stored cost as `emptyCost`, which nextBalance() uses only into a
 *   stock of 0, the one case it was posted with it (plan of 5.6, decided item 1);
 * - every other type at its stored cost: a priced type, and a REVERSAL, which is always posted
 *   priced (a cancelled purchase at its price, a document's reversal at the reversed movement's
 *   cost: reversalOf() of ./stock-documents.ts).
 */
export function replayedMovement(movement: StoredMovement): StockMovement {
  const { type, qtyDelta, unitCost } = movement;
  if (type === "RETURN") return { type, qtyDelta, unitCost: null, emptyCost: unitCost };
  if (MOVEMENT_RULES[type].cost === "average") return { type, qtyDelta, unitCost: null };
  return { type, qtyDelta, unitCost };
}

/** What the movements say the stock is, or that they would take it below 0 at one of them. */
export type Recomputed = { ok: true; qty: string; avgCost: bigint } | { ok: false };

/** The replay of one branch's movements of one subtype, given in `seq` order. */
export function recomputeBalance(movements: readonly StoredMovement[]): Recomputed {
  let balance: StockBalance = { qty: "0", avgCost: 0n };
  for (const movement of movements) {
    const next = nextBalance(balance, replayedMovement(movement));
    if (!next.ok) return { ok: false };
    balance = { qty: next.qty, avgCost: next.avgCost };
  }
  return { ok: true, ...balance };
}

/** A branch-and-subtype item whose `stock_balances` row is not what its movements say. */
export type StockMismatch = {
  /** The replayed stock, or "below_zero" when the movements would take it below 0. */
  expected: StockBalance | "below_zero";
  /** The stored row, or null when there is none. */
  found: StockBalance | null;
};

function sameQuantity(a: string, b: string): boolean {
  if (!QUANTITY.test(a) || !QUANTITY.test(b)) {
    throw new RangeError(`A stock of "${a}" or "${b}": not numeric(14,3)`);
  }
  // "100.000" as PostgreSQL gives it and "100" as the replay gives it are the same stock.
  return new Decimal(a).eq(b);
}

/**
 * The mismatch of one item, or null when its balance row is what its movements say. An item with
 * no movements expects no row, or a row of 0 at 0 (a stock minimum makes such a row).
 */
export function stockMismatch(
  movements: readonly StoredMovement[],
  found: StockBalance | null,
): StockMismatch | null {
  const recomputed = recomputeBalance(movements);
  if (!recomputed.ok) return { expected: "below_zero", found };
  const expected = { qty: recomputed.qty, avgCost: recomputed.avgCost };
  if (found === null) return movements.length === 0 ? null : { expected, found };
  const same = sameQuantity(found.qty, expected.qty) && found.avgCost === expected.avgCost;
  return same ? null : { expected, found };
}
