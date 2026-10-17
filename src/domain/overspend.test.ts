import { describe, expect, it } from "vitest";

import { orderTotal } from "./order-totals";
import { type GuardSettings, overspend } from "./overspend";
import { actualTotal } from "./purchases";
import { GUARD_OFF, SETTING_DEFAULTS } from "./settings";

// 08-money-and-settlement.md, Overspend guard and Worked example; 02-assumptions.md A10; plan of
// 4.1, decided item 5, Look first.

const DEFAULTS: GuardSettings = {
  overspend_guard_percent: SETTING_DEFAULTS.overspend_guard_percent,
  overspend_guard_min_amount: SETTING_DEFAULTS.overspend_guard_min_amount,
};

function guard(percent: number | typeof GUARD_OFF, amount: bigint): GuardSettings {
  return { overspend_guard_percent: percent, overspend_guard_min_amount: amount };
}

describe("overspend guard (08 Overspend guard; A10)", () => {
  it("Dearer: 550 000 on 520 000 is 5.8% and 30 000 so'm, under the guard (08 Worked example)", () => {
    const planned = orderTotal({
      quantity: "100",
      price: 5_000n,
      extras: [20_000n],
      paymentType: "CASH",
    });
    const actual = actualTotal([
      { qty: "100", unitPrice: 5_200n, extras: [30_000n], isCancelled: false },
    ]);
    expect(overspend(planned, actual, DEFAULTS)).toEqual({
      over: 30_000n,
      percent: "5.8",
      needsHead: false,
    });
  });

  it("80 000 over (15.4%) is under the guard at a 100 000 amount and above it at 50 000", () => {
    expect(overspend(520_000n, 600_000n, DEFAULTS)).toEqual({
      over: 80_000n,
      percent: "15.4",
      needsHead: false,
    });
    expect(overspend(520_000n, 600_000n, guard(10, 50_000n))).toEqual({
      over: 80_000n,
      percent: "15.4",
      needsHead: true,
    });
  });

  it("CHL-26-0143: 30% over but only 30 000 so'm: no Head step (08 Worked example)", () => {
    expect(overspend(100_000n, 130_000n, DEFAULTS)).toMatchObject({
      percent: "30.0",
      needsHead: false,
    });
  });

  it("both tests are strict: exactly 10% or exactly the amount over does not need the Head", () => {
    // 200 000 over on 2 000 000 is exactly 10%, above 100 000.
    expect(overspend(2_000_000n, 2_200_000n, DEFAULTS).needsHead).toBe(false);
    expect(overspend(2_000_000n, 2_200_001n, DEFAULTS).needsHead).toBe(true);
    // 100 000 over on 500 000 is 20%, exactly the amount.
    expect(overspend(500_000n, 600_000n, DEFAULTS).needsHead).toBe(false);
    expect(overspend(500_000n, 600_001n, DEFAULTS).needsHead).toBe(true);
  });

  it("with the percent at 0 only the amount counts", () => {
    expect(overspend(10_000_000n, 10_100_001n, guard(0, 100_000n)).needsHead).toBe(true);
    expect(overspend(10_000_000n, 10_100_000n, guard(0, 100_000n)).needsHead).toBe(false);
  });

  it("with the amount at 0 only the percent counts", () => {
    expect(overspend(100_000n, 111_000n, guard(10, 0n)).needsHead).toBe(true);
    expect(overspend(100_000n, 110_000n, guard(10, 0n)).needsHead).toBe(false);
  });

  it("with both at 0 every overspend needs the Head", () => {
    expect(overspend(520_000n, 520_001n, guard(0, 0n))).toEqual({
      over: 1n,
      percent: "0.0",
      needsHead: true,
    });
  });

  it("switched off, nothing needs the Head", () => {
    expect(overspend(100_000n, 10_000_000n, guard(GUARD_OFF, 0n))).toEqual({
      over: 9_900_000n,
      percent: "9900.0",
      needsHead: false,
    });
  });

  it("spent at or below the plan is no overspend, even with both at 0", () => {
    for (const actual of [520_000n, 470_000n, 0n]) {
      expect(overspend(520_000n, actual, guard(0, 0n))).toEqual({
        over: 0n,
        percent: null,
        needsHead: false,
      });
    }
  });

  it("the percent is rounded half up to one decimal: 1 over 2 000 is 0.05% → 0.1", () => {
    expect(overspend(2_000n, 2_001n, DEFAULTS).percent).toBe("0.1");
    expect(overspend(3_000n, 3_001n, DEFAULTS).percent).toBe("0.0");
  });

  it("a planned total of 0 has no percent, and the percent test holds for any overspend", () => {
    expect(overspend(0n, 150_000n, DEFAULTS)).toEqual({
      over: 150_000n,
      percent: null,
      needsHead: true,
    });
    expect(overspend(0n, 100_000n, DEFAULTS).needsHead).toBe(false);
  });
});
