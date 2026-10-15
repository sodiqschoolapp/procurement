// The planned money of orders (08-money-and-settlement.md, Numbers the system calculates: Planned
// total; 05-order-request-form.md, Order fields 10 to 16 and the totals under the list; Ticking
// and filters: Price hint). Every screen, file and action that shows or checks these numbers
// calls this module: the formula lives once (developer-rules.md rule 1).
//
// Money enters and leaves as whole so'm in bigint; a quantity enters as the decimal text that
// numeric(14,3) gives. Both meet only inside a private decimal.js clone, never as a JavaScript
// number (developer-rules.md rule 6; 13-technology.md, Numbers). Rounding is half up, to whole
// so'm (08, the paragraph under the table).

import Decimal from "decimal.js";

import { PAYMENT_TYPES, type PaymentType } from "./payment-types";
import { isPaymentType, isPercent } from "./settings";

/**
 * Our own decimal.js: the global `Decimal` keeps 20 significant digits, which would cut an
 * 11 + 15 + 3 digit product silently, and any other code could change its settings (plan of
 * 2.2, decision 9).
 */
const Exact = Decimal.clone({ precision: 64, rounding: Decimal.ROUND_HALF_UP });

/** numeric(14,3): up to 11 whole digits and up to 3 decimals, no sign, no exponent, no spaces. */
const QUANTITY = /^[0-9]{1,11}(\.[0-9]{1,3})?$/;

/** The plan of one order as these functions read it (05 fields 10 to 13). */
export type OrderPlan = {
  /** The planned quantity as decimal text: "100", "2.125", "100.000". More than 0. */
  quantity: string;
  /** The planned price per unit in whole so'm, more than 0. */
  price: bigint;
  /** The planned extra costs in whole so'm, each more than 0; none is an empty list. */
  extras: readonly bigint[];
  paymentType: PaymentType;
};

/** The totals of a set of orders (05, the totals under the list; 08, When Finance approves). */
export type OrdersTotals = {
  goods: bigint;
  extras: bigint;
  grand: bigint;
  /** The grand total split by payment type: every code present, the values add up to `grand`. */
  byPaymentType: Record<PaymentType, bigint>;
};

function quantityOf(text: string): Decimal {
  // The pattern runs before decimal.js reads the text, which would also take "0x10", "1e2",
  // "Infinity" and padded text (plan of 2.2, decision 5).
  if (!QUANTITY.test(text)) throw new RangeError(`A quantity is "${text}": not numeric(14,3)`);
  const quantity = new Exact(text);
  if (quantity.lte(0)) throw new RangeError(`A quantity is "${text}": not more than 0`);
  return quantity;
}

function positive(amount: bigint, what: string): bigint {
  if (typeof amount !== "bigint" || amount <= 0n) {
    throw new RangeError(`${what} is ${String(amount)}: not whole so'm more than 0`);
  }
  return amount;
}

/** round(quantity × price), half up, to whole so'm (08, Planned total; 05 field 16). */
export function orderGoods(plan: OrderPlan): bigint {
  const quantity = quantityOf(plan.quantity);
  const price = new Exact(positive(plan.price, "A price").toString());
  return BigInt(quantity.times(price).toDecimalPlaces(0, Exact.ROUND_HALF_UP).toFixed(0));
}

/** The sum of the order's extra costs (05 field 12). */
export function orderExtras(plan: OrderPlan): bigint {
  return plan.extras.reduce((sum, extra) => sum + positive(extra, "An extra cost"), 0n);
}

/** round(quantity × price) + extra costs (08, Planned total; 05 field 16). */
export function orderTotal(plan: OrderPlan): bigint {
  return orderGoods(plan) + orderExtras(plan);
}

/**
 * The totals of a set of orders, each the sum of the order values, never a rounding of a summed
 * quantity × price (08: "The totals of a group row or of ticked orders are the sums of the order
 * values"; plan of 2.2, decision 1).
 */
export function ordersTotals(plans: readonly OrderPlan[]): OrdersTotals {
  const byPaymentType = Object.fromEntries(PAYMENT_TYPES.map((type) => [type, 0n])) as Record<
    PaymentType,
    bigint
  >;
  let goods = 0n;
  let extras = 0n;
  for (const plan of plans) {
    if (!isPaymentType(plan.paymentType)) {
      throw new RangeError(`A payment type is "${String(plan.paymentType)}": not one of the three`);
    }
    const orderGoodsValue = orderGoods(plan);
    const orderExtrasValue = orderExtras(plan);
    goods += orderGoodsValue;
    extras += orderExtrasValue;
    byPaymentType[plan.paymentType] += orderGoodsValue + orderExtrasValue;
  }
  return { goods, extras, grand: goods + extras, byPaymentType };
}

/**
 * The price hint (05, Ticking and filters: Price hint; 00-definitions, Price hint): the signed
 * whole percent by which the typed price differs from the reference price, as a bigint, or null.
 *
 * - null with no typed price yet, with no reference price (the last purchase price is a
 *   suggestion, not a reference: plan of 2.2, decision 4), or when the difference is not more
 *   than `thresholdPercent` (the setting `price_hint_percent`).
 * - "More than" is compared exactly, before rounding: |typed − reference| × 100 > threshold ×
 *   reference (decision 3).
 * - The percent is rounded half away from zero (decision 2); a real difference that rounds to 0
 *   shows as 1 with its true sign, never 0 (decision 6).
 */
export function priceHintPercent(
  typed: bigint | null,
  reference: bigint | null,
  thresholdPercent: number,
): bigint | null {
  if (!isPercent(thresholdPercent)) {
    throw new RangeError(`A price hint threshold is ${thresholdPercent}: not a whole percent`);
  }
  if (typed === null || reference === null) return null;
  positive(typed, "A typed price");
  positive(reference, "A reference price");
  const difference = typed - reference;
  const size = difference < 0n ? -difference : difference;
  if (size * 100n <= BigInt(thresholdPercent) * reference) return null;
  const percent = BigInt(
    new Exact(difference.toString())
      .times(100)
      .dividedBy(reference.toString())
      .toDecimalPlaces(0, Exact.ROUND_HALF_UP)
      .toFixed(0),
  );
  if (percent === 0n) return difference > 0n ? 1n : -1n;
  return percent;
}
