import { describe, expect, it } from "vitest";

import { type StockBalance, type StockMovement, nextBalance } from "./stock";
import { type StoredMovement, recomputeBalance, stockMismatch } from "./stock-check";

// build-plan 8.2: the nightly check recomputes stock_balances from the movements (14-data-model.md,
// Notes for the build, first bullet) through the formula that wrote them (09-warehouse.md, Stock
// value; plan of 8.2, decided item 2, Look first).

/** Posts movements as postMovement() does: each is stored with the cost nextBalance() gave it. */
function post(movements: StockMovement[]): { stored: StoredMovement[]; balance: StockBalance } {
  let balance: StockBalance = { qty: "0", avgCost: 0n };
  const stored: StoredMovement[] = [];
  for (const movement of movements) {
    const next = nextBalance(balance, movement);
    if (!next.ok) throw new Error("the fixture went below 0");
    stored.push({ type: movement.type, qtyDelta: movement.qtyDelta, unitCost: next.unitCost });
    balance = { qty: next.qty, avgCost: next.avgCost };
  }
  return { stored, balance };
}

describe("recomputeBalance replays what was posted (09 Stock value; decided item 2)", () => {
  it("the review's worked example: 14 at 1 286 after a return into 0 and a reversal", () => {
    const { stored, balance } = post([
      { type: "RECEIPT", qtyDelta: "10", unitCost: 1000n },
      { type: "ISSUE", qtyDelta: "-10", unitCost: null },
      { type: "RETURN", qtyDelta: "2", unitCost: null, emptyCost: 1000n },
      { type: "RECEIPT", qtyDelta: "2", unitCost: 3000n },
      { type: "REVERSAL", qtyDelta: "10", unitCost: 1000n },
    ]);
    expect(balance).toEqual({ qty: "14", avgCost: 1286n });
    expect(recomputeBalance(stored)).toEqual({ ok: true, qty: "14", avgCost: 1286n });
  });

  it("a return into stock above 0 at the average, its empty-stock cost unused", () => {
    const { stored, balance } = post([
      { type: "RECEIPT", qtyDelta: "4", unitCost: 2000n },
      { type: "RETURN", qtyDelta: "1", unitCost: null, emptyCost: 9000n },
    ]);
    expect(balance).toEqual({ qty: "5", avgCost: 2000n });
    expect(recomputeBalance(stored)).toEqual({ ok: true, ...balance });
  });

  it("a cancelled purchase's priced reversal clamps the average at 0 (decisions 3.1 item 3)", () => {
    const { stored, balance } = post([
      { type: "RECEIPT", qtyDelta: "5", unitCost: 100n },
      { type: "RECEIPT", qtyDelta: "5", unitCost: 5000n },
      { type: "REVERSAL", qtyDelta: "-5", unitCost: 9000n },
    ]);
    expect(balance).toEqual({ qty: "5", avgCost: 0n });
    expect(recomputeBalance(stored)).toEqual({ ok: true, ...balance });
  });

  it("stock taken to 0 resets the average, and a refill takes its new price (decided item 4 of 3.1)", () => {
    const { stored, balance } = post([
      { type: "RECEIPT", qtyDelta: "2.5", unitCost: 4000n },
      { type: "WRITE_OFF", qtyDelta: "-2.5", unitCost: null },
      { type: "DIRECT_ENTRY", qtyDelta: "1.25", unitCost: 7000n },
      { type: "TRANSFER_OUT", qtyDelta: "-0.25", unitCost: null },
      { type: "TRANSFER_IN", qtyDelta: "3", unitCost: 6000n },
    ]);
    expect(recomputeBalance(stored)).toEqual({ ok: true, ...balance });
    expect(balance.avgCost).toBe(6250n);
  });

  it("count corrections up and down at the average (plan of 7.4, decided item 13)", () => {
    const { stored, balance } = post([
      { type: "RECEIPT", qtyDelta: "10", unitCost: 1500n },
      { type: "CORRECTION", qtyDelta: "-3", unitCost: null },
      { type: "CORRECTION", qtyDelta: "1.5", unitCost: null },
    ]);
    expect(balance).toEqual({ qty: "8.5", avgCost: 1500n });
    expect(recomputeBalance(stored)).toEqual({ ok: true, ...balance });
  });

  it("movements that would go below 0 are a refusal, not a balance (09, first paragraph)", () => {
    expect(
      recomputeBalance([
        { type: "RECEIPT", qtyDelta: "1", unitCost: 100n },
        { type: "ISSUE", qtyDelta: "-2", unitCost: 100n },
      ]),
    ).toEqual({ ok: false });
  });
});

describe("stockMismatch (14-data-model.md, Notes for the build: reports any mismatch)", () => {
  const movements: StoredMovement[] = [
    { type: "RECEIPT", qtyDelta: "100", unitCost: 1200n },
    { type: "ISSUE", qtyDelta: "-0.5", unitCost: 1200n },
  ];

  it("the stored text of PostgreSQL equals the replay: 99.500 is 99.5", () => {
    expect(stockMismatch(movements, { qty: "99.500", avgCost: 1200n })).toBeNull();
  });

  it("a quantity 0.001 off is a mismatch", () => {
    expect(stockMismatch(movements, { qty: "99.501", avgCost: 1200n })).toEqual({
      expected: { qty: "99.5", avgCost: 1200n },
      found: { qty: "99.501", avgCost: 1200n },
    });
  });

  it("an average one so'm off is a mismatch", () => {
    expect(stockMismatch(movements, { qty: "99.500", avgCost: 1201n })).not.toBeNull();
  });

  it("movements without a balance row are a mismatch", () => {
    expect(stockMismatch(movements, null)).toEqual({
      expected: { qty: "99.5", avgCost: 1200n },
      found: null,
    });
  });

  it("a replay below 0 is a mismatch whatever the row says", () => {
    const below: StoredMovement[] = [{ type: "ISSUE", qtyDelta: "-1", unitCost: 0n }];
    expect(stockMismatch(below, { qty: "0.000", avgCost: 0n })).toEqual({
      expected: "below_zero",
      found: { qty: "0.000", avgCost: 0n },
    });
  });

  it("no movements: a row of 0 at 0 is right, a row of 1 or of average 1 is not", () => {
    expect(stockMismatch([], { qty: "0.000", avgCost: 0n })).toBeNull();
    expect(stockMismatch([], null)).toBeNull();
    expect(stockMismatch([], { qty: "1.000", avgCost: 0n })).not.toBeNull();
    expect(stockMismatch([], { qty: "0.000", avgCost: 1n })).not.toBeNull();
  });
});
