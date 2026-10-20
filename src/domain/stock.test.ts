import { describe, expect, it } from "vitest";

import {
  MOVEMENT_RULES,
  MOVEMENT_TYPES,
  type StockMovement,
  isLow,
  lastCost,
  minimumStep,
  nextBalance,
  stockValue,
} from "./stock";
import { MONEY_MAX } from "./money";

// 09-warehouse.md, first paragraph ("Stock can never go below zero"), Movement types (the Stock
// column) and Stock value (the moving average); developer-rules.md rules 1 and 6; plan of 3.1,
// decided items 1 to 4 (Look first).

const at = (qty: string, avgCost: bigint) => ({ qty, avgCost });
const move = (type: StockMovement["type"], qtyDelta: string, unitCost: bigint | null = null) => ({
  type,
  qtyDelta,
  unitCost,
});

function landed(result: ReturnType<typeof nextBalance>) {
  if (!result.ok) throw new Error(`refused, available ${result.available}`);
  return result;
}

describe("nextBalance, a receipt (09 Stock value, first bullet)", () => {
  it("10 at 1 000 and 5 received at 1 600 make 15 at (10 000 + 8 000) ÷ 15 = 1 200", () => {
    expect(nextBalance(at("10", 1000n), move("RECEIPT", "5", 1600n))).toEqual({
      ok: true,
      qty: "15",
      avgCost: 1200n,
      unitCost: 1600n,
    });
  });

  it("a first receipt into an empty stock takes its price", () => {
    expect(landed(nextBalance(at("0", 0n), move("RECEIPT", "4", 2500n))).avgCost).toBe(2500n);
  });

  it("rounds half up to whole so'm (decided item 1): 3 001 ÷ 3 → 1 000, 2 001 ÷ 2 → 1 001", () => {
    expect(landed(nextBalance(at("2", 1000n), move("RECEIPT", "1", 1001n))).avgCost).toBe(1000n);
    expect(landed(nextBalance(at("1", 1000n), move("RECEIPT", "1", 1001n))).avgCost).toBe(1001n);
  });

  it("works on decimal quantities: 2.5 kg at 4 000 and 1.25 kg at 7 000 → 5 000", () => {
    // (10 000 + 8 750) ÷ 3.75 = 5 000
    const result = landed(nextBalance(at("2.5", 4000n), move("RECEIPT", "1.25", 7000n)));
    expect(result).toMatchObject({ qty: "3.75", avgCost: 5000n });
  });

  it("a free item (price 0) lowers the average: 10 at 1 000 and 10 at 0 → 500", () => {
    expect(landed(nextBalance(at("10", 1000n), move("RECEIPT", "10", 0n))).avgCost).toBe(500n);
  });

  it("a direct entry and a transfer in enter the average like a receipt (Decided ahead 12; 09 second bullet)", () => {
    expect(landed(nextBalance(at("10", 1000n), move("DIRECT_ENTRY", "5", 1600n))).avgCost).toBe(
      1200n,
    );
    expect(landed(nextBalance(at("10", 1000n), move("TRANSFER_IN", "5", 1600n))).avgCost).toBe(
      1200n,
    );
  });
});

describe("nextBalance, movements at the average (09 Stock value, second bullet; decided item 2)", () => {
  it.each(["ISSUE", "WRITE_OFF", "TRANSFER_OUT"] as const)(
    "a %s goes out at the average and leaves it",
    (type) => {
      expect(nextBalance(at("10", 1200n), move(type, "-4"))).toEqual({
        ok: true,
        qty: "6",
        avgCost: 1200n,
        unitCost: 1200n,
      });
    },
  );

  it("a return comes in at the average and leaves it (Decided ahead 11)", () => {
    expect(nextBalance(at("6", 1200n), move("RETURN", "2"))).toEqual({
      ok: true,
      qty: "8",
      avgCost: 1200n,
      unitCost: 1200n,
    });
  });

  it("a correction goes either way at the average", () => {
    expect(landed(nextBalance(at("6", 1200n), move("CORRECTION", "1")))).toMatchObject({
      qty: "7",
      avgCost: 1200n,
    });
    expect(landed(nextBalance(at("6", 1200n), move("CORRECTION", "-1")))).toMatchObject({
      qty: "5",
      avgCost: 1200n,
    });
  });

  it("a return or a correction up into empty stock comes in at 0, and a receipt blends it in at 0", () => {
    const returned = landed(nextBalance(at("0", 0n), move("RETURN", "1")));
    expect(returned).toMatchObject({ qty: "1", avgCost: 0n, unitCost: 0n });
    expect(landed(nextBalance(at("0", 0n), move("CORRECTION", "1"))).avgCost).toBe(0n);
    // The reviewer's worked case: 1 at 0 and 1 received at 1 000 → 500.
    expect(landed(nextBalance(at("1", 0n), move("RECEIPT", "1", 1000n))).avgCost).toBe(500n);
  });
});

describe("nextBalance, a return into empty stock (Decided ahead 11; plan of 5.6, decided item 1)", () => {
  const back = (qtyDelta: string, emptyCost: bigint): StockMovement => ({
    type: "RETURN",
    qtyDelta,
    unitCost: null,
    emptyCost,
  });

  it("into a stock of 0 comes in at its empty-stock cost, which becomes the average", () => {
    expect(nextBalance(at("0", 0n), back("3", 5000n))).toEqual({
      ok: true,
      qty: "3",
      avgCost: 5000n,
      unitCost: 5000n,
    });
  });

  it("the reviewer's worked case: 3 back at 5 000, then 7 received at 6 000 → 5 700", () => {
    const returned = landed(nextBalance(at("0", 0n), back("3", 5000n)));
    const received = landed(nextBalance(returned, move("RECEIPT", "7", 6000n)));
    expect(received).toMatchObject({ qty: "10", avgCost: 5700n });
  });

  it("into a stock above 0 comes in at the average and leaves it, the empty-stock cost unused", () => {
    expect(nextBalance(at("6", 1200n), back("2", 5000n))).toEqual({
      ok: true,
      qty: "8",
      avgCost: 1200n,
      unitCost: 1200n,
    });
  });

  it('into free stock (above 0 at an average of 0) comes in at 0 (edge case "The item was free")', () => {
    expect(landed(nextBalance(at("4", 0n), back("1", 5000n)))).toMatchObject({
      qty: "5",
      avgCost: 0n,
      unitCost: 0n,
    });
  });

  it("an empty-stock cost of 0 brings the return in at 0", () => {
    expect(landed(nextBalance(at("0", 0n), back("2", 0n)))).toMatchObject({
      avgCost: 0n,
      unitCost: 0n,
    });
  });

  it("refuses an empty-stock cost on another type, beside a unit cost, or below 0", () => {
    const issue: StockMovement = { type: "ISSUE", qtyDelta: "-1", unitCost: null, emptyCost: 1n };
    expect(() => nextBalance(at("3", 100n), issue)).toThrow(RangeError);
    // A correction up may carry one (plan of 7.4b, decided item 2), a correction down may not.
    const correction: StockMovement = {
      type: "CORRECTION",
      qtyDelta: "-1",
      unitCost: null,
      emptyCost: 1n,
    };
    expect(() => nextBalance(at("3", 100n), correction)).toThrow(RangeError);
    expect(() =>
      nextBalance(at("0", 0n), { type: "RETURN", qtyDelta: "1", unitCost: 5n, emptyCost: 5n }),
    ).toThrow(RangeError);
    expect(() => nextBalance(at("0", 0n), back("1", -1n))).toThrow(RangeError);
  });
});

describe("nextBalance, a count correction up into empty stock (09 Stock value, the count bullet; plan of 7.4b, decided item 2)", () => {
  const found = (qtyDelta: string, emptyCost: bigint): StockMovement => ({
    type: "CORRECTION",
    qtyDelta,
    unitCost: null,
    emptyCost,
  });

  it("into a stock of 0 comes in at its last cost, which becomes the average", () => {
    expect(nextBalance(at("0", 0n), found("20", 3000n))).toEqual({
      ok: true,
      qty: "20",
      avgCost: 3000n,
      unitCost: 3000n,
    });
  });

  it("the Done-when case: 20 found at 3 000, then 100 bought at 3 000 keeps 3 000", () => {
    const counted = landed(nextBalance(at("0", 0n), found("20", 3000n)));
    expect(landed(nextBalance(counted, move("RECEIPT", "100", 3000n))).avgCost).toBe(3000n);
  });

  it("into a stock above 0 comes in at the average and leaves it, the last cost unused", () => {
    expect(nextBalance(at("6", 1200n), found("2", 5000n))).toEqual({
      ok: true,
      qty: "8",
      avgCost: 1200n,
      unitCost: 1200n,
    });
  });
});

describe("lastCost (09 Stock value: the count correction into 0 comes in at the average before the stock last reached 0; plan of 7.4b, decided item 1)", () => {
  const stored = (type: StockMovement["type"], qtyDelta: string, unitCost: bigint) => ({
    type,
    qtyDelta,
    unitCost,
  });

  it("is 0 when the stock never had any movement", () => {
    expect(lastCost([])).toBe(0n);
  });

  it("is 0 when the stock never went from above 0 to 0", () => {
    expect(lastCost([stored("RECEIPT", "40", 3000n), stored("ISSUE", "-10", 3000n)])).toBe(0n);
  });

  it("40 at 3 000 issued to 0 → 3 000", () => {
    expect(lastCost([stored("RECEIPT", "40", 3000n), stored("ISSUE", "-40", 3000n)])).toBe(3000n);
  });

  it("40 at 3 000 and 40 at 5 000 (average 4 000) issued to 0 → 4 000, not the last price", () => {
    const movements = [
      stored("RECEIPT", "40", 3000n),
      stored("RECEIPT", "40", 5000n),
      stored("ISSUE", "-80", 4000n),
    ];
    expect(lastCost(movements)).toBe(4000n);
  });

  it("the latest trip to 0 counts: 3 000 first, then 5 000", () => {
    const movements = [
      stored("RECEIPT", "10", 3000n),
      stored("ISSUE", "-10", 3000n),
      stored("RECEIPT", "4", 5000n),
      stored("WRITE_OFF", "-4", 5000n),
    ];
    expect(lastCost(movements)).toBe(5000n);
  });

  it("a cancelled purchase that empties the stock: the average before it, not its price", () => {
    // 10 at 1 000 and 10 at 3 000 → 2 000; the 10 at 1 000 issued (10 left at 2 000); then the
    // purchase of 10 at 3 000 cancelled at its own price: the average before it was 2 000.
    const movements = [
      stored("RECEIPT", "10", 1000n),
      stored("RECEIPT", "10", 3000n),
      stored("ISSUE", "-10", 2000n),
      stored("REVERSAL", "-10", 3000n),
    ];
    expect(lastCost(movements)).toBe(2000n);
  });

  it("free items (average 0) emptied: 0", () => {
    expect(lastCost([stored("RECEIPT", "5", 0n), stored("ISSUE", "-5", 0n)])).toBe(0n);
  });

  it("refuses movements that would go below 0", () => {
    expect(() => lastCost([stored("ISSUE", "-1", 0n)])).toThrow(RangeError);
  });
});

describe("nextBalance, the reset at 0 (09 Stock value, third bullet; decided item 4)", () => {
  it("an issue that empties the stock resets the average to 0, and is written at the old average", () => {
    expect(nextBalance(at("5", 800n), move("ISSUE", "-5"))).toEqual({
      ok: true,
      qty: "0",
      avgCost: 0n,
      unitCost: 800n,
    });
  });

  it("a receipt after the reset takes the new price alone", () => {
    expect(landed(nextBalance(at("0", 0n), move("RECEIPT", "3", 900n))).avgCost).toBe(900n);
  });
});

describe("nextBalance, a cancelled purchase (09 Stock value, third bullet; decided item 3)", () => {
  it("removes its quantity at its own price: 10 at 1 200, remove 5 at 1 600 → 5 at 800", () => {
    expect(nextBalance(at("10", 1200n), move("REVERSAL", "-5", 1600n))).toEqual({
      ok: true,
      qty: "5",
      avgCost: 800n,
      unitCost: 1600n,
    });
  });

  it("rounds a half up on the removal too: 3 at 1 000, remove 1 at 999 → 2 001 ÷ 2 → 1 001", () => {
    expect(landed(nextBalance(at("3", 1000n), move("REVERSAL", "-1", 999n))).avgCost).toBe(1001n);
  });

  it("removing all of it resets the average to 0", () => {
    expect(landed(nextBalance(at("5", 1600n), move("REVERSAL", "-5", 1600n))).avgCost).toBe(0n);
  });

  it("a removal worth more than the stock leaves 0, never a negative average", () => {
    // 12 000 − 8 × 1 600 = −800
    expect(nextBalance(at("10", 1200n), move("REVERSAL", "-8", 1600n))).toEqual({
      ok: true,
      qty: "2",
      avgCost: 0n,
      unitCost: 1600n,
    });
  });

  it("a reversal at the average leaves it", () => {
    expect(landed(nextBalance(at("10", 1200n), move("REVERSAL", "3")))).toMatchObject({
      qty: "13",
      avgCost: 1200n,
    });
  });
});

describe("nextBalance, never below 0 (09, first paragraph)", () => {
  it("refuses a movement past the stock and names the available quantity", () => {
    expect(nextBalance(at("5", 800n), move("ISSUE", "-6"))).toEqual({ ok: false, available: "5" });
    expect(nextBalance(at("2.500", 800n), move("WRITE_OFF", "-2.501"))).toEqual({
      ok: false,
      available: "2.5",
    });
    expect(nextBalance(at("0", 0n), move("CORRECTION", "-1"))).toEqual({
      ok: false,
      available: "0",
    });
  });

  it("lets a movement down to exactly 0 through", () => {
    expect(landed(nextBalance(at("2.500", 800n), move("ISSUE", "-2.5"))).qty).toBe("0");
  });
});

describe("nextBalance, the type table (09 Movement types; decided item 2)", () => {
  it("names a rule for every movement type", () => {
    expect(Object.keys(MOVEMENT_RULES)).toEqual([...MOVEMENT_TYPES]);
  });

  it.each(["RECEIPT", "DIRECT_ENTRY", "TRANSFER_IN"] as const)(
    "refuses a %s without a unit cost",
    (type) => {
      expect(() => nextBalance(at("1", 0n), move(type, "1"))).toThrow(RangeError);
    },
  );

  it.each(["ISSUE", "WRITE_OFF", "TRANSFER_OUT", "RETURN", "CORRECTION"] as const)(
    "refuses a %s with a unit cost",
    (type) => {
      const delta = MOVEMENT_RULES[type].direction === "in" ? "1" : "-1";
      expect(() => nextBalance(at("5", 100n), move(type, delta, 100n))).toThrow(RangeError);
    },
  );

  it("refuses the wrong direction: a receipt down, an issue up", () => {
    expect(() => nextBalance(at("5", 100n), move("RECEIPT", "-1", 100n))).toThrow(RangeError);
    expect(() => nextBalance(at("5", 100n), move("ISSUE", "1"))).toThrow(RangeError);
  });

  it("refuses a zero, a malformed quantity and a negative cost", () => {
    expect(() => nextBalance(at("5", 100n), move("CORRECTION", "0"))).toThrow(RangeError);
    expect(() => nextBalance(at("5", 100n), move("CORRECTION", "1e2"))).toThrow(RangeError);
    expect(() => nextBalance(at("5", 100n), move("CORRECTION", "1.0001"))).toThrow(RangeError);
    expect(() => nextBalance(at("5", 100n), move("RECEIPT", "1", -1n))).toThrow(RangeError);
  });
});

describe("stockValue (09 Stock value; 08 Rounding: half up; plan of 5.2, decided item 1)", () => {
  it("rounds quantity × average half up once, to whole so'm", () => {
    expect(stockValue("2.5", 1001n)).toBe(2503n); // 2 502.5 up
    expect(stockValue("1.250", 3999n)).toBe(4999n); // 4 998.75 up
    expect(stockValue("0.001", 499n)).toBe(0n); // 0.499 down
    expect(stockValue("0.001", 500n)).toBe(1n); // 0.5 up
  });

  it("is 0 at a stock of 0 or an average of 0", () => {
    expect(stockValue("3", 0n)).toBe(0n);
    expect(stockValue("0", 5000n)).toBe(0n);
  });

  it("is exact at the largest stock, with no float on the way (developer-rules rule 6)", () => {
    const value = stockValue("99999999999.999", 9999n);
    expect(value).toBe(999_899_999_999_990n); // 999 899 999 999 990.001 down
    expect(value <= MONEY_MAX).toBe(true);
  });

  it("refuses a quantity that is not numeric(14,3) and a negative average", () => {
    expect(() => stockValue("-1", 10n)).toThrow(RangeError);
    expect(() => stockValue("1e2", 10n)).toThrow(RangeError);
    expect(() => stockValue("1", -1n)).toThrow(RangeError);
  });
});

describe('isLow (09 Low stock: "falls to its minimum or below"; 00-definitions, Minimum stock; plan of 5.10, decided item 1)', () => {
  it("is Low at the minimum and below it", () => {
    expect(isLow("5", "5")).toBe(true);
    expect(isLow("5.000", "5")).toBe(true);
    expect(isLow("4.999", "5")).toBe(true);
    expect(isLow("0", "5")).toBe(true);
  });

  it("is not Low 0.001 above the minimum", () => {
    expect(isLow("5.001", "5")).toBe(false);
  });

  it('is never Low with no minimum (00-definitions: "No minimum means never low")', () => {
    expect(isLow("0", null)).toBe(false);
    expect(isLow("5", null)).toBe(false);
  });
});

describe('minimumStep (10 Notifications: "once per item until restocked"; plan of 5.10, decided item 2)', () => {
  it("Low and not yet told: send", () => {
    expect(minimumStep("5", "5", false)).toBe("send");
  });

  it("Low and already told: none", () => {
    expect(minimumStep("4", "5", true)).toBe("none");
  });

  it("no longer Low with the mark set: clear (restocked, or the minimum lowered or removed)", () => {
    expect(minimumStep("5.001", "5", true)).toBe("clear");
    expect(minimumStep("4", null, true)).toBe("clear");
  });

  it("not Low and not told: none", () => {
    expect(minimumStep("6", "5", false)).toBe("none");
    expect(minimumStep("0", null, false)).toBe("none");
  });
});
