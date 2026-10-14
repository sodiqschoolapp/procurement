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
