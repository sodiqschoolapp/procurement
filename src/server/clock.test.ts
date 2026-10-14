import { afterEach, describe, expect, it, vi } from "vitest";

import { advanceClock, resetClock, setClock } from "../../tests/helpers/clock";
import { now, setTestClock, today } from "./clock";

// developer-rules.md rule 10, "Where each rule is enforced": "One clock provider, injected";
// proved by "Tests set the clock; a test crosses midnight and the year end".
describe("the clock (developer-rules.md rule 10)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is set by a test and read back", () => {
    setClock("2026-12-31T20:30:00Z");

    expect(now().toISOString()).toBe("2026-12-31T20:30:00.000Z");
    expect(today()).toBe("2027-01-01");
  });

  it("takes a moment written with an offset as the same moment", () => {
    setClock("2027-01-01T01:30:00+05:00");

    expect(now().toISOString()).toBe("2026-12-31T20:30:00.000Z");
  });

  it("refuses a moment written without Z or an offset: it would differ between machines", () => {
    expect(() => setClock("2026-12-31T20:30:00")).toThrow(/no Z or offset/);
    expect(() => setClock("2026-12-31")).toThrow(/no Z or offset/);
  });

  it("refuses an invalid moment", () => {
    expect(() => setClock(new Date(Number.NaN))).toThrow(/invalid moment/);
  });

  it("does not move when the Date it gave out is changed", () => {
    setClock("2026-10-08T07:00:00Z");

    now().setUTCFullYear(2030);

    expect(now().toISOString()).toBe("2026-10-08T07:00:00.000Z");
  });

  it("stays frozen until it is moved", () => {
    setClock("2026-10-08T07:00:00Z");

    expect(now().getTime()).toBe(now().getTime());
  });

  it("crosses midnight and the year end when moved 24 hours and 1 minute", () => {
    setClock("2026-12-31T18:30:00Z");
    expect(today()).toBe("2026-12-31");

    advanceClock({ hours: 24, minutes: 1 });

    expect(now().toISOString()).toBe("2027-01-01T18:31:00.000Z");
    expect(today()).toBe("2027-01-01");
  });

  it("refuses to move a clock that is not fixed: a silent no-op would hide a missing move", () => {
    expect(() => advanceClock({ hours: 1 })).toThrow(/not fixed/);
  });

  it("runs with the system time again after a reset", () => {
    setClock("2001-01-01T00:00:00Z");

    resetClock();

    expect(now().getUTCFullYear()).not.toBe(2001);
  });

  it("cannot be set in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => setTestClock(new Date("2026-10-08T07:00:00Z"))).toThrow(/production/);
  });
});

describe("a fixed clock does not leak into the next test (tests/helpers/unit-setup.ts)", () => {
  it("is fixed by the first test", () => {
    setClock("2001-01-01T00:00:00Z");
    expect(now().getUTCFullYear()).toBe(2001);
  });

  it("is running again in the second test", () => {
    expect(now().getUTCFullYear()).not.toBe(2001);
  });
});
