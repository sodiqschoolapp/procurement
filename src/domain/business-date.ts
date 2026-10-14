// Business dates (developer-rules.md rule 10): timestamps are stored in UTC, and the day a
// thing happened is the calendar day in Tashkent. Pure functions: the moment is always passed
// in; the current time comes from `now()` of src/server/clock.ts and never from here.

export const BUSINESS_TIME_ZONE = "Asia/Tashkent";

/** A calendar day in Tashkent, written `YYYY-MM-DD`: the text form of a PostgreSQL `date`. */
export type BusinessDate = string;

const BUSINESS_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const tashkentParts = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function refuseInvalid(moment: Date): void {
  if (Number.isNaN(moment.getTime())) {
    throw new Error("Refused: not a valid moment; a business date cannot be read from it.");
  }
}

/** The date and time a clock on a wall in Tashkent shows at this moment. */
function wallClockInTashkent(moment: Date): WallClock {
  const parts: Record<string, number> = {};
  for (const part of tashkentParts.formatToParts(moment)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year ?? Number.NaN,
    month: parts.month ?? Number.NaN,
    day: parts.day ?? Number.NaN,
    hour: parts.hour ?? Number.NaN,
    minute: parts.minute ?? Number.NaN,
    second: parts.second ?? Number.NaN,
  };
}

/** How far Tashkent's wall clock is ahead of UTC at this moment, in milliseconds. */
function offsetAt(moment: Date): number {
  const wall = wallClockInTashkent(moment);
  const wallAsUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  return wallAsUtc - (moment.getTime() - moment.getUTCMilliseconds());
}

const pad = (value: number, width: number) => String(value).padStart(width, "0");

/** The business date of a moment: the calendar day in Tashkent. */
export function businessDate(moment: Date): BusinessDate {
  refuseInvalid(moment);
  const { year, month, day } = wallClockInTashkent(moment);
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** The calendar year in Tashkent: the year of an order number (05-order-request-form.md rule 2). */
export function businessYear(moment: Date): number {
  refuseInvalid(moment);
  return wallClockInTashkent(moment).year;
}

/** The UTC moment a business date begins: 00:00 in Tashkent. For "from day … to day" filters. */
export function businessDayStart(date: BusinessDate): Date {
  const match = BUSINESS_DATE_PATTERN.exec(date);
  const [year, month, day] = match ? match.slice(1).map(Number) : [];
  const midnightAsUtc =
    year !== undefined && month !== undefined && day !== undefined
      ? Date.UTC(year, month - 1, day)
      : Number.NaN;
  const asUtc = new Date(midnightAsUtc);
  // Date.UTC rolls 30 February over into March; a day that does not exist is refused instead.
  if (Number.isNaN(midnightAsUtc) || asUtc.toISOString().slice(0, 10) !== date) {
    throw new Error(`Refused: "${date}" is not a business date (YYYY-MM-DD, a day that exists).`);
  }
  // The offset is read twice, so a change of offset near the moment would still land right.
  const first = new Date(midnightAsUtc - offsetAt(asUtc));
  return new Date(midnightAsUtc - offsetAt(first));
}
