import { type BusinessDate, businessMonth, isBusinessDate } from "./business-date";
import { Exact, QUANTITY, quantityOf } from "./order-totals";
import { actualGoods, unitPriceOf } from "./purchases";
import type { MonthDay } from "./settings";
import { isLow } from "./stock";

// The period of the Analytics pages and the change of a number against the period before
// (10-notifications-analytics-reports.md, Analytics page per role, point 1; build-plan 6.3).
// Pure: today is the Tashkent business date of `today()` of the injected clock, passed in by the
// caller (developer-rules.md rule 10).
//
// - "This quarter" is the calendar quarter holding today (open question 14; plan of 6.3, decided
//   item 2, Look first).
// - The period before is the whole period of the same kind just before; custom dates of n days
//   compare with the n days just before (decided item 3, Look first). While this month, this
//   quarter or this school year is still running, it is compared with the same number of days at
//   the start of the period before, cut at its end (10 point 1; D55 item 10; plan of 8.2b,
//   decided item 2, Look first); so is the point of the month holding today.
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

/** The choices that can hold today: a period of one of them is still running while it does. */
const RUNNING_CHOICES: readonly PeriodChoice[] = ["this_month", "this_quarter", "school_year"];

/** Whether a period is still running on a day (10 point 1): last month and custom dates never. */
export function isRunning(period: Period, today: BusinessDate): boolean {
  refuseDate(today);
  return RUNNING_CHOICES.includes(period.choice) && period.first <= today && today <= period.last;
}

/**
 * "The same number of days at the start of the period before" (10 point 1; D55 item 10): as many
 * days of `before` from its first as `range` has run from its first to today, never past the end
 * of `before` (on 31 March, the whole of February).
 */
export function sameDaysBefore(
  range: DateRange,
  before: DateRange,
  today: BusinessDate,
): DateRange {
  const last = shiftDays(before.first, daysOf({ first: range.first, last: today }) - 1);
  return { first: before.first, last: last < before.last ? last : before.last };
}

/**
 * The period before: the same kind just before, or as many days just before custom dates; while
 * the period is still running, the same days at the start of it.
 */
export function periodBefore(
  period: Period,
  schoolYearStart: MonthDay | null,
  today: BusinessDate,
): Period {
  const whole = wholePeriodBefore(period, schoolYearStart);
  return isRunning(period, today) ? { ...whole, ...sameDaysBefore(period, whole, today) } : whole;
}

function wholePeriodBefore(period: Period, schoolYearStart: MonthDay | null): Period {
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

/**
 * The days a month's point is compared with when they are not the whole month before it: the
 * point of the month holding today, in a period still running, against the same days at the
 * start of the month before (10 point 1: "every number"; D55 item 10, which reverses 6.3 decided
 * item 6 for it). `null` for every other point: it keeps the whole month before.
 */
export function runningMonthBefore(
  period: Period,
  month: MonthKey,
  today: BusinessDate,
): DateRange | null {
  if (!isRunning(period, today) || month !== monthOf(today)) return null;
  return sameDaysBefore(
    businessMonth(`${month}-01`),
    businessMonth(`${monthBefore(month)}-01`),
    today,
  );
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

/**
 * The 90 days of "biggest price rises in the last 90 days" (10 Head, Prices) and of "items with no
 * movement for 90 days" (10 Head, Warehouse): fixed by the spec, not the period.
 */
export const NINETY_DAYS = 90;

/**
 * The first day of the 90: today − 89, so today and the 89 days before it, as
 * `recentPurchaseSince()` of ./prices.ts counts 90 days (plan of 6.4b, decided item 4; plan of
 * 6.4d, decided item 7; both Look first). One function for both blocks (developer-rules.md rule 1).
 */
export function ninetyDaysSince(today: BusinessDate): BusinessDate {
  return shiftDays(today, -(NINETY_DAYS - 1));
}

/**
 * The average of `count` stays of `totalSeconds` together, in clock hours, half up to one decimal
 * (10 Head, Approval speed: "Average hours at each step"; plan of 6.4b, decided item 7, Look
 * first); `null` for no stay. Any set of stays (one branch's, all branches') is averaged from its
 * own sum and count, never as a mean of means (review of the plan, correction 2).
 */
export function averageHours(totalSeconds: bigint, count: number): string | null {
  return averageIn(totalSeconds, count, 3600);
}

/**
 * The average of `count` settlements of `totalSeconds` together, in days of 86 400 seconds, half
 * up to one decimal, the rounding of `averageHours()` (10 Finance, Settlement speed: "Average days
 * from 'Send to settlement' to Closed"; plan of 6.6b, decided item 3, Look first); `null` for no
 * settlement. Each set from its own sum and count, as `averageHours()`.
 */
export function averageDays(totalSeconds: bigint, count: number): string | null {
  return averageIn(totalSeconds, count, 86_400);
}

/** Σ seconds ÷ (count × unit), half up to one decimal: the one rounding of both averages. */
function averageIn(totalSeconds: bigint, count: number, unit: number): string | null {
  if (typeof totalSeconds !== "bigint" || totalSeconds < 0n) {
    throw new RangeError("Seconds are a whole number (bigint), 0 or more.");
  }
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError(`A count of stays is 0 or more, not ${count}.`);
  }
  if (count === 0) return null;
  return new Exact(totalSeconds.toString())
    .dividedBy(count * unit)
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

/**
 * The change of a department's use, issued − returned, which can be below 0 when returns of
 * earlier issues pass the period's issues (10 Head, Warehouse: "use by department"; plan of 6.4d,
 * decided item 4, Look first): `changeAgainst()` while the period before is above 0; `null`
 * otherwise, and the page writes the difference in so'm only, as a signed average's
 * (`changeAgainst()`'s percent reads backwards on a base below 0).
 */
export function useChange(used: bigint, before: bigint): Change | null {
  return before > 0n ? changeAgainst(used, before) : null;
}

// The Manager's My estimates block (10 Analytics, Manager: "Difference between planned and actual
// price per product, to help estimate better next time"; build-plan 6.5b).

/** One purchase record of an order: its quantity, its price, its stored `actualGoods()`. */
export type EstimateLine = { qty: string; unitPrice: bigint; goods: bigint; plannedPrice: bigint };

export type EstimateGap = {
  /** The records counted: a gift (price 0) is left out. */
  records: number;
  qty: string;
  plannedGoods: bigint;
  goods: bigint;
  plannedPrice: bigint | null;
  actualPrice: bigint | null;
  /** The shown planned price − the shown actual price, 08's sign: above 0 is paid less. */
  difference: bigint | null;
  /** (Σ planned goods − Σ goods) ÷ Σ planned goods, half up to one decimal; `null` for none. */
  percent: string | null;
};

/**
 * The plan's price against the price paid over one set of records (plan of 6.5b, decided item 4,
 * Look first; review of the plan, correction 1). A record's planned goods are its quantity at its
 * order's planned price, rounded once per record as 08 rounds goods (`actualGoods()`); both prices
 * are `unitPriceOf()` of the sums on the same quantities, never an average of averages; the
 * difference has the sign of 08's Difference (planned − actual); the percent is of the sums, never
 * of the rounded prices. A gift is left out of every price number (plan of 6.4b, decided item 1).
 */
export function estimateGap(lines: readonly EstimateLine[]): EstimateGap {
  let records = 0;
  let qty = new Exact(0);
  let plannedGoods = 0n;
  let goods = 0n;
  for (const line of lines) {
    if (typeof line.goods !== "bigint" || line.goods < 0n) {
      throw new RangeError("Goods are whole so'm (bigint), 0 or more.");
    }
    if (typeof line.plannedPrice !== "bigint" || line.plannedPrice <= 0n) {
      throw new RangeError("A planned price is whole so'm (bigint), above 0.");
    }
    if (line.unitPrice === 0n) continue;
    records += 1;
    qty = qty.plus(quantityOf(line.qty));
    plannedGoods += actualGoods([
      { qty: line.qty, unitPrice: line.plannedPrice, extras: [], isCancelled: false },
    ]);
    goods += line.goods;
  }
  const units = qty.toFixed();
  const plannedPrice = unitPriceOf(plannedGoods, units);
  const actualPrice = unitPriceOf(goods, units);
  const percent =
    plannedGoods === 0n
      ? null
      : new Exact((plannedGoods - goods).toString())
          .times(100)
          .dividedBy(plannedGoods.toString())
          .toDecimalPlaces(1, Exact.ROUND_HALF_UP)
          .toFixed(1);
  return {
    records,
    qty: units,
    plannedGoods,
    goods,
    plannedPrice,
    actualPrice,
    difference: plannedPrice === null || actualPrice === null ? null : plannedPrice - actualPrice,
    percent,
  };
}

// The Manager's Stock planning block (10 Analytics, Manager: "Use of each item per month; 'runs
// out in about 12 days' at the current rate; low stock; suggested order quantity"; build-plan
// 6.5c). Quantities are numeric(14,3) text in the item's own measure; a use is issues − returns,
// which can be below 0 when returns of earlier issues pass the issues.

/** numeric(14,3) with a sign: a use, Σ issues − Σ returns (plan of 6.5c, decided item 2). */
const USE = /^-?[0-9]{1,14}(\.[0-9]{1,3})?$/;

function signedUseOf(text: string): InstanceType<typeof Exact> {
  if (!USE.test(text)) throw new RangeError(`A use is "${text}": not a signed numeric(14,3)`);
  return new Exact(text);
}

function onHandOf(text: string): InstanceType<typeof Exact> {
  if (!QUANTITY.test(text)) throw new RangeError(`A stock is "${text}": not numeric(14,3)`);
  return new Exact(text);
}

/** The days of the rate behind "runs out in" and the suggested quantity (10: "the last 90 days"). */
export const RATE_DAYS = NINETY_DAYS;

/** The days of use a suggested order covers on top of the minimum (plan of 6.5c, decided item 1). */
export const COVER_DAYS = 30;

/**
 * "Runs out in" (00-definitions: "Current stock divided by the average daily issues of the last
 * 90 days"; plan of 6.5c, decided item 2, Look first): on hand ÷ (the use of the 90 days that end
 * today ÷ 90), in whole days half up (CLAUDE.md rule 6). `null` while that use is 0 or below: at
 * no rate the stock never runs out, stock 0 included; 0 when on hand is 0 and there is use.
 */
export function runsOutIn(onHand: string, used: string): number | null {
  const stock = onHandOf(onHand);
  const use = signedUseOf(used);
  if (use.lte(0)) return null;
  return stock.times(RATE_DAYS).dividedBy(use).toDecimalPlaces(0, Exact.ROUND_HALF_UP).toNumber();
}

/**
 * The suggested order quantity (open question 15; plan of 6.5c, decided item 1, Look first; review
 * of the plan, correction 1): what lasts 30 days at the rate of the last 90 days, on top of the
 * minimum, less the stock on hand, `rate × 30 + (minimum ?? 0) − on hand`, half up to a whole unit;
 * a net rate below 0 counts as 0; never below 0, and at least 1 for a Low item (`isLow()`, 09 Low
 * stock: "at its minimum or below"), so the order lifts it above its minimum. Whole units as text.
 */
export function suggestedQuantity(onHand: string, minimum: string | null, used: string): string {
  const stock = onHandOf(onHand);
  const use = Exact.max(signedUseOf(used), 0);
  const floor = minimum === null ? new Exact(0) : onHandOf(minimum);
  const wanted = use
    .times(COVER_DAYS)
    .dividedBy(RATE_DAYS)
    .plus(floor)
    .minus(stock)
    .toDecimalPlaces(0, Exact.ROUND_HALF_UP);
  const least = isLow(onHand, minimum) ? 1 : 0;
  return Exact.max(wanted, least).toFixed(0);
}

/** A use's change: the difference in the item's measure, and its percent while before is above 0. */
export type QtyChange = {
  /** Now − before, numeric(14,3) text with a sign. */
  difference: string;
  /** The difference as a percent of before, one decimal, half up; `null` unless before > 0. */
  percent: string | null;
};

/**
 * The change of an item's use against the month or the period before (10 point 1; plan of 6.5c,
 * decided item 3, Look first): as `useChange()` for so'm, a percent only on a base above 0 (a
 * percent reads backwards on a base below 0), else the difference only.
 */
export function qtyChange(now: string, before: string): QtyChange {
  const was = signedUseOf(before);
  const difference = signedUseOf(now).minus(was);
  const percent = was.gt(0)
    ? difference.times(100).dividedBy(was).toDecimalPlaces(1, Exact.ROUND_HALF_UP).toFixed(1)
    : null;
  return { difference: difference.toFixed(), percent };
}

/**
 * The age bands of Finance's "money with managers by age" (10 Finance, Cash: "up to 7 days, 8 to
 * 30 days, over 30 days"; plan of 6.6a, decided item 3, Look first). `upTo` is the band's last day.
 */
export const CASH_AGE_BANDS = [
  { band: "week", upTo: 7 },
  { band: "month", upTo: 30 },
  { band: "older", upTo: null },
] as const;
export type CashAgeBand = (typeof CASH_AGE_BANDS)[number]["band"];
export const CASH_AGE_BAND_KEYS = CASH_AGE_BANDS.map((each) => each.band) as CashAgeBand[];

/**
 * The band of an order whose cash has been out `days` days (`daysOf({ first: since, last: today })
 * − 1`, as 6.4c counts "held for"): 0 to 7 is "up to 7 days", 8 to 30, then "over 30 days". A
 * `since` after today (an action dated ahead) is below 0 days and lands in the first band (review
 * of the plan, Should fix 4).
 */
export function cashAgeBand(days: number): CashAgeBand {
  if (!Number.isSafeInteger(days)) throw new RangeError(`Days are a whole number, not ${days}.`);
  for (const { band, upTo } of CASH_AGE_BANDS) {
    if (upTo === null || days <= upTo) return band;
  }
  return "older";
}
