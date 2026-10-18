import { describe, expect, it } from "vitest";

import {
  changeAgainst,
  daysOf,
  monthBefore,
  monthInside,
  monthsOf,
  periodBefore,
  periodChoices,
  periodOf,
} from "./analytics";

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
