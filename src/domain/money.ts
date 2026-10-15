// Money as the Head types it (developer-rules.md rule 6; 08-money-and-settlement.md: whole so'm;
// 05-order-request-form.md, Line field 10: "Whole so'm, more than 0"). Pure: an amount is read
// from its digits straight into a bigint, never through a JavaScript number. src/i18n/format.ts
// stays the one formatter (formatMoney); this is its inverse for a typed amount.

/**
 * The largest amount accepted from a form: 15 digits, far below the bigint column's range, so a
 * typing slip is a field error and never PostgreSQL's out-of-range error (plan of 1.7, review
 * Should fix 3).
 */
export const MONEY_MAX = 999_999_999_999_999n;

/** The group separators an amount may carry: a space, and the no-break spaces formatMoney writes. */
const SEPARATORS = /[   ]/g;

/**
 * A typed amount of whole so'm, more than 0 and at most MONEY_MAX: "1 250 000" → 1250000n, with
 * plain, no-break (U+00A0) or narrow no-break (U+202F) spaces between groups. Anything else (a
 * sign, a decimal point or comma, a letter, an empty text, 0) is refused with null.
 */
export function parseSom(text: string): bigint | null {
  const digits = text.trim().replace(SEPARATORS, "");
  if (!/^[0-9]{1,15}$/.test(digits)) return null;
  const amount = BigInt(digits);
  return amount > 0n && amount <= MONEY_MAX ? amount : null;
}

/**
 * A typed amount of whole so'm that may be 0, as `parseSom` reads it otherwise: "0" → 0n,
 * "100 000" → 100000n. For a limit where 0 has a meaning, such as the overspend guard's amount
 * (08-money-and-settlement.md, Overspend guard: "with the amount at 0 only the percent counts").
 */
export function parseSomOrZero(text: string): bigint | null {
  const digits = text.trim().replace(SEPARATORS, "");
  if (!/^[0-9]{1,15}$/.test(digits)) return null;
  const amount = BigInt(digits);
  return amount <= MONEY_MAX ? amount : null;
}

/** A stored amount of whole so'm: a bigint, more than 0, at most MONEY_MAX. */
export function isSom(value: unknown): value is bigint {
  return typeof value === "bigint" && value > 0n && value <= MONEY_MAX;
}

/** An amount of whole so'm from 0 to MONEY_MAX: a bigint. */
export function isSomOrZero(value: unknown): value is bigint {
  return typeof value === "bigint" && value >= 0n && value <= MONEY_MAX;
}
