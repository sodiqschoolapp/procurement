import { describe, expect, it } from "vitest";

import { copyDue } from "./database-copy";

// 13-technology.md, Running it: "A weekly copy … if it fails, every active Head is told and it
// is tried again the next night" (D55 item 6; plan of 8.2b, decided items 3 and 14). June 2031:
// Sunday the 8th and the 15th.

describe("copyDue (13 Running it; plan of 8.2b)", () => {
  it("copies every Sunday, whatever came before", () => {
    expect(copyDue("2031-06-08", { on: "2031-06-07", succeeded: true }, "2031-06-07")).toBe(true);
    expect(copyDue("2031-06-15", { on: "2031-06-08", succeeded: true }, "2031-06-08")).toBe(true);
  });

  it("tries again the next night after a failed Sunday, and every night until one succeeds", () => {
    expect(copyDue("2031-06-09", { on: "2031-06-08", succeeded: false }, "2031-06-01")).toBe(true);
    expect(copyDue("2031-06-10", { on: "2031-06-09", succeeded: false }, "2031-06-01")).toBe(true);
  });

  it("copies nothing on a Monday after a good Sunday, nor the nights after a good retry", () => {
    expect(copyDue("2031-06-09", { on: "2031-06-08", succeeded: true }, "2031-06-08")).toBe(false);
    expect(copyDue("2031-06-11", { on: "2031-06-10", succeeded: true }, "2031-06-10")).toBe(false);
  });

  it("copies on any night when nothing was ever recorded (the first night of a new server)", () => {
    expect(copyDue("2031-06-11", null, null)).toBe(true);
  });

  it("copies when the last good copy is 7 days old or more: a Sunday missed while the app was down", () => {
    // A good retry on Monday the 9th; the app was down on Sunday the 15th (0.13 decision 6: no
    // catch-up of a missed tick).
    const retry = { on: "2031-06-09", succeeded: true };
    expect(copyDue("2031-06-14", retry, "2031-06-09")).toBe(false); // 5 days
    expect(copyDue("2031-06-16", retry, "2031-06-09")).toBe(true); // 7 days: the edge (review correction 1)
    expect(copyDue("2031-06-17", retry, "2031-06-09")).toBe(true); // 8 days
    // 6 days after a good Tuesday is no copy on a Monday.
    expect(copyDue("2031-06-16", { on: "2031-06-10", succeeded: true }, "2031-06-10")).toBe(false);
  });

  it("refuses a date that is not a business date", () => {
    expect(() => copyDue("2031-02-30", null, null)).toThrow(/business date/);
  });
});
