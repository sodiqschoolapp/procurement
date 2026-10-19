import { businessDate, businessDayStart } from "./business-date";

// The ticks of a scheduled job (build-plan 0.13; plan of 0.13, decision 5). A tick is the moment
// a job is due; a job runs once per tick. The ticks of a day are counted from 00:00 in Tashkent
// (developer-rules.md rule 10), so a daily job starts at midnight in Tashkent and a 5-minute job
// has the same ticks on every server. Task 8.2 added a time of day (`dailyAt`, "HH:MM" in
// Tashkent) and a weekday with a time of day (`weeklyOn`, ISO: 1 = Monday … 7 = Sunday), for the
// nightly stock check and the weekly copy.

export type Schedule =
  | { everyMinutes: number }
  | { dailyAt: string }
  | { weeklyOn: number; dailyAt: string };

const MINUTES_IN_A_DAY = 1440;
const MINUTE_MS = 60_000;

const TIME_OF_DAY = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;

/** Minutes after 00:00 of a time of day "HH:MM", or null when it is not one. */
function minutesOf(time: unknown): number | null {
  const match = typeof time === "string" ? TIME_OF_DAY.exec(time) : null;
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** Refuses a schedule whose ticks would not be the same every day (or every week). */
export function checkSchedule(schedule: Schedule): void {
  if ("everyMinutes" in schedule) {
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
    return;
  }
  if (minutesOf(schedule.dailyAt) === null) {
    throw new Error(`Refused: a time of day is "HH:MM" from 00:00 to 23:59; "${schedule.dailyAt}" is not.`);
  }
  if ("weeklyOn" in schedule) {
    const { weeklyOn } = schedule;
    if (!Number.isInteger(weeklyOn) || weeklyOn < 1 || weeklyOn > 7) {
      throw new Error(`Refused: a weekday is 1 (Monday) to 7 (Sunday); ${weeklyOn} is not.`);
    }
  }
}

/** The business date some days before or after another. */
function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** The ISO weekday of a business date: 1 = Monday … 7 = Sunday. */
function weekdayOf(date: string): number {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7;
}

/** The start of the tick a moment falls in: the latest tick at or before the moment. */
export function tickOf(schedule: Schedule, moment: Date): Date {
  checkSchedule(schedule);
  const today = businessDate(moment);
  if ("everyMinutes" in schedule) {
    const dayStart = businessDayStart(today).getTime();
    const every = schedule.everyMinutes * MINUTE_MS;
    return new Date(dayStart + Math.floor((moment.getTime() - dayStart) / every) * every);
  }
  const offset = minutesOf(schedule.dailyAt)! * MINUTE_MS;
  const at = (date: string) => new Date(businessDayStart(date).getTime() + offset);
  if (!("weeklyOn" in schedule)) {
    const tick = at(today);
    return tick.getTime() <= moment.getTime() ? tick : at(shiftDate(today, -1));
  }
  const back = (weekdayOf(today) - schedule.weeklyOn + 7) % 7;
  const tick = at(shiftDate(today, -back));
  return tick.getTime() <= moment.getTime() ? tick : at(shiftDate(today, -back - 7));
}
