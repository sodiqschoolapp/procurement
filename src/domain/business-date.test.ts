import { describe, expect, it } from "vitest";

import {
  BUSINESS_TIME_ZONE,
  businessDate,
  businessDayStart,
  businessMonth,
  businessTime,
  businessYear,
  isBusinessDate,
  nextBusinessDate,
} from "./business-date";

// developer-rules.md rule 10: "Timestamps are stored in UTC. Business dates use the
// Asia/Tashkent time zone." 00-definitions.md, "Business date".
describe("business date in Asia/Tashkent (developer-rules.md rule 10)", () => {
  it("names the time zone of the school", () => {
    expect(BUSINESS_TIME_ZONE).toBe("Asia/Tashkent");
  });

  it("reads 20:30 UTC on 31 December as 1 January in Tashkent", () => {
    expect(businessDate(new Date("2026-12-31T20:30:00.000Z"))).toBe("2027-01-01");
  });

  it("keeps 18:59:59.999 UTC on 31 December on 31 December: Tashkent midnight is 19:00 UTC", () => {
    expect(businessDate(new Date("2026-12-31T18:59:59.999Z"))).toBe("2026-12-31");
    expect(businessDate(new Date("2026-12-31T19:00:00.000Z"))).toBe("2027-01-01");
  });

  it("reads a midday moment as the same day", () => {
    expect(businessDate(new Date("2026-10-08T07:00:00.000Z"))).toBe("2026-10-08");
  });

  it("refuses an invalid moment instead of writing NaN into a date", () => {
    expect(() => businessDate(new Date(Number.NaN))).toThrow(/not a valid moment/);
    expect(() => businessYear(new Date(Number.NaN))).toThrow(/not a valid moment/);
  });
});

// 05-order-request-form.md rule 2: "The counter runs per branch per calendar year in Tashkent
// time"; requests-and-approval.md, "The year changes": the counter restarts with the new year.
describe("business year: the year of the order number (requests-and-approval.md, The year changes)", () => {
  it("is already the new year at 19:00 UTC on 31 December", () => {
    expect(businessYear(new Date("2026-12-31T19:00:00.000Z"))).toBe(2027);
  });

  it("is still the old year at 18:59:59.999 UTC on 31 December", () => {
    expect(businessYear(new Date("2026-12-31T18:59:59.999Z"))).toBe(2026);
  });

  it("is the old year for 20:30 UTC on 30 December", () => {
    expect(businessYear(new Date("2026-12-30T20:30:00.000Z"))).toBe(2026);
  });
});

describe("the UTC moment a business day starts (developer-rules.md rule 10)", () => {
  it("starts 1 January 2027 at 19:00 UTC on 31 December 2026", () => {
    expect(businessDayStart("2027-01-01").toISOString()).toBe("2026-12-31T19:00:00.000Z");
  });

  it("goes round: the start of a day is that day", () => {
    for (const day of ["2026-01-01", "2026-10-08", "2027-12-31", "2028-02-29"]) {
      expect(businessDate(businessDayStart(day))).toBe(day);
    }
  });

  it("ends a day one millisecond before the next one starts", () => {
    const lastMoment = new Date(businessDayStart("2027-01-01").getTime() - 1);
    expect(businessDate(lastMoment)).toBe("2026-12-31");
  });

  it("refuses a date that does not exist or is not written YYYY-MM-DD", () => {
    for (const wrong of ["2027-02-29", "2026-13-01", "2026-04-31", "08.10.2026", "2026-1-1", ""]) {
      expect(() => businessDayStart(wrong)).toThrow(/not a business date/);
    }
  });
});

// 11-screens-and-ux.md rule 10: "Time in 24 hours, Tashkent"; developer-rules.md rule 10.
describe("business time: the wall clock in Tashkent (11-screens-and-ux.md rule 10)", () => {
  it("reads 09:05 UTC as 14:05 in Tashkent", () => {
    expect(businessTime(new Date("2026-10-08T09:05:00.000Z"))).toBe("14:05");
  });

  it("writes midnight as 00:00 and the evening in 24 hours", () => {
    expect(businessTime(new Date("2026-12-31T19:00:00.000Z"))).toBe("00:00");
    expect(businessTime(new Date("2026-10-08T17:59:59.999Z"))).toBe("22:59");
  });

  it("refuses an invalid moment instead of writing NaN into a time", () => {
    expect(() => businessTime(new Date("x"))).toThrow(/not a valid moment/);
  });
});

describe("isBusinessDate: a day that exists, as YYYY-MM-DD (05 field 8; plan of 2.5a, decided item 16)", () => {
  it("takes a real day, a leap day, and a day in the past (the past is a submit check)", () => {
    expect(isBusinessDate("2031-05-01")).toBe(true);
    expect(isBusinessDate("2028-02-29")).toBe(true);
    expect(isBusinessDate("2001-01-01")).toBe(true);
  });

  it("refuses a day that does not exist, another form, and what is not text", () => {
    for (const value of [
      "2031-02-30",
      "2027-02-29",
      "2031-5-1",
      "01.05.2031",
      "",
      "2031-05-01T00:00",
    ]) {
      expect(isBusinessDate(value), value).toBe(false);
    }
    expect(isBusinessDate(null)).toBe(false);
    expect(isBusinessDate(20310501)).toBe(false);
  });
});

describe("the business date after a day: the end of a date filter (plan of 2.8, decided item 11)", () => {
  it("rolls over the end of a month, of February in a leap year and of a year", () => {
    expect(nextBusinessDate("2026-10-16")).toBe("2026-10-17");
    expect(nextBusinessDate("2026-10-31")).toBe("2026-11-01");
    expect(nextBusinessDate("2028-02-28")).toBe("2028-02-29");
    expect(nextBusinessDate("2026-12-31")).toBe("2027-01-01");
  });

  it("refuses a day that does not exist", () => {
    expect(() => nextBusinessDate("2026-02-30")).toThrow();
  });
});

describe("businessMonth: 'this month' of the home pages (developer-rules.md rule 10; plan of 6.1, decided item 6)", () => {
  it("gives the first and the last day of the month that holds the date", () => {
    expect(businessMonth("2026-10-01")).toEqual({ first: "2026-10-01", last: "2026-10-31" });
    expect(businessMonth("2026-10-31")).toEqual({ first: "2026-10-01", last: "2026-10-31" });
    expect(businessMonth("2026-11-15")).toEqual({ first: "2026-11-01", last: "2026-11-30" });
    expect(businessMonth("2026-12-31")).toEqual({ first: "2026-12-01", last: "2026-12-31" });
  });

  it("knows February of a leap year", () => {
    expect(businessMonth("2028-02-10")).toEqual({ first: "2028-02-01", last: "2028-02-29" });
    expect(businessMonth("2026-02-10")).toEqual({ first: "2026-02-01", last: "2026-02-28" });
  });

  it("reads the Tashkent day: 31 October 20:30 UTC is already 1 November", () => {
    const date = businessDate(new Date("2026-10-31T20:30:00Z"));
    expect(businessMonth(date)).toEqual({ first: "2026-11-01", last: "2026-11-30" });
  });

  it("refuses a day that does not exist", () => {
    expect(() => businessMonth("2026-02-30")).toThrow();
  });
});
