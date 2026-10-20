import { type Period, isRunning, periodBefore, periodOf } from "@/domain/analytics";
import type { BusinessDate } from "@/domain/business-date";
import type { MonthDay } from "@/domain/settings";
import type { Executor } from "@/server/authorize";
import { today } from "@/server/clock";
import { readSettings } from "@/server/settings";

import type { PeriodInput } from "./period-params";

// The dates of the period an address names, on today's Tashkent date of the injected clock
// (developer-rules.md rule 10), and of the period before (10 point 1). Read inside the caller's
// snapshot, after its authorize(). The school year is refused while `school_year_start` is empty
// (10 point 1; review of the plan of 6.3, correction 2).

/** A period the address names that cannot be read: the page falls back, the route answers 404. */
export class PeriodRefusedError extends Error {
  constructor() {
    super("Refused: not a period of the Analytics page.");
    this.name = "PeriodRefusedError";
  }
}

export type ResolvedPeriod = {
  period: Period;
  /** The period before; while the period runs, its same days (10 point 1; plan of 8.2b). */
  before: Period;
  /** Whether the period is still running, so the page says what it is compared with. */
  running: boolean;
  /** Today's Tashkent date, which the month points of a running period are compared on. */
  today: BusinessDate;
  schoolYearStart: MonthDay | null;
};

export async function resolvePeriod(
  executor: Executor,
  input: PeriodInput,
): Promise<ResolvedPeriod> {
  const { school_year_start: schoolYearStart } = await readSettings(executor);
  const day = today();
  let period: Period;
  try {
    period = periodOf(
      input.choice,
      day,
      schoolYearStart,
      input.from && input.to ? { from: input.from, to: input.to } : undefined,
    );
  } catch {
    throw new PeriodRefusedError();
  }
  return {
    period,
    before: periodBefore(period, schoolYearStart, day),
    running: isRunning(period, day),
    today: day,
    schoolYearStart,
  };
}
