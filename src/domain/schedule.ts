import { businessDate, businessDayStart } from "./business-date";

// The ticks of a scheduled job (build-plan 0.13; plan of 0.13, decision 5). A tick is the moment
// a job is due; a job runs once per tick. The ticks of a day are counted from 00:00 in Tashkent
// (developer-rules.md rule 10), so a daily job starts at midnight in Tashkent and a 5-minute job
// has the same ticks on every server. Only `everyMinutes` exists now; a time of day and a weekday
// come with task 8.2.

export type Schedule = { everyMinutes: number };

const MINUTES_IN_A_DAY = 1440;
const MINUTE_MS = 60_000;

/** Refuses a schedule whose ticks would not be the same every day. */
export function checkSchedule(schedule: Schedule): void {
  const { everyMinutes } = schedule;
  if (
    !Number.isInteger(everyMinutes) ||
    everyMinutes < 1 ||
    everyMinutes > MINUTES_IN_A_DAY ||
    MINUTES_IN_A_DAY % everyMinutes !== 0
  ) {
    throw new Error(
      `Refused: a job runs every n minutes, n a whole number from 1 to 1440 that divides 1440; ` +
        `${everyMinutes} is not.`,
    );
  }
}

/** The start of the tick a moment falls in: the latest tick at or before the moment. */
export function tickOf(schedule: Schedule, moment: Date): Date {
  checkSchedule(schedule);
  const dayStart = businessDayStart(businessDate(moment)).getTime();
  const every = schedule.everyMinutes * MINUTE_MS;
  return new Date(dayStart + Math.floor((moment.getTime() - dayStart) / every) * every);
}
