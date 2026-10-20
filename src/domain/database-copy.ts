import { type BusinessDate, isBusinessDate } from "./business-date";

// When the weekly copy of the database runs (13-technology.md, Running it: "A weekly copy is also
// saved to R2, in a bucket of its own; if it fails, every active Head is told and it is tried
// again the next night"; D55 item 6; build-plan 8.2b). The job `database_copy` wakes every night
// at 04:00 in Tashkent and asks this function, with the newest attempts it recorded (plan of
// 8.2b, decided items 3 and 14). Pure: the dates are the Tashkent dates of the job's ticks.

/** One recorded attempt: the Tashkent date of its tick, and whether it succeeded. */
export type CopyAttempt = { on: BusinessDate; succeeded: boolean };

/** A copy at least this often: a Sunday missed while the app was down is caught up. */
export const COPY_EVERY_DAYS = 7;

/** The ISO weekday of a date: 1 = Monday … 7 = Sunday. */
function weekdayOf(date: BusinessDate): number {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7;
}

function daysBetween(first: BusinessDate, last: BusinessDate): number {
  const utc = (date: BusinessDate) => {
    const [year, month, day] = date.split("-").map(Number) as [number, number, number];
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((utc(last) - utc(first)) / 86_400_000);
}

/**
 * Whether the night of `tick` makes a copy: on a Sunday; the night after a failed attempt, until
 * one succeeds; when no copy was ever made; and when the last good copy is 7 days old or more.
 * @param tick the Tashkent date of this night's tick
 * @param newest the newest recorded attempt, or null when there is none
 * @param lastGood the Tashkent date of the newest successful attempt, or null
 */
export function copyDue(
  tick: BusinessDate,
  newest: CopyAttempt | null,
  lastGood: BusinessDate | null,
): boolean {
  for (const date of [tick, newest?.on, lastGood]) {
    if (date !== undefined && date !== null && !isBusinessDate(date)) {
      throw new Error(`Refused: "${date}" is not a business date (YYYY-MM-DD).`);
    }
  }
  if (weekdayOf(tick) === 7) return true;
  if (newest === null || !newest.succeeded) return true;
  return lastGood === null || daysBetween(lastGood, tick) >= COPY_EVERY_DAYS;
}
