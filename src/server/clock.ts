import { businessDate, type BusinessDate } from "@/domain/business-date";

// The one clock of the app (developer-rules.md rule 10: "One clock provider, injected").
// This is the only file that reads the system time; the lint rule of eslint.config.mjs refuses
// `new Date()`, `Date.now`, `Date()`, `Temporal.Now` and `.defaultNow()` everywhere else.
// A test fixes the clock with the helpers of tests/helpers/clock.ts.

let testMoment: number | null = null;

/** The current moment. A fresh `Date` on every call: changing it moves nothing. */
export function now(): Date {
  return testMoment === null ? new Date() : new Date(testMoment);
}

/** The business date of now: the calendar day in Tashkent. */
export function today(): BusinessDate {
  return businessDate(now());
}

/** For tests only: fixes the clock at a moment, or lets it run again with `null`. */
export function setTestClock(moment: Date | null): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refused: the clock cannot be set in production.");
  }
  if (moment !== null && Number.isNaN(moment.getTime())) {
    throw new Error("Refused: the clock cannot be set to an invalid moment.");
  }
  testMoment = moment === null ? null : moment.getTime();
}

/** For tests only: whether a test has fixed the clock. */
export function isTestClockSet(): boolean {
  return testMoment !== null;
}
