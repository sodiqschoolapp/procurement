import { describe, expect, it } from "vitest";

import { tickOf } from "./schedule";

// build-plan 0.13 (plan, decision 5; review of the plan, correction 2): the ticks of a day are
// counted from 00:00 in Tashkent. developer-rules.md rule 10: "a test crosses midnight and the
// year end".

const at = (text: string) => new Date(text);

describe("tickOf (developer-rules.md rule 10; 13-technology.md, Scheduled jobs)", () => {
  it("a 1-minute schedule: inside, on and just before a tick", () => {
    const every = { everyMinutes: 1 };
    expect(tickOf(every, at("2026-10-14T10:00:42Z"))).toEqual(at("2026-10-14T10:00:00Z"));
    expect(tickOf(every, at("2026-10-14T10:01:00Z"))).toEqual(at("2026-10-14T10:01:00Z"));
    expect(tickOf(every, at("2026-10-14T10:00:59.999Z"))).toEqual(at("2026-10-14T10:00:00Z"));
  });

  it("a 5-minute schedule: inside, on and just before a tick", () => {
    const every = { everyMinutes: 5 };
    expect(tickOf(every, at("2026-10-14T10:07:30Z"))).toEqual(at("2026-10-14T10:05:00Z"));
    expect(tickOf(every, at("2026-10-14T10:10:00Z"))).toEqual(at("2026-10-14T10:10:00Z"));
    expect(tickOf(every, at("2026-10-14T10:09:59.999Z"))).toEqual(at("2026-10-14T10:05:00Z"));
  });

  it("a daily schedule starts at 00:00 in Tashkent, 19:00 UTC of the day before", () => {
    const daily = { everyMinutes: 1440 };
    expect(tickOf(daily, at("2026-10-14T12:00:00Z"))).toEqual(at("2026-10-13T19:00:00Z"));
    expect(tickOf(daily, at("2026-10-14T19:00:00Z"))).toEqual(at("2026-10-14T19:00:00Z"));
    expect(tickOf(daily, at("2026-10-14T18:59:59.999Z"))).toEqual(at("2026-10-13T19:00:00Z"));
  });

  it("an 8-hour schedule counts from midnight in Tashkent, not from UTC", () => {
    // 480 minutes: 00:00, 08:00 and 16:00 in Tashkent are 19:00, 03:00 and 11:00 UTC.
    const every = { everyMinutes: 480 };
    expect(tickOf(every, at("2026-10-14T02:59:00Z"))).toEqual(at("2026-10-13T19:00:00Z"));
    expect(tickOf(every, at("2026-10-14T03:00:00Z"))).toEqual(at("2026-10-14T03:00:00Z"));
    expect(tickOf(every, at("2026-10-14T12:00:00Z"))).toEqual(at("2026-10-14T11:00:00Z"));
  });

  it("crosses the year end in Tashkent", () => {
    const daily = { everyMinutes: 1440 };
    expect(tickOf(daily, at("2026-12-31T18:59:59Z"))).toEqual(at("2026-12-30T19:00:00Z"));
    expect(tickOf(daily, at("2026-12-31T19:00:01Z"))).toEqual(at("2026-12-31T19:00:00Z"));
    const hourly = { everyMinutes: 60 };
    expect(tickOf(hourly, at("2026-12-31T19:30:00Z"))).toEqual(at("2026-12-31T19:00:00Z"));
  });

  it("refuses a schedule of 0, 7, 2000 or 1.5 minutes", () => {
    for (const everyMinutes of [0, 7, 2000, 1.5, -5]) {
      expect(() => tickOf({ everyMinutes }, at("2026-10-14T10:00:00Z"))).toThrow(/Refused/);
    }
  });
});

// build-plan 8.2 (plan, "What will exist"): the nightly check at a time of day and the weekly copy
// on a weekday, both in Tashkent time (13-technology.md, Scheduled jobs and Running it: "A weekly
// copy"; developer-rules.md rule 10). 03:00 in Tashkent is 22:00 UTC of the day before.

describe("tickOf, a time of day and a weekday (build-plan 8.2; developer-rules.md rule 10)", () => {
  it("a daily time: on, just before and after the time; before it the tick is yesterday's", () => {
    const nightly = { dailyAt: "03:00" };
    expect(tickOf(nightly, at("2026-10-18T22:00:00Z"))).toEqual(at("2026-10-18T22:00:00Z"));
    expect(tickOf(nightly, at("2026-10-19T09:00:00Z"))).toEqual(at("2026-10-18T22:00:00Z"));
    expect(tickOf(nightly, at("2026-10-18T21:59:59.999Z"))).toEqual(at("2026-10-17T22:00:00Z"));
    // 00:30 in Tashkent (19:30 UTC): the new business day began, its 03:00 has not come.
    expect(tickOf(nightly, at("2026-10-18T19:30:00Z"))).toEqual(at("2026-10-17T22:00:00Z"));
  });

  it("a daily time crosses the year end in Tashkent", () => {
    const nightly = { dailyAt: "03:00" };
    expect(tickOf(nightly, at("2026-12-31T21:59:00Z"))).toEqual(at("2026-12-30T22:00:00Z"));
    expect(tickOf(nightly, at("2026-12-31T22:00:00Z"))).toEqual(at("2026-12-31T22:00:00Z"));
  });

  it("a weekly time: Sunday 04:00 in Tashkent, the latest one at or before the moment", () => {
    const weekly = { weeklyOn: 7, dailyAt: "04:00" };
    // Sunday 18 October 2026, 04:00 in Tashkent = 23:00 UTC on Saturday the 17th.
    expect(tickOf(weekly, at("2026-10-17T23:00:00Z"))).toEqual(at("2026-10-17T23:00:00Z"));
    expect(tickOf(weekly, at("2026-10-19T10:00:00Z"))).toEqual(at("2026-10-17T23:00:00Z"));
    expect(tickOf(weekly, at("2026-10-24T22:59:59Z"))).toEqual(at("2026-10-17T23:00:00Z"));
    expect(tickOf(weekly, at("2026-10-24T23:00:00Z"))).toEqual(at("2026-10-24T23:00:00Z"));
    // Sunday before 04:00 in Tashkent: last Sunday's tick.
    expect(tickOf(weekly, at("2026-10-24T20:00:00Z"))).toEqual(at("2026-10-17T23:00:00Z"));
  });

  it("a weekly time crosses the year end in Tashkent", () => {
    const weekly = { weeklyOn: 7, dailyAt: "04:00" };
    // Thursday 1 January 2027 in Tashkent: Sunday 27 December 2026.
    expect(tickOf(weekly, at("2026-12-31T20:00:00Z"))).toEqual(at("2026-12-26T23:00:00Z"));
    expect(tickOf(weekly, at("2027-01-02T23:00:00Z"))).toEqual(at("2027-01-02T23:00:00Z"));
  });

  it("a Monday schedule is not Sunday's: ISO weekdays, 1 = Monday", () => {
    const monday = { weeklyOn: 1, dailyAt: "00:00" };
    expect(tickOf(monday, at("2026-10-19T10:00:00Z"))).toEqual(at("2026-10-18T19:00:00Z"));
  });

  it("refuses a time that is not HH:MM and a weekday outside 1 to 7", () => {
    const moment = at("2026-10-14T10:00:00Z");
    for (const dailyAt of ["24:00", "3:00", "03:60", "03:00:00", ""]) {
      expect(() => tickOf({ dailyAt }, moment), dailyAt).toThrow(/Refused/);
    }
    for (const weeklyOn of [0, 8, 1.5]) {
      expect(() => tickOf({ weeklyOn, dailyAt: "04:00" }, moment), String(weeklyOn)).toThrow(
        /Refused/,
      );
    }
  });
});
