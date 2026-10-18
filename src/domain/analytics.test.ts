import { describe, expect, it } from "vitest";

import {
  estimateGap,
  shareChange,
  shareOf,
  changeAgainst,
  daysOf,
  monthBefore,
  monthInside,
  monthsOf,
  periodBefore,
  periodChoices,
  periodOf,
  WAITING_GROUP_KEYS,
  averageHours,
  averageSom,
  ninetyDaysSince,
  qtyChange,
  runsOutIn,
  suggestedQuantity,
  useChange,
  reasonKey,
  waitingGroup,
} from "./analytics";
import { actualGoods } from "./purchases";

// 10-notifications-analytics-reports.md, Analytics page per role, point 1 ("This month, last month,
// this quarter, this school year, or custom dates. … until it is set, the school-year choice is
// hidden. Every number shows its change against the period before"); open question 14; plan of
// 6.3, decided items 2, 3, 4 and 8 (Look first) and the review's decision 4.

const SEPTEMBER_1 = { month: 9, day: 1 };

describe("period choices (10 point 1: school year hidden until set)", () => {
  it("leaves the school year out while the setting is empty", () => {
    expect(periodChoices(null)).toEqual(["this_month", "last_month", "this_quarter", "custom"]);
  });

  it("offers it once the first day is set", () => {
    expect(periodChoices(SEPTEMBER_1)).toContain("school_year");
  });
});

describe("the dates of a period", () => {
  it("this month and last month are calendar months in Tashkent dates", () => {
    expect(periodOf("this_month", "2026-10-18", null)).toEqual({
      choice: "this_month",
      first: "2026-10-01",
      last: "2026-10-31",
    });
    expect(periodOf("last_month", "2026-03-31", null)).toMatchObject({
      first: "2026-02-01",
      last: "2026-02-28",
    });
  });

  it("last month crosses the year end", () => {
    expect(periodOf("last_month", "2027-01-01", null)).toMatchObject({
      first: "2026-12-01",
      last: "2026-12-31",
    });
  });

  it("this quarter is the calendar quarter (open question 14, decided item 2)", () => {
    expect(periodOf("this_quarter", "2026-10-18", null)).toMatchObject({
      first: "2026-10-01",
      last: "2026-12-31",
    });
    expect(periodOf("this_quarter", "2026-03-31", null)).toMatchObject({
      first: "2026-01-01",
      last: "2026-03-31",
    });
    expect(periodOf("this_quarter", "2026-04-01", null)).toMatchObject({
      first: "2026-04-01",
      last: "2026-06-30",
    });
  });

  it("the school year with today after its first day (decided item 8)", () => {
    expect(periodOf("school_year", "2026-10-18", SEPTEMBER_1)).toMatchObject({
      first: "2026-09-01",
      last: "2027-08-31",
    });
  });

  it("the school year with today before its first day began the year before", () => {
    expect(periodOf("school_year", "2026-08-31", SEPTEMBER_1)).toMatchObject({
      first: "2025-09-01",
      last: "2026-08-31",
    });
    expect(periodOf("school_year", "2026-09-01", SEPTEMBER_1)).toMatchObject({
      first: "2026-09-01",
    });
  });

  it("refuses the school year while it is not set", () => {
    expect(() => periodOf("school_year", "2026-10-18", null)).toThrow(/not set/);
  });

  it("custom dates are taken as given", () => {
    expect(
      periodOf("custom", "2026-10-18", null, { from: "2026-02-10", to: "2026-03-05" }),
    ).toEqual({ choice: "custom", first: "2026-02-10", last: "2026-03-05" });
  });

  it("refuses custom dates that are missing, not dates, or the wrong way round", () => {
    expect(() => periodOf("custom", "2026-10-18", null)).toThrow(/Refused/);
    expect(() =>
      periodOf("custom", "2026-10-18", null, { from: "2026-02-30", to: "2026-03-05" }),
    ).toThrow(/Refused/);
    expect(() =>
      periodOf("custom", "2026-10-18", null, { from: "2026-03-06", to: "2026-03-05" }),
    ).toThrow(/after its last/);
  });

  it("refuses a today that is not a date", () => {
    expect(() => periodOf("this_month", "18.10.2026", null)).toThrow(/Refused/);
  });
});

describe("the period before (decided item 3)", () => {
  it("is the whole month before, also for a month still running", () => {
    expect(periodBefore(periodOf("this_month", "2026-10-18", null), null)).toMatchObject({
      first: "2026-09-01",
      last: "2026-09-30",
    });
    expect(periodBefore(periodOf("last_month", "2026-10-18", null), null)).toMatchObject({
      first: "2026-08-01",
      last: "2026-08-31",
    });
  });

  it("is the quarter before, across the year end", () => {
    expect(periodBefore(periodOf("this_quarter", "2026-02-10", null), null)).toMatchObject({
      first: "2025-10-01",
      last: "2025-12-31",
    });
  });

  it("is the school year before", () => {
    const year = periodOf("school_year", "2026-10-18", SEPTEMBER_1);
    expect(periodBefore(year, SEPTEMBER_1)).toMatchObject({
      first: "2025-09-01",
      last: "2026-08-31",
    });
  });

  it("is the same number of days just before custom dates", () => {
    const custom = periodOf("custom", "2026-10-18", null, { from: "2026-03-01", to: "2026-03-10" });
    expect(daysOf(custom)).toBe(10);
    expect(periodBefore(custom, null)).toEqual({
      choice: "custom",
      first: "2026-02-19",
      last: "2026-02-28",
    });
  });
});

describe("months of a period (the chart by month; review decision 16)", () => {
  it("lists every month the period touches", () => {
    expect(monthsOf({ first: "2026-11-15", last: "2027-02-03" })).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });

  it("the month before crosses the year end", () => {
    expect(monthBefore("2027-01")).toBe("2026-12");
    expect(() => monthBefore("2027-13")).toThrow(/Refused/);
  });

  it("a month's point counts its days inside the period only", () => {
    const range = { first: "2026-11-15", last: "2027-02-03" };
    expect(monthInside("2026-11", range)).toEqual({ first: "2026-11-15", last: "2026-11-30" });
    expect(monthInside("2026-12", range)).toEqual({ first: "2026-12-01", last: "2026-12-31" });
    expect(monthInside("2027-02", range)).toEqual({ first: "2027-02-01", last: "2027-02-03" });
    expect(monthInside("2027-03", range)).toBeNull();
  });
});

describe("the change against the period before (decided item 4)", () => {
  it("is the difference in so'm and the percent, half up to one decimal", () => {
    // The review's example: 1 000 000 → 1 123 500 is +123 500 so'm, +12.35 % → +12.4 %.
    expect(changeAgainst(1_123_500n, 1_000_000n)).toEqual({
      difference: 123_500n,
      percent: "12.4",
    });
  });

  it("rounds a fall half away from zero: −12.35 % → −12.4 %", () => {
    expect(changeAgainst(876_500n, 1_000_000n)).toEqual({
      difference: -123_500n,
      percent: "-12.4",
    });
  });

  it("rounds below the half down: 12.34 % → 12.3 %", () => {
    expect(changeAgainst(1_123_400n, 1_000_000n).percent).toBe("12.3");
  });

  it("has no percent when the period before is 0", () => {
    expect(changeAgainst(500n, 0n)).toEqual({ difference: 500n, percent: null });
    expect(changeAgainst(0n, 0n)).toEqual({ difference: 0n, percent: null });
  });

  it("keeps exact so'm far above a JavaScript number's safe range", () => {
    const before = 9_007_199_254_740_993n;
    expect(changeAgainst(before + 1n, before).difference).toBe(1n);
  });

  it("refuses a number that is not whole so'm", () => {
    expect(() => changeAgainst(1 as unknown as bigint, 0n)).toThrow(RangeError);
  });
});

describe("the share of a count (10 Analytics, Head, Plan vs actual; plan of 6.4, item 7)", () => {
  it("is a percent of the whole, half up to one decimal", () => {
    expect(shareOf(1, 3)).toBe("33.3");
    expect(shareOf(2, 3)).toBe("66.7");
    // 1 of 8 is 12.5 exactly; 1 of 16 is 6.25 → 6.3 (half up).
    expect(shareOf(1, 8)).toBe("12.5");
    expect(shareOf(1, 16)).toBe("6.3");
    expect(shareOf(0, 4)).toBe("0.0");
    expect(shareOf(4, 4)).toBe("100.0");
  });

  it("has none when the whole is 0", () => {
    expect(shareOf(0, 0)).toBeNull();
  });

  it("refuses a part below 0, above the whole, or not whole", () => {
    expect(() => shareOf(-1, 3)).toThrow(RangeError);
    expect(() => shareOf(4, 3)).toThrow(RangeError);
    expect(() => shareOf(0.5, 3)).toThrow(RangeError);
  });
});

describe("the change of a share (10 point 1; plan of 6.4, item 7)", () => {
  it("is in percentage points", () => {
    expect(shareChange("33.3", "25.0")).toBe("8.3");
    expect(shareChange("25.0", "33.3")).toBe("-8.3");
    expect(shareChange("50.0", "50.0")).toBe("0.0");
  });

  it("has none when either period has no share", () => {
    expect(shareChange("50.0", null)).toBeNull();
    expect(shareChange(null, "50.0")).toBeNull();
  });
});

describe("the 6.4b numbers (10 Analytics, Head, Prices and Approval speed; plan of 6.4b)", () => {
  it("ninetyDaysSince: today and the 89 days before it (decided item 4)", () => {
    expect(ninetyDaysSince("2031-05-02")).toBe("2031-02-02");
    expect(daysOf({ first: ninetyDaysSince("2031-05-02"), last: "2031-05-02" })).toBe(90);
  });

  it("useChange: a percent only against a period before above 0 (plan of 6.4d, decided item 4)", () => {
    expect(useChange(8_000n, 4_000n)).toEqual({ difference: 4_000n, percent: "100.0" });
    expect(useChange(4_000n, 0n)).toBeNull();
    expect(useChange(4_000n, -4_000n)).toBeNull();
  });

  it("ninetyDaysSince is also the first day of 'no movement for 90 days', across a year end (plan of 6.4d, decided item 7)", () => {
    // Worked in the plan review: 2031-01-03 is 89 days before 2031-04-02, inside the 90 days.
    expect(ninetyDaysSince("2031-04-02")).toBe("2031-01-03");
    expect(ninetyDaysSince("2031-01-15")).toBe("2030-10-18");
  });

  it("averageHours: Σ seconds ÷ count in hours, half up to one decimal (decided item 7)", () => {
    expect(averageHours(16_200n, 2)).toBe("2.3");
    expect(averageHours(3_600n, 1)).toBe("1.0");
    expect(averageHours(0n, 3)).toBe("0.0");
    expect(averageHours(0n, 0)).toBeNull();
    expect(() => averageHours(-1n, 1)).toThrow(RangeError);
    expect(() => averageHours(1n, -1)).toThrow(RangeError);
  });

  it("averageHours of all branches is of the whole set, not a mean of branch means (review correction 2)", () => {
    // CHL: 1 h and 3 h; another branch: 8 h. All branches: 12 h ÷ 3 = 4.0, not (2.0 + 8.0) ÷ 2.
    expect(averageHours(3_600n + 10_800n, 2)).toBe("2.0");
    expect(averageHours(28_800n, 1)).toBe("8.0");
    expect(averageHours(3_600n + 10_800n + 28_800n, 3)).toBe("4.0");
  });

  it("waitingGroup: strict edges at 24 h, 48 h and 7 days (decided item 8)", () => {
    const now = new Date("2031-05-10T12:00:00Z");
    const ago = (ms: number) => new Date(now.getTime() - ms);
    const hour = 3_600_000;
    expect(waitingGroup(ago(0), now)).toBe("day");
    expect(waitingGroup(ago(24 * hour), now)).toBe("day");
    expect(waitingGroup(ago(24 * hour + 1000), now)).toBe("twoDays");
    expect(waitingGroup(ago(48 * hour), now)).toBe("twoDays");
    expect(waitingGroup(ago(48 * hour + 1000), now)).toBe("week");
    expect(waitingGroup(ago(168 * hour), now)).toBe("week");
    expect(waitingGroup(ago(168 * hour + 1000), now)).toBe("older");
    expect(WAITING_GROUP_KEYS).toEqual(["day", "twoDays", "week", "older"]);
  });

  it("reasonKey: trimmed, one space, lower case (decided item 10)", () => {
    expect(reasonKey("  Narxi  juda\tqimmat ")).toBe("narxi juda qimmat");
    expect(reasonKey("NARXI JUDA QIMMAT")).toBe(reasonKey("narxi juda qimmat"));
    expect(reasonKey("Цена высокая")).toBe("цена высокая");
  });
});

// 10 Analytics, Head, Managers: "average difference from plan"; 08 Rounding ("always half up, to
// whole so'm"); plan of 6.4c, decided item 3 (Look first) and the review's decision 3.
describe("the Managers block (plan of 6.4c)", () => {
  it("averageSom: Σ ÷ count, rounded once half up to whole so'm", () => {
    // The review's worked example: differences 1 and 2 → 1.5 → 2.
    expect(averageSom(3n, 2)).toBe(2n);
    expect(averageSom(5n, 2)).toBe(3n);
    expect(averageSom(10n, 3)).toBe(3n);
    expect(averageSom(0n, 4)).toBe(0n);
  });

  it("averageSom: half up away from zero on a negative mean (−5 ÷ 2 → −3)", () => {
    expect(averageSom(-5n, 2)).toBe(-3n);
    expect(averageSom(-10n, 3)).toBe(-3n);
    expect(averageSom(-150_000n, 1)).toBe(-150_000n);
  });

  it("averageSom: no order, no average", () => {
    expect(averageSom(0n, 0)).toBeNull();
    expect(() => averageSom(1n, -1)).toThrow(RangeError);
    expect(() => averageSom(1 as unknown as bigint, 1)).toThrow(RangeError);
  });
});

// 10 Analytics, Manager, My estimates: "Difference between planned and actual price per product";
// 08 Numbers the system calculates (Difference = planned − actual: "a positive difference means
// money is left"; goods rounded per record, half up); plan of 6.5b, decided item 4 (Look first)
// and the review's correction 1.
describe("My estimates (plan of 6.5b, decided item 4)", () => {
  const line = (qty: string, unitPrice: bigint, plannedPrice: bigint) => ({
    qty,
    unitPrice,
    goods: actualGoods([{ qty, unitPrice, extras: [], isCancelled: false }]),
    plannedPrice,
  });

  it("the review's worked case: both prices from the sums, the percent from the sums", () => {
    // Order A planned 5 000, records 10 at 4 500; order B planned 6 000, records 4 at 6 500.
    const gap = estimateGap([line("10", 4_500n, 5_000n), line("4", 6_500n, 6_000n)]);
    expect(gap).toEqual({
      records: 2,
      qty: "14",
      plannedGoods: 74_000n,
      goods: 71_000n,
      plannedPrice: 5_286n,
      actualPrice: 5_071n,
      difference: 215n,
      // 3 000 ÷ 74 000 = 4.054…%, not (215 ÷ 5 286 = 4.067…) of the rounded prices.
      percent: "4.1",
    });
  });

  it("paid more than planned: the difference and the percent are below 0", () => {
    const gap = estimateGap([line("3", 12_000n, 10_000n)]);
    expect(gap.difference).toBe(-2_000n);
    expect(gap.percent).toBe("-20.0");
  });

  it("rounds each record's planned goods half up, as 08 rounds goods", () => {
    // 0.5 × 3 = 1.5 → 2 so'm planned; 0.5 × 1 = 0.5 → 1 so'm paid.
    const gap = estimateGap([line("0.5", 1n, 3n)]);
    expect(gap.plannedGoods).toBe(2n);
    expect(gap.goods).toBe(1n);
    expect(gap.plannedPrice).toBe(4n);
    expect(gap.actualPrice).toBe(2n);
    expect(gap.difference).toBe(2n);
    expect(gap.percent).toBe("50.0");
  });

  it("leaves a gift out of every number (plan of 6.4b, decided item 1)", () => {
    const gap = estimateGap([line("2", 0n, 9_000n), line("1", 8_000n, 9_000n)]);
    expect(gap).toMatchObject({ records: 1, qty: "1", plannedGoods: 9_000n, goods: 8_000n });
  });

  it("has no price and no percent without a priced record", () => {
    expect(estimateGap([line("2", 0n, 9_000n)])).toEqual({
      records: 0,
      qty: "0",
      plannedGoods: 0n,
      goods: 0n,
      plannedPrice: null,
      actualPrice: null,
      difference: null,
      percent: null,
    });
  });

  it("refuses a broken line", () => {
    expect(() => estimateGap([{ ...line("1", 5n, 5n), plannedPrice: 0n }])).toThrow(RangeError);
    expect(() => estimateGap([{ ...line("1", 5n, 5n), goods: -1n }])).toThrow(RangeError);
  });
});

describe('"runs out in" (00-definitions; 10 Manager, Stock planning; plan of 6.5c, decided item 2)', () => {
  it("is on hand ÷ the average daily issues of the last 90 days: 24 on hand, 180 issued → 12 days", () => {
    // 10: "runs out in about 12 days" at the current rate; 180 ÷ 90 = 2 a day.
    expect(runsOutIn("24", "180")).toBe(12);
  });

  it("rounds to whole days half up (CLAUDE.md rule 6)", () => {
    expect(runsOutIn("24", "179")).toBe(12); // 12.07
    expect(runsOutIn("1", "36")).toBe(3); // 2.5 → 3
    expect(runsOutIn("1", "36.1")).toBe(2); // 2.49 → 2
  });

  it("reads fractions of a measure: 1.5 kg on hand, 13.5 kg issued → 10 days", () => {
    expect(runsOutIn("1.5", "13.5")).toBe(10);
  });

  it("is 0 when the stock is empty and there is use", () => {
    expect(runsOutIn("0", "9")).toBe(0);
  });

  it("has none with no use, stock 0 included: at no rate the stock never runs out", () => {
    expect(runsOutIn("50", "0")).toBeNull();
    expect(runsOutIn("0", "0")).toBeNull();
  });

  it("has none when returns pass issues (a use below 0)", () => {
    expect(runsOutIn("50", "-4")).toBeNull();
  });

  it("refuses a stock or a use that is not numeric(14,3)", () => {
    expect(() => runsOutIn("-1", "9")).toThrow(RangeError);
    expect(() => runsOutIn("1e2", "9")).toThrow(RangeError);
    expect(() => runsOutIn("5", "1.0001")).toThrow(RangeError);
    expect(() => runsOutIn("5", "Infinity")).toThrow(RangeError);
  });
});

describe("the suggested order quantity (open question 15; plan of 6.5c, decided item 1)", () => {
  it("lasts 30 days at the 90-day rate on top of the minimum: 2 a day, minimum 10, 24 on hand → 46", () => {
    expect(suggestedQuantity("24", "10", "180")).toBe("46");
  });

  it("rounds half up to a whole unit (CLAUDE.md rule 6)", () => {
    // 1.5 a month: 0.05 a day × 30 = 1.5 → 2; 1.49 → 1.
    expect(suggestedQuantity("0", null, "4.5")).toBe("2");
    expect(suggestedQuantity("0", null, "4.47")).toBe("1");
  });

  it("is 0 when the stock on hand already covers it", () => {
    expect(suggestedQuantity("100", "10", "180")).toBe("0");
  });

  it("counts an unset minimum as 0", () => {
    expect(suggestedQuantity("4", null, "180")).toBe("56");
  });

  it("is 0 with no use and no Low", () => {
    expect(suggestedQuantity("3", null, "0")).toBe("0");
    expect(suggestedQuantity("12", "10", "0")).toBe("0");
  });

  it("is minimum − on hand for a Low line with no use", () => {
    expect(suggestedQuantity("5", "10", "0")).toBe("5");
  });

  it("counts a net rate below 0 as 0", () => {
    // Issues 10 and returns 20 in the 90 days: the suggestion is minimum − on hand.
    expect(suggestedQuantity("5", "10", "-10")).toBe("5");
  });

  it("is at least 1 for a Low line (09 Low stock: at its minimum or below; review correction 1)", () => {
    expect(suggestedQuantity("10", "10", "0")).toBe("1"); // at its minimum
    expect(suggestedQuantity("9.6", "10", "0")).toBe("1"); // 0.4 → 0, still Low
    expect(suggestedQuantity("10", "10", "0.9")).toBe("1"); // 0.01 a day: 0.3 → 0
  });

  it("refuses a stock, a minimum or a use that is not numeric(14,3)", () => {
    expect(() => suggestedQuantity("-1", null, "9")).toThrow(RangeError);
    expect(() => suggestedQuantity("1", "1e2", "9")).toThrow(RangeError);
    expect(() => suggestedQuantity("1", null, "x")).toThrow(RangeError);
  });
});

describe("the change of a use (10 point 1; plan of 6.5c, decided item 3)", () => {
  it("is the difference in the item's measure and its percent of before, half up", () => {
    expect(qtyChange("12.5", "10")).toEqual({ difference: "2.5", percent: "25.0" });
    expect(qtyChange("2", "3")).toEqual({ difference: "-1", percent: "-33.3" });
  });

  it("has no percent unless before is above 0", () => {
    expect(qtyChange("4", "0")).toEqual({ difference: "4", percent: null });
    expect(qtyChange("4", "-2")).toEqual({ difference: "6", percent: null });
  });
});
