import { type BusinessDate, businessMonth, isBusinessDate } from "./business-date";
import { Exact } from "./order-totals";
import type { MonthDay } from "./settings";

// The period of the Analytics pages and the change of a number against the period before
// (10-notifications-analytics-reports.md, Analytics page per role, point 1; build-plan 6.3).
// Pure: today is the Tashkent business date of `today()` of the injected clock, passed in by the
// caller (developer-rules.md rule 10).
//
// - "This quarter" is the calendar quarter holding today (open question 14; plan of 6.3, decided
//   item 2, Look first).
// - The period before is the whole period of the same kind just before; custom dates of n days
//   compare with the n days just before (decided item 3, Look first).
// - The school year runs from its first day (`school_year_start`) to the day before the next one;
//   the choice is absent while the setting is empty (10 point 1; decided item 8).
// - A change is the difference in so'm and the percent of the period before, half up to one
//   decimal, none when the period before is 0 (decided item 4, Look first).

export const PERIOD_CHOICES = [
  "this_month",
  "last_month",
  "this_quarter",
  "school_year",
  "custom",
] as const;
export type PeriodChoice = (typeof PERIOD_CHOICES)[number];

/** A run of business dates, both ends included. */
export type DateRange = { first: BusinessDate; last: BusinessDate };

/** A chosen period: its kind and its dates. */
export type Period = DateRange & { choice: PeriodChoice };

/** A calendar month, written `YYYY-MM`. */
export type MonthKey = string;

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

function refuseDate(date: BusinessDate): void {
  if (!isBusinessDate(date)) {
    throw new Error(`Refused: "${date}" is not a business date (YYYY-MM-DD, a day that exists).`);
  }
}

function partsOf(date: BusinessDate): [number, number, number] {
  refuseDate(date);
  return date.split("-").map(Number) as [number, number, number];
}

const iso = (utc: number) => new Date(utc).toISOString().slice(0, 10);

/** The date `days` days after (or, below 0, before) a business date. */
export function shiftDays(date: BusinessDate, days: number): BusinessDate {
  const [year, month, day] = partsOf(date);
  return iso(Date.UTC(year, month - 1, day + days));
}

/** The number of days of a range, both ends counted. */
export function daysOf(range: DateRange): number {
  const [y1, m1, d1] = partsOf(range.first);
  const [y2, m2, d2] = partsOf(range.last);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000) + 1;
}

function quarterOf(date: BusinessDate): DateRange {
  const [year, month] = partsOf(date);
  const firstMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return {
    first: iso(Date.UTC(year, firstMonth - 1, 1)),
    // Day 0 of the month after the quarter is its last day.
    last: iso(Date.UTC(year, firstMonth + 2, 0)),
  };
}

function schoolYearOf(date: BusinessDate, start: MonthDay): DateRange {
  const [year] = partsOf(date);
  const startIn = (y: number) => iso(Date.UTC(y, start.month - 1, start.day));
  const startYear = startIn(year) <= date ? year : year - 1;
  return { first: startIn(startYear), last: shiftDays(startIn(startYear + 1), -1) };
}

/** The choices offered: the school year only once its first day is set (10 point 1). */
export function periodChoices(schoolYearStart: MonthDay | null): PeriodChoice[] {
  return PERIOD_CHOICES.filter((choice) => choice !== "school_year" || schoolYearStart !== null);
}

/**
 * The dates of a choice on a given day. Throws for the school year while it is not set, and for
 * custom dates that are not dates or whose first comes after the last.
 */
export function periodOf(
  choice: PeriodChoice,
  today: BusinessDate,
  schoolYearStart: MonthDay | null,
  custom?: { from: string; to: string },
): Period {
  refuseDate(today);
  switch (choice) {
    case "this_month":
      return { choice, ...businessMonth(today) };
    case "last_month":
      return { choice, ...businessMonth(shiftDays(businessMonth(today).first, -1)) };
    case "this_quarter":
      return { choice, ...quarterOf(today) };
    case "school_year":
      if (!schoolYearStart) {
        throw new Error("Refused: the school year is not set, so it is not a period choice.");
      }
      return { choice, ...schoolYearOf(today, schoolYearStart) };
    case "custom": {
      if (!custom || !isBusinessDate(custom.from) || !isBusinessDate(custom.to)) {
        throw new Error("Refused: custom dates need a first and a last business date.");
      }
      if (custom.from > custom.to) {
        throw new Error("Refused: the first date of a period comes after its last.");
      }
      return { choice, first: custom.from, last: custom.to };
    }
  }
}

/** The period before: the same kind just before, or as many days just before custom dates. */
export function periodBefore(period: Period, schoolYearStart: MonthDay | null): Period {
  const dayBefore = shiftDays(period.first, -1);
  switch (period.choice) {
    case "this_month":
    case "last_month":
      return { choice: period.choice, ...businessMonth(dayBefore) };
    case "this_quarter":
      return { choice: period.choice, ...quarterOf(dayBefore) };
    case "school_year":
      if (!schoolYearStart) {
        throw new Error("Refused: the school year is not set, so it is not a period choice.");
      }
      return { choice: period.choice, ...schoolYearOf(dayBefore, schoolYearStart) };
    case "custom":
      return {
        choice: period.choice,
        first: shiftDays(period.first, -daysOf(period)),
        last: dayBefore,
      };
  }
}

/** Whether a value is a month written `YYYY-MM`. */
export function isMonthKey(value: unknown): value is MonthKey {
  return typeof value === "string" && MONTH_KEY.test(value);
}

/** The calendar month of a date. */
export function monthOf(date: BusinessDate): MonthKey {
  refuseDate(date);
  return date.slice(0, 7);
}

/** The month before a month. */
export function monthBefore(month: MonthKey): MonthKey {
  if (!isMonthKey(month)) throw new Error(`Refused: "${month}" is not a month (YYYY-MM).`);
  return monthOf(shiftDays(`${month}-01`, -1));
}

/** The months a range touches, in order: the points of a chart by month. */
export function monthsOf(range: DateRange): MonthKey[] {
  const months: MonthKey[] = [];
  const last = monthOf(range.last);
  for (let month = monthOf(range.first); month <= last;) {
    months.push(month);
    month = monthOf(shiftDays(businessMonth(`${month}-01`).last, 1));
  }
  return months;
}

/** The days of a month inside a range: what a month's point of a chart counts. */
export function monthInside(month: MonthKey, range: DateRange): DateRange | null {
  if (!isMonthKey(month)) throw new Error(`Refused: "${month}" is not a month (YYYY-MM).`);
  const whole = businessMonth(`${month}-01`);
  const first = whole.first > range.first ? whole.first : range.first;
  const last = whole.last < range.last ? whole.last : range.last;
  return first <= last ? { first, last } : null;
}

/** A number's change against the period before. */
export type Change = {
  /** Now − before, whole so'm. */
  difference: bigint;
  /** The difference as a percent of before, one decimal, half up; `null` when before is 0. */
  percent: string | null;
};

export function changeAgainst(now: bigint, before: bigint): Change {
  if (typeof now !== "bigint" || typeof before !== "bigint") {
    throw new RangeError("A change compares whole so'm (bigint).");
  }
  const difference = now - before;
  if (before === 0n) return { difference, percent: null };
  // ROUND_HALF_UP of decimal.js rounds half away from zero: −12.35 → −12.4 (decided item 4).
  const percent = new Exact(difference.toString())
    .times(100)
    .dividedBy(before.toString())
    .toDecimalPlaces(1, Exact.ROUND_HALF_UP)
    .toFixed(1);
  return { difference, percent };
}

/**
 * A count's share of a whole as a percent, half up to one decimal (10 Analytics, Head, Plan vs
 * actual: "Share of orders ending green, orange and red"; plan of 6.4, decided item 7); `null`
 * when the whole is 0.
 */
export function shareOf(part: number, whole: number): string | null {
  if (!Number.isSafeInteger(part) || !Number.isSafeInteger(whole) || part < 0 || part > whole) {
    throw new RangeError(`A share is a count of 0 to ${whole}, not ${part}.`);
  }
  if (whole === 0) return null;
  return new Exact(part)
    .times(100)
    .dividedBy(whole)
    .toDecimalPlaces(1, Exact.ROUND_HALF_UP)
    .toFixed(1);
}

/**
 * The change of a share against the period before, in percentage points, half up (away from
 * zero) to one decimal (10 point 1; plan of 6.4, decided item 7); `null` when either has none.
 */
export function shareChange(now: string | null, before: string | null): string | null {
  if (now === null || before === null) return null;
  return new Exact(now).minus(before).toDecimalPlaces(1, Exact.ROUND_HALF_UP).toFixed(1);
}

// The Prices and Approval speed blocks of the Head's page (10 Analytics, Head; build-plan 6.4b).

/** "Biggest price rises in the last 90 days" (10 Head, Prices): fixed by the spec, not the period. */
export const PRICE_RISE_DAYS = 90;

/**
 * The first trip date of the 90 days: today − 89, so today and the 89 days before it, as
 * `recentPurchaseSince()` of ./prices.ts counts 90 days (plan of 6.4b, decided item 4, Look first).
 */
export function priceRiseSince(today: BusinessDate): BusinessDate {
  return shiftDays(today, -(PRICE_RISE_DAYS - 1));
}

/**
 * The average of `count` stays of `totalSeconds` together, in clock hours, half up to one decimal
 * (10 Head, Approval speed: "Average hours at each step"; plan of 6.4b, decided item 7, Look
 * first); `null` for no stay. Any set of stays (one branch's, all branches') is averaged from its
 * own sum and count, never as a mean of means (review of the plan, correction 2).
 */
export function averageHours(totalSeconds: bigint, count: number): string | null {
  if (typeof totalSeconds !== "bigint" || totalSeconds < 0n) {
    throw new RangeError("Seconds are a whole number (bigint), 0 or more.");
  }
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError(`A count of stays is 0 or more, not ${count}.`);
  }
  if (count === 0) return null;
  return new Exact(totalSeconds.toString())
    .dividedBy(count * 3600)
    .toDecimalPlaces(1, Exact.ROUND_HALF_UP)
    .toFixed(1);
}

/**
 * The age groups of "Orders waiting now, by age" (10 Head, Approval speed; plan of 6.4b, decided
 * item 8, Look first): fixed analytics groups, not the reminder settings. `upTo` is the group's
 * last age in hours, its edge strict as `stuckBefore()` counts: exactly 48 hours is still "24 to
 * 48 hours", 48 hours and one second is "2 to 7 days".
 */
export const WAITING_GROUPS = [
  { group: "day", upTo: 24 },
  { group: "twoDays", upTo: 48 },
  { group: "week", upTo: 7 * 24 },
  { group: "older", upTo: null },
] as const;
export type WaitingGroup = (typeof WAITING_GROUPS)[number]["group"];
export const WAITING_GROUP_KEYS = WAITING_GROUPS.map((each) => each.group) as WaitingGroup[];

const HOUR_MS = 3_600_000;

/** The group of an order that entered its Waiting step at `enteredAt`, at `now` of the clock. */
export function waitingGroup(enteredAt: Date, now: Date): WaitingGroup {
  const waited = now.getTime() - enteredAt.getTime();
  for (const { group, upTo } of WAITING_GROUPS) {
    if (upTo === null || waited <= upTo * HOUR_MS) return group;
  }
  return "older";
}

/**
 * The key a free-text reason is grouped by (06 rule 3: a reason is free text; plan of 6.4b,
 * decided item 10, Look first): trimmed, every run of white space made one space, lower case.
 */
export function reasonKey(reason: string): string {
  return reason.trim().replace(/\s+/gu, " ").toLowerCase();
}

// The Managers block of the Head's page (10 Analytics, Head; build-plan 6.4c).

/**
 * The mean of `count` amounts that add up to `total`, rounded once half up to whole so'm (10 Head,
 * Managers: "average difference from plan"; 08 Rounding; plan of 6.4c, decided item 3, Look
 * first): half up is away from zero, so −2.5 is −3, as 08's round and changeAgainst() do. `null`
 * for no amount. SQL adds the stored whole so'm; the one division is here.
 */
export function averageSom(total: bigint, count: number): bigint | null {
  if (typeof total !== "bigint") throw new RangeError("An average is of whole so'm (bigint).");
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError(`A count of amounts is 0 or more, not ${count}.`);
  }
  if (count === 0) return null;
  return BigInt(
    new Exact(total.toString()).dividedBy(count).toDecimalPlaces(0, Exact.ROUND_HALF_UP).toFixed(0),
  );
}
