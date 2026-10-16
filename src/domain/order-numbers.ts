// The order number (05-order-request-form.md, Order number): branch code, two-digit year,
// four-digit counter, `CHL-26-0142`; past 9999 the counter simply grows to five digits (rule 2).
// Pure: the Submit action of src/features/orders/actions/submit.ts takes the counter value under
// the lock of its `number_counters` row and asks this for the text (rule 5); the database CHECK
// `orders_number_check` holds the same shape as its last defence.

import { isBranchCode } from "./branches";

/** The shortest counter: four digits, `0001` (05 Order number 2). */
const COUNTER_WIDTH = 4;

/**
 * The number of an order: `orderNumber("CHL", 2026, 142)` is `CHL-26-0142`. `year` is the
 * calendar year in Tashkent of the submit (`businessYear()`), written with its last two digits;
 * `value` is the counter, from 1. Anything else is a RangeError: a wrong number is never made.
 */
export function orderNumber(code: string, year: number, value: number): string {
  if (!isBranchCode(code)) throw new RangeError(`An order number has the branch code "${code}".`);
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new RangeError(`An order number has the year ${year}.`);
  }
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`An order number has the counter ${value}.`);
  }
  const yy = String(year % 100).padStart(2, "0");
  return `${code}-${yy}-${String(value).padStart(COUNTER_WIDTH, "0")}`;
}
