import {
  businessDate,
  businessDayStart,
  businessTime,
  isBusinessDate,
  type BusinessDate,
} from "@/domain/business-date";

import type { Locale } from "./locale";

// The shared formats of every screen, PDF and export (11-screens-and-ux.md rule 10):
// money as `1 250 000 so'm`, dates as `08.10.2026`, time in 24 hours in Tashkent, quantities
// without trailing zeros. Pure functions: they show what they are given and never round
// (developer-rules.md rule 6; decisions 0.5 item 5). No JavaScript float touches a value here:
// money is a bigint and a quantity is the text a numeric(14,3) column returns.

/** A no-break space: an amount is never split over two lines (decisions 0.5 item 3). */
export const NBSP = " ";

/** Groups a run of digits by three from the right: `1250000` → `1 250 000`. */
function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** Whole so'm (a bigint) with the unit word of the message files: `1 250 000 so'm`. */
export function formatMoney(amount: bigint, unit: string): string {
  if (typeof amount !== "bigint") {
    throw new Error("Refused: money is whole so'm as a bigint, never a JavaScript number.");
  }
  const sign = amount < 0n ? "-" : "";
  const digits = (amount < 0n ? -amount : amount).toString();
  return `${sign}${groupDigits(digits)}${NBSP}${unit}`;
}

/** The spaces a typed amount may hold: a space, a no-break space, a thin or narrow one. */
const AMOUNT_SPACE = /[\s\u00A0\u2009\u202F]/;
const AMOUNT_SPACES = new RegExp(AMOUNT_SPACE.source, "g");

/**
 * The text a money field holds and sends, from what was typed: the same characters without the
 * spaces of the grouping, so `1 500 000` is `1500000`. Nothing else is touched: a text that is not
 * digits stays for the field's own check to refuse, as before.
 */
export function typedAmountValue(text: string): string {
  return text.replace(AMOUNT_SPACES, "");
}

/** What a money field shows of its value: digits grouped by three (`1 500 000`), else as typed. */
export function formatTypedAmount(value: string): string {
  return /^\d+$/.test(value) ? groupDigits(value) : value;
}

/**
 * One keystroke in a money field: the value to keep and send, the text to show, and where the caret
 * goes (after as many digits as stood before it), so grouping never moves the caret back.
 */
export function retypeAmount(
  typed: string,
  caret: number,
): { value: string; shown: string; caret: number } {
  const value = typedAmountValue(typed);
  const shown = formatTypedAmount(value);
  const before = typedAmountValue(typed.slice(0, caret)).length;
  let at = 0;
  let kept = 0;
  while (at < shown.length && kept < before) {
    if (!AMOUNT_SPACE.test(shown[at]!)) kept += 1;
    at += 1;
  }
  return { value, shown, caret: at };
}

/** A moment (as its Tashkent business date) or a `YYYY-MM-DD` business date: `08.10.2026`. */
export function formatDate(value: Date | BusinessDate): string {
  let date: BusinessDate;
  if (value instanceof Date) {
    date = businessDate(value);
  } else {
    // Refuses a text that is not YYYY-MM-DD or a day that does not exist.
    businessDayStart(value);
    date = value;
  }
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}`;
}

const TYPED_DATE = /^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s*$/;

/**
 * A date typed as it is shown, `08.10.2026` (or `8.10.2026`), read back as a `YYYY-MM-DD` business
 * date; null for anything else or a day that does not exist (plan of 2.5b, the needed-by cell).
 */
export function parseTypedDate(text: string): BusinessDate | null {
  const match = TYPED_DATE.exec(text);
  if (!match) return null;
  const [, day = "", month = "", year = ""] = match;
  const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  return isBusinessDate(date) ? date : null;
}

/** The wall-clock time in Tashkent, 24 hours: `14:05`. */
export function formatTime(moment: Date): string {
  return businessTime(moment);
}

const QUANTITY_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

/** A quantity without trailing zeros: `12.500` → `12,5` in uz and ru, `12.5` in en; `1 250`. */
export function formatQuantity(value: string, locale: Locale): string {
  const match = typeof value === "string" ? QUANTITY_PATTERN.exec(value) : null;
  if (!match) {
    throw new Error(`Refused: "${String(value)}" is not a quantity (digits, an optional point).`);
  }
  const [, minus = "", whole = "", fraction = ""] = match;
  const wholeDigits = whole.replace(/^0+(?=\d)/, "");
  const fractionDigits = fraction.replace(/0+$/, "");
  const isZero = /^0$/.test(wholeDigits) && fractionDigits === "";
  const sign = isZero ? "" : minus;
  const separator = locale === "en" ? "." : ",";
  const decimals = fractionDigits === "" ? "" : `${separator}${fractionDigits}`;
  return `${sign}${groupDigits(wholeDigits)}${decimals}`;
}

export type Formatters = {
  money: (amount: bigint) => string;
  date: (value: Date | BusinessDate) => string;
  time: (moment: Date) => string;
  quantity: (value: string) => string;
};

/** The four formatters bound to a language and the translated unit word of money. */
export function bindFormatters(locale: Locale, moneyUnit: string): Formatters {
  return {
    money: (amount) => formatMoney(amount, moneyUnit),
    date: formatDate,
    time: formatTime,
    quantity: (value) => formatQuantity(value, locale),
  };
}
