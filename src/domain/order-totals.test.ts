import { describe, expect, it } from "vitest";

import {
  type OrderPlan,
  orderExtras,
  orderGoods,
  orderTotal,
  ordersTotals,
  priceHintPercent,
} from "./order-totals";

// 08-money-and-settlement.md, Numbers the system calculates (Planned total; "The totals of a
// group row or of ticked orders are the sums of the order values. Rounding is always half up, to
// whole so'm"); 05-order-request-form.md, Order fields 10 to 16, the totals under the list, and
// Ticking and filters: Price hint; developer-rules.md rules 1 and 6.

function plan(
  quantity: string,
  price: bigint,
  extras: bigint[] = [],
  paymentType: OrderPlan["paymentType"] = "CASH",
): OrderPlan {
  return { quantity, price, extras, paymentType };
}

describe("orderTotal (08 Planned total; 05 field 16)", () => {
  it("08 Worked example: 100 × 5 000 + 20 000 delivery = 520 000", () => {
    const notebooks = plan("100", 5_000n, [20_000n]);
    expect(orderGoods(notebooks)).toBe(500_000n);
    expect(orderExtras(notebooks)).toBe(20_000n);
    expect(orderTotal(notebooks)).toBe(520_000n);
  });

  it("08 rounding: a 3-decimal quantity × price rounds half up to whole so'm", () => {
    expect(orderGoods(plan("2.125", 1_002n))).toBe(2_129n); // 2 129.25
    expect(orderGoods(plan("0.005", 100n))).toBe(1n); // 0.5, exactly half: up
    expect(orderGoods(plan("1.333", 1_500n))).toBe(2_000n); // 1 999.5
    expect(orderGoods(plan("0.004", 100n))).toBe(0n); // 0.4
    expect(orderGoods(plan("2.999", 1_000n))).toBe(2_999n);
  });

  it("developer-rules rule 6: exact beyond 2^53 and beyond 20 significant digits", () => {
    const price = 999_999_999_999_999n;
    // 99 999 999 999.999 × price = 99 999 999 999 999 × price / 1 000, half up.
    const thousandths = 99_999_999_999_999n * price;
    const expected = thousandths / 1_000n + (thousandths % 1_000n >= 500n ? 1n : 0n);
    expect(orderGoods(plan("99999999999.999", price))).toBe(expected);
    expect(expected > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it('14-data-model numeric(14,3): PostgreSQL\'s "100.000" is the same as "100"; no extras is 0', () => {
    expect(orderTotal(plan("100.000", 5_000n))).toBe(orderTotal(plan("100", 5_000n)));
    expect(orderExtras(plan("1", 5_000n))).toBe(0n);
    expect(orderTotal(plan("1", 5_000n, [300n, 200n]))).toBe(5_500n);
  });

  it("05 fields 10 to 12: a quantity, price or extra outside the rules throws, never a total", () => {
    const quantities = [
      "0",
      "0.000",
      "-1",
      "1.2345",
      "123456789012",
      "",
      "abc",
      "0x10",
      "0b1",
      "1e2",
      "Infinity",
      "NaN",
      " 5",
      "5 ",
      "+5",
      ".5",
      "5.",
      "1,5",
    ];
    for (const quantity of quantities) {
      expect(() => orderTotal(plan(quantity, 100n)), quantity).toThrow(RangeError);
    }
    expect(() => orderTotal(plan("1", 0n))).toThrow(RangeError);
    expect(() => orderTotal(plan("1", -5n))).toThrow(RangeError);
    expect(() => orderTotal(plan("1", 100n, [0n]))).toThrow(RangeError);
    expect(() => orderTotal(plan("1", 100n, [-1n]))).toThrow(RangeError);
  });
});

describe("ordersTotals (05 the totals under the list; 08 sums of the order values)", () => {
  it("05: three orders of three payment types give goods, extras, grand and the split", () => {
    const cash = plan("100", 5_000n, [20_000n], "CASH"); // 520 000
    const transfer = plan("2.125", 1_002n, [], "TRANSFER"); // 2 129
    const card = plan("3", 1_500n, [1_000n, 500n], "CARD"); // 4 500 + 1 500
    const totals = ordersTotals([cash, transfer, card]);
    expect(totals.goods).toBe(500_000n + 2_129n + 4_500n);
    expect(totals.extras).toBe(20_000n + 1_500n);
    expect(totals.grand).toBe(528_129n);
    expect(totals.byPaymentType).toEqual({ CASH: 520_000n, TRANSFER: 2_129n, CARD: 6_000n });
    const split = Object.values(totals.byPaymentType).reduce((sum, value) => sum + value, 0n);
    expect(split).toBe(totals.grand);
  });

  it("08: goods are rounded per order, then summed (0.5 + 0.5 is 1 + 1 = 2, not 1)", () => {
    const half = plan("0.005", 100n);
    expect(ordersTotals([half, half]).goods).toBe(2n);
  });

  it("an empty set is zeros with every payment type; one type adds up", () => {
    expect(ordersTotals([])).toEqual({
      goods: 0n,
      extras: 0n,
      grand: 0n,
      byPaymentType: { CASH: 0n, TRANSFER: 0n, CARD: 0n },
    });
    const two = ordersTotals([plan("1", 100n, [], "CARD"), plan("2", 100n, [5n], "CARD")]);
    expect(two.byPaymentType).toEqual({ CASH: 0n, TRANSFER: 0n, CARD: 305n });
  });

  it("05 field 13: an unknown payment type throws", () => {
    const wrong = { ...plan("1", 100n), paymentType: "CHEQUE" } as unknown as OrderPlan;
    expect(() => ordersTotals([wrong])).toThrow(RangeError);
  });
});

describe("priceHintPercent (05 Ticking and filters: Price hint)", () => {
  it("05: 6 750 against a reference of 5 000 is +35", () => {
    expect(priceHintPercent(6_750n, 5_000n, 20)).toBe(35n);
  });

  it("05: 3 250 against 5 000 is −35", () => {
    expect(priceHintPercent(3_250n, 5_000n, 20)).toBe(-35n);
  });

  it('05 "more than 20%": exactly 20% gives no hint; just over gives 20', () => {
    expect(priceHintPercent(6_000n, 5_000n, 20)).toBeNull();
    expect(priceHintPercent(4_000n, 5_000n, 20)).toBeNull();
    expect(priceHintPercent(6_001n, 5_000n, 20)).toBe(20n); // 20.02
    expect(priceHintPercent(3_999n, 5_000n, 20)).toBe(-20n);
  });

  it("05: no typed price, no reference price or equal prices give no hint", () => {
    expect(priceHintPercent(null, 5_000n, 20)).toBeNull();
    expect(priceHintPercent(6_750n, null, 20)).toBeNull();
    expect(priceHintPercent(5_000n, 5_000n, 0)).toBeNull();
  });

  it("08 half up: a percent ending in .5 rounds away from 0 both ways", () => {
    expect(priceHintPercent(1_125n, 1_000n, 10)).toBe(13n); // +12.5
    expect(priceHintPercent(875n, 1_000n, 10)).toBe(-13n); // −12.5
  });

  it("threshold 0: every difference shows, the smallest as 1 with its sign, never 0", () => {
    expect(priceHintPercent(5_001n, 5_000n, 0)).toBe(1n); // 0.02%
    expect(priceHintPercent(4_999n, 5_000n, 0)).toBe(-1n);
  });

  it("developer-rules rule 6: the largest typed price against 1 so'm is exact", () => {
    expect(priceHintPercent(999_999_999_999_999n, 1n, 20)).toBe(99_999_999_999_999_800n);
  });

  it("a threshold that is not a whole percent from 0 to 1 000, or a price of 0, throws", () => {
    for (const threshold of [1.5, -1, 1_001, Number.NaN]) {
      expect(() => priceHintPercent(6_750n, 5_000n, threshold), String(threshold)).toThrow(
        RangeError,
      );
    }
    expect(() => priceHintPercent(0n, 5_000n, 20)).toThrow(RangeError);
    expect(() => priceHintPercent(5_000n, 0n, 20)).toThrow(RangeError);
  });
});
