import { isTestClockSet, now, setTestClock } from "@/server/clock";

// Setting the clock in a test (developer-rules.md rule 10: "Tests set the clock"). A fixed
// clock is frozen: it moves only with advanceClock. Every test starts with the real clock again
// (the reset after each test in tests/helpers/unit-setup.ts and db-file-setup.ts).

// A moment written with Z or an offset, so it is the same moment on every machine.
const MOMENT_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Fixes the clock. A text must carry `Z` or an offset: `2026-12-31T20:30:00Z`. */
export function setClock(moment: Date | string): Date {
  if (typeof moment === "string" && !MOMENT_WITH_ZONE.test(moment)) {
    throw new Error(
      `Refused: "${moment}" has no Z or offset, so it would be read in this machine's time zone. ` +
        `Write it as 2026-12-31T20:30:00Z or 2027-01-01T01:30:00+05:00.`,
    );
  }
  setTestClock(typeof moment === "string" ? new Date(moment) : moment);
  return now();
}

type Step = {
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
};

/** Moves a fixed clock forward (or back, with negative numbers). */
export function advanceClock(step: Step): Date {
  if (!isTestClockSet()) {
    throw new Error("Refused: the clock is not fixed, so it cannot be moved. Call setClock first.");
  }
  const { days = 0, hours = 0, minutes = 0, seconds = 0, milliseconds = 0 } = step;
  const by = (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000 + milliseconds;
  setTestClock(new Date(now().getTime() + by));
  return now();
}

/** Lets the clock run with the system time again. */
export function resetClock(): void {
  setTestClock(null);
}
