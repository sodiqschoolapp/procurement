// The actual money and quantity of orders (08-money-and-settlement.md, Numbers the system
// calculates), an order's progress (07-purchasing.md, Order progress) and the split of a group
// row's quantity (07, One trip, many orders: 2). Every screen, file and action that shows or
// writes these numbers calls this module: the formula lives once (developer-rules.md rule 1).
//
// The functions read the purchase records only, never a stored `actual_total` (plan of 3.2,
// decided item 3). A quantity enters and leaves as numeric(14,3) text; money as whole so'm in
// bigint; they meet only inside the `Exact` clone of ./order-totals.ts, rounded half up
// (developer-rules.md rule 6).

import { Exact, QUANTITY, extrasSum, quantityOf } from "./order-totals";

/** 07 Order progress, in the order of its table. */
export const ORDER_PROGRESS = ["OPEN", "DONE", "DONE_SHORT", "NOT_BOUGHT"] as const;
export type OrderProgress = (typeof ORDER_PROGRESS)[number];

/** One purchase record as these functions read it (07 Purchase record; 14 purchases). */
export type PurchaseRecord = {
  /** The quantity bought as numeric(14,3) text, more than 0. */
  qty: string;
  /** The price per unit in whole so'm, 0 or more (a gift is 0: 07 Purchase record). */
  unitPrice: bigint;
  /** The record's extra costs in whole so'm, each more than 0. */
  extras: readonly bigint[];
  isCancelled: boolean;
};

/**
 * The records that count: not cancelled (08: "the order's purchase records that are not
 * cancelled"). Every record is checked first, so a broken row is never hidden by its cancel.
 */
function live(records: readonly PurchaseRecord[]): PurchaseRecord[] {
  for (const record of records) {
    quantityOf(record.qty);
    if (typeof record.unitPrice !== "bigint" || record.unitPrice < 0n) {
      throw new RangeError(`A price is ${String(record.unitPrice)}: not whole so'm of 0 or more`);
    }
    extrasSum(record.extras);
  }
  return records.filter((record) => !record.isCancelled);
}

/** A received quantity: numeric(14,3) text of 0 or more ("0" when nothing is received). */
function receivedOf(text: string): InstanceType<typeof Exact> {
  if (!QUANTITY.test(text)) throw new RangeError(`A quantity is "${text}": not numeric(14,3)`);
  return new Exact(text);
}

/** 08 Actual quantity: the sum of the live records' quantities, whatever subtype each bought. */
export function actualQuantity(records: readonly PurchaseRecord[]): string {
  let sum = new Exact(0);
  for (const record of live(records)) sum = sum.plus(quantityOf(record.qty));
  return sum.toFixed();
}

/** 08 Actual goods: the sum of round(quantity × price), half up, each record on its own. */
export function actualGoods(records: readonly PurchaseRecord[]): bigint {
  let sum = 0n;
  for (const record of live(records)) {
    const goods = quantityOf(record.qty).times(record.unitPrice.toString());
    sum += BigInt(goods.toDecimalPlaces(0, Exact.ROUND_HALF_UP).toFixed(0));
  }
  return sum;
}

/** 08 Actual extra: the sum of the live records' extra costs. */
export function actualExtra(records: readonly PurchaseRecord[]): bigint {
  return live(records).reduce((sum, record) => sum + extrasSum(record.extras), 0n);
}

/** 08 Actual total: actual goods + actual extra. */
export function actualTotal(records: readonly PurchaseRecord[]): bigint {
  return actualGoods(records) + actualExtra(records);
}

/**
 * 08 Difference: planned total − actual total. Above 0 money is left, below 0 more was spent.
 * The planned total comes from `orderTotal()` of ./order-totals.ts, the one planned formula.
 */
export function difference(plannedTotal: bigint, actual: bigint): bigint {
  return plannedTotal - actual;
}

/**
 * The progress after a record of the order is saved or cancelled (07 Order progress; plan of
 * 3.2, decided item 4, Look first, and review corrections 1):
 * - Done at the planned quantity or more, whatever the progress was: Done is automatic.
 * - Done short stays while 0 < received < planned: it was finished by hand. Left with nothing
 *   received it is Open, and the Manager decides again.
 * - Not bought stays while nothing is received; once something is, Open.
 * - Otherwise Open: "received less than planned, and not finished by hand".
 */
export function progressAfterBuying(
  current: OrderProgress,
  plannedQty: string,
  received: string,
): OrderProgress {
  const planned = quantityOf(plannedQty);
  const got = receivedOf(received);
  if (got.gte(planned)) return "DONE";
  if (current === "DONE_SHORT" && got.gt(0)) return "DONE_SHORT";
  if (current === "NOT_BOUGHT" && got.isZero()) return "NOT_BOUGHT";
  return "OPEN";
}

/** Why an order cannot be finished by hand that way, or null when it can. */
export type FinishRefusal = "NOTHING_RECEIVED" | "NOT_SHORT" | "SOMETHING_RECEIVED";

/**
 * 07 Order progress: "Finish order" gives Done short "with less than planned", and needs something
 * received (with nothing, it is "Not bought": decided item 4); "Not bought" needs nothing received.
 */
export function finishRefusal(
  kind: "DONE_SHORT" | "NOT_BOUGHT",
  plannedQty: string,
  received: string,
): FinishRefusal | null {
  const planned = quantityOf(plannedQty);
  const got = receivedOf(received);
  if (kind === "NOT_BOUGHT") return got.isZero() ? null : "SOMETHING_RECEIVED";
  if (got.isZero()) return "NOTHING_RECEIVED";
  return got.lt(planned) ? null : "NOT_SHORT";
}

/** One order of a group row, as the split reads it. */
export type GroupOrder = {
  id: string;
  /** The order number, `CHL-26-0142` (05 Order number). */
  number: string;
  /** The first submit (`orders.submitted_at`). */
  submittedAt: Date;
  plannedQty: string;
  /** The actual quantity so far, numeric(14,3) text, "0" when nothing is received. */
  received: string;
};

const NUMBER = /^[A-Z]{2,4}-([0-9]{2})-([0-9]{4,})$/;

/** The year and the counter of an order number, as numbers: `0999` comes before `10000`. */
function numberKey(number: string): [number, bigint] {
  const match = NUMBER.exec(number);
  if (!match) throw new RangeError(`An order number is "${number}"`);
  return [Number(match[1]), BigInt(match[2]!)];
}

/**
 * 07 One trip, many orders: 2. The quantity bought for a group row, split over its orders: the
 * oldest submit first (at the same moment, the lower order number first), each up to what it
 * lacks (planned − received, never below 0), and anything above the group's total to the newest
 * order, even one that lacked nothing (decided item 5, Look first). Returned in that order; an
 * order given "0" gets no record, since a record's quantity is more than 0 (07 Purchase record).
 */
export function splitGroupQuantity(
  total: string,
  orders: readonly GroupOrder[],
): { id: string; qty: string }[] {
  if (orders.length === 0) throw new RangeError("A group row has no orders");
  let left = quantityOf(total);
  const sorted = orders
    .map((order) => ({ order, key: numberKey(order.number) }))
    .sort((a, b) => {
      const byTime = a.order.submittedAt.getTime() - b.order.submittedAt.getTime();
      if (byTime !== 0) return byTime;
      if (a.key[0] !== b.key[0]) return a.key[0] - b.key[0];
      return a.key[1] < b.key[1] ? -1 : a.key[1] > b.key[1] ? 1 : 0;
    })
    .map(({ order }) => order);

  const parts = sorted.map((order) => {
    const lacking = Exact.max(quantityOf(order.plannedQty).minus(receivedOf(order.received)), 0);
    const qty = Exact.min(lacking, left);
    left = left.minus(qty);
    return { id: order.id, qty };
  });
  const newest = parts[parts.length - 1]!;
  newest.qty = newest.qty.plus(left);
  return parts.map((part) => ({ id: part.id, qty: part.qty.toFixed() }));
}

/** Why a purchase record needs its comment (07 Purchase record, Comment; plan of 3.3, item 1). */
export type CommentReason = "PRICE_CHANGED" | "GIFT" | "OVER_PLAN" | "PAYMENT_CHANGED";

/** One record as it is typed, against its order's plan and what the order has received so far. */
export type RecordAgainstPlan = {
  qty: string;
  unitPrice: bigint;
  paymentType: string;
  plannedQty: string;
  plannedPrice: bigint;
  plannedPaymentType: string;
  /** The actual quantity before this record, numeric(14,3) text, "0" when nothing is received. */
  received: string;
};

/**
 * The reasons a record needs a comment, in the order of 07's Comment row (plan of 3.3, decided
 * item 1, Look first): its price differs from the planned price; a price of 0 (a gift); the
 * received quantity after it goes above the plan ("More was bought than approved"), never a part
 * record such as 60 of 100; its payment type is not the order's. Differing extra costs need none.
 * Substitution's reason comes with 3.6. The form and the server both ask this function.
 */
export function purchaseCommentNeeds(record: RecordAgainstPlan): CommentReason[] {
  const reasons: CommentReason[] = [];
  if (record.unitPrice !== record.plannedPrice) reasons.push("PRICE_CHANGED");
  if (record.unitPrice === 0n) reasons.push("GIFT");
  const after = receivedOf(record.received).plus(quantityOf(record.qty));
  if (after.gt(quantityOf(record.plannedQty))) reasons.push("OVER_PLAN");
  if (record.paymentType !== record.plannedPaymentType) reasons.push("PAYMENT_CHANGED");
  return reasons;
}

/**
 * Why a date bought is refused, or null (07 Purchase record, Date bought: "Not in the future, not
 * before the Finance approval of the order"; plan of 3.3, decided item 7). All three are business
 * dates in Tashkent (YYYY-MM-DD, which compare as text); an order without an approval date is
 * refused, never let through.
 */
export function purchaseDateRefusal(
  date: string,
  today: string,
  approvedOn: string | null,
): "inFuture" | "beforeApproval" | null {
  if (date > today) return "inFuture";
  if (approvedOn === null || date < approvedOn) return "beforeApproval";
  return null;
}

/** What "Same as planned" fills (07 Purchase record). */
export type SameAsPlanned = { qty: string; unitPrice: bigint; extras: readonly bigint[] };

/**
 * "Same as planned" (07: "fills quantity, price and extra costs from the order in one tap"; plan
 * of 3.3, decided item 5): the plan while nothing is received; once something is, the quantity
 * still lacking, the planned price and no extra costs, so the planned extras are not counted
 * twice. With nothing lacking, the planned quantity.
 */
export function sameAsPlanned(
  plannedQty: string,
  plannedPrice: bigint,
  plannedExtras: readonly bigint[],
  received: string,
): SameAsPlanned {
  const planned = quantityOf(plannedQty);
  const got = receivedOf(received);
  if (got.isZero())
    return { qty: planned.toFixed(), unitPrice: plannedPrice, extras: plannedExtras };
  const lacking = planned.minus(got);
  return {
    qty: lacking.gt(0) ? lacking.toFixed() : planned.toFixed(),
    unitPrice: plannedPrice,
    extras: [],
  };
}
