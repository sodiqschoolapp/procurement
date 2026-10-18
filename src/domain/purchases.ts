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
import { PAYMENT_TYPES, type PaymentType } from "./payment-types";
import { type Actor, decide } from "./permissions";
import type { RequestStatus } from "./request-status";

/** 07 Order progress, in the order of its table. */
export const ORDER_PROGRESS = ["OPEN", "DONE", "DONE_SHORT", "NOT_BOUGHT"] as const;
export type OrderProgress = (typeof ORDER_PROGRESS)[number];

/**
 * The statuses from Open on (06 Statuses): those that can hold purchase records, and the ones
 * whose download rows carry the actual columns (05 Download 1, "from Open onward").
 */
export const BUYING_STATUSES: ReadonlySet<RequestStatus> = new Set([
  "PURCHASING",
  "SETTLEMENT",
  "CLOSED",
]);

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
export function liveRecords(records: readonly PurchaseRecord[]): PurchaseRecord[] {
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

/**
 * The received quantities of a group row's orders added up (each actualQuantity() of its order),
 * for the Manager home's "my open orders with progress" (07 Order progress; plan of 6.1). Plain
 * decimal text; "0" when nothing is received.
 */
export function receivedTogether(received: readonly string[]): string {
  let sum = new Exact(0);
  for (const each of received) sum = sum.plus(receivedOf(each));
  return sum.toFixed();
}

/** 08 Actual quantity: the sum of the live records' quantities, whatever subtype each bought. */
export function actualQuantity(records: readonly PurchaseRecord[]): string {
  let sum = new Exact(0);
  for (const record of liveRecords(records)) sum = sum.plus(quantityOf(record.qty));
  return sum.toFixed();
}

/** 08 Actual goods: the sum of round(quantity × price), half up, each record on its own. */
export function actualGoods(records: readonly PurchaseRecord[]): bigint {
  let sum = 0n;
  for (const record of liveRecords(records)) {
    const goods = quantityOf(record.qty).times(record.unitPrice.toString());
    sum += BigInt(goods.toDecimalPlaces(0, Exact.ROUND_HALF_UP).toFixed(0));
  }
  return sum;
}

/** 08 Actual extra: the sum of the live records' extra costs. */
export function actualExtra(records: readonly PurchaseRecord[]): bigint {
  return liveRecords(records).reduce((sum, record) => sum + extrasSum(record.extras), 0n);
}

/** 08 Actual total: actual goods + actual extra. */
export function actualTotal(records: readonly PurchaseRecord[]): bigint {
  return actualGoods(records) + actualExtra(records);
}

/** One live record with the payment type of each of its parts (07 Purchase record). */
export type PaidRecord = {
  qty: string;
  unitPrice: bigint;
  /** The trip's payment type: the goods part is paid with it (07, "Payment type used"). */
  paymentType: PaymentType;
  /** Each extra cost with its own payment type (07, extra costs: type, amount, payment type). */
  extras: readonly { amount: bigint; paymentType: PaymentType }[];
};

/**
 * The Actual total of one record split by payment type (10 Analytics, Head, Spending: "split by
 * payment type"; plan of 6.4, decided item 2, Look first): the goods part, round(quantity × price)
 * of the record on its own, to the trip's type; each extra cost to its own; parts of one type
 * added; no part of 0. In the order of PAYMENT_TYPES. The parts add up to actualTotal([record]).
 */
export function paymentParts(record: PaidRecord): { paymentType: PaymentType; amount: bigint }[] {
  const plain: PurchaseRecord = {
    qty: record.qty,
    unitPrice: record.unitPrice,
    extras: record.extras.map((extra) => extra.amount),
    isCancelled: false,
  };
  const sums = new Map<PaymentType, bigint>();
  const add = (type: PaymentType, amount: bigint) =>
    sums.set(type, (sums.get(type) ?? 0n) + amount);
  add(record.paymentType, actualGoods([{ ...plain, extras: [] }]));
  // actualExtra() checks every amount (each more than 0) before any is added.
  actualExtra([plain]);
  for (const extra of record.extras) add(extra.paymentType, extra.amount);
  return PAYMENT_TYPES.flatMap((paymentType) => {
    const amount = sums.get(paymentType) ?? 0n;
    return amount === 0n ? [] : [{ paymentType, amount }];
  });
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

/** Why an order cannot be finished by hand that way. */
export type FinishRefusal = "NOTHING_RECEIVED" | "SOMETHING_RECEIVED";

/**
 * The progress "Finish order" or "Not bought" gives (07 Order progress), or why it is refused. The
 * one place of the rule on what is received (review of the plan of 3.5, Should fix 2):
 * - Not bought needs nothing received.
 * - Finish order needs something received (with nothing, it is "Not bought"): Done short below the
 *   plan; Done at the plan or more, which only a reopened Done order can be (plan of 3.5, decided
 *   item 1, Look first: it changes decisions 3.2 item 4, so a reopened order is never stuck Open).
 */
export function finishedProgress(
  kind: "FINISH" | "NOT_BOUGHT",
  plannedQty: string,
  received: string,
): { progress: OrderProgress } | { refusal: FinishRefusal } {
  const planned = quantityOf(plannedQty);
  const got = receivedOf(received);
  if (kind === "NOT_BOUGHT") {
    return got.isZero() ? { progress: "NOT_BOUGHT" } : { refusal: "SOMETHING_RECEIVED" };
  }
  if (got.isZero()) return { refusal: "NOTHING_RECEIVED" };
  return { progress: got.lt(planned) ? "DONE_SHORT" : "DONE" };
}

/**
 * The buying actions on an Open order (07 Order progress: "Finish order" and "Not bought" with one
 * reason on ticked orders; reopening a finished order's buying while it is Open). They move no
 * status (06 Statuses), so they are not rows of ORDER_MOVES (plan of 3.5, decided item 13).
 */
export const BUYING_ACTIONS = ["FINISH_ORDER", "MARK_NOT_BOUGHT", "REOPEN_BUYING"] as const;
export type BuyingAction = (typeof BUYING_ACTIONS)[number];

/** One order as the buying rule reads it, every fact from the database. */
export type BuyingOrder = {
  status: RequestStatus;
  progress: OrderProgress;
  branchId: string;
  ownerId: string;
  plannedQty: string;
  /** The actual quantity, numeric(14,3) text, "0" when nothing is received. */
  received: string;
};

/**
 * The status part of the rule: Finish order and Not bought on an Open order whose buying is open;
 * Reopen buying on an Open order whose buying is finished, never after Send to settlement (07
 * "While the order is Open"; decided item 3, Look first). The actions' status check asks this.
 */
export function buyingStatusAllows(
  kind: BuyingAction,
  order: Pick<BuyingOrder, "status" | "progress">,
): boolean {
  if (order.status !== "PURCHASING") return false;
  return kind === "REOPEN_BUYING" ? order.progress !== "OPEN" : order.progress === "OPEN";
}

/** Why one order refuses the buying action, in the wrapper's codes; null when it allows it. */
export function buyingRefusal(
  kind: BuyingAction,
  order: BuyingOrder,
): "wrong_status" | "not_ready" | null {
  if (!buyingStatusAllows(kind, order)) return "wrong_status";
  if (kind === "REOPEN_BUYING") return null;
  const done = finishedProgress(
    kind === "FINISH_ORDER" ? "FINISH" : "NOT_BOUGHT",
    order.plannedQty,
    order.received,
  );
  return "refusal" in done ? "not_ready" : null;
}

/**
 * The buying actions this actor may take on every one of the orders now: the screens ask this,
 * and the actions ask the same rule again (developer-rules.md rule 2). They need `purchase.record`
 * (decided item 2, Look first: 03 "Record purchases", the Head or the owner with RECORD_PURCHASES).
 */
export function buyingActions(actor: Actor, list: readonly BuyingOrder[]): BuyingAction[] {
  if (list.length === 0) return [];
  return BUYING_ACTIONS.filter((kind) =>
    list.every(
      (order) =>
        decide("purchase.record", actor, { branchId: order.branchId, ownerId: order.ownerId }) ===
          "allow" && buyingRefusal(kind, order) === null,
    ),
  );
}

/**
 * The actual price per unit of the download (05 Download 1, "actual price"; plan of 3.5, decided
 * item 4, Look first): actual goods ÷ actual quantity, divided exactly and rounded once, half up
 * (developer-rules.md rule 6); with one price it is that price. Null when nothing is received.
 */
export function actualUnitPrice(records: readonly PurchaseRecord[]): bigint | null {
  return unitPriceOf(actualGoods(records), actualQuantity(records));
}

/**
 * The price per unit of goods worth `goods` whole so'm for `qty` units: goods ÷ quantity, divided
 * exactly and rounded once, half up (developer-rules.md rule 6). The one division of a unit price:
 * actualUnitPrice() above and the Prices block of the Head's Analytics page, which adds the stored
 * `actualGoods()` of each record and its quantity (plan of 6.4b, decided item 1, Look first;
 * review of the plan, correction 1). Null for no quantity.
 */
export function unitPriceOf(goods: bigint, qty: string): bigint | null {
  if (typeof goods !== "bigint" || goods < 0n) {
    throw new RangeError("Goods are whole so'm (bigint), 0 or more.");
  }
  const units = new Exact(qty);
  if (units.isNegative()) throw new RangeError(`A quantity is 0 or more, not ${qty}.`);
  if (units.isZero()) return null;
  const price = new Exact(goods.toString()).div(units);
  return BigInt(price.toDecimalPlaces(0, Exact.ROUND_HALF_UP).toFixed(0));
}

/**
 * More was bought than approved (07 Order progress: "Buying more than planned … shows red"; edge
 * case "More was bought than approved"). 3.8's Number red ("Bought more", 08) reads this.
 */
export function overPlan(plannedQty: string, received: string): boolean {
  return receivedOf(received).gt(quantityOf(plannedQty));
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
 * Orders in the split's order: the oldest submit first, at the same moment the lower order number
 * (by year and counter as numbers). A trip writes its records in this order too, so "the record
 * saved last" does not depend on the order the browser sent (plan of 3.4, decided item 4).
 */
export function inSplitOrder<Order extends { number: string; submittedAt: Date }>(
  orders: readonly Order[],
): Order[] {
  return orders
    .map((order) => ({ order, key: numberKey(order.number) }))
    .sort((a, b) => {
      const byTime = a.order.submittedAt.getTime() - b.order.submittedAt.getTime();
      if (byTime !== 0) return byTime;
      if (a.key[0] !== b.key[0]) return a.key[0] - b.key[0];
      return a.key[1] < b.key[1] ? -1 : a.key[1] > b.key[1] ? 1 : 0;
    })
    .map(({ order }) => order);
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
  const sorted = inSplitOrder(orders);

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
export type CommentReason =
  "PRICE_CHANGED" | "GIFT" | "OVER_PLAN" | "SUBSTITUTED" | "PAYMENT_CHANGED";

/** One record as it is typed, against its order's plan and what the order has received so far. */
export type RecordAgainstPlan = {
  qty: string;
  unitPrice: bigint;
  paymentType: string;
  plannedQty: string;
  plannedPrice: bigint;
  plannedPaymentType: string;
  /** The subtype bought, and the order's subtype (07 Purchase record, Subtype bought). */
  variantId: string;
  plannedVariantId: string;
  /** The actual quantity before this record, numeric(14,3) text, "0" when nothing is received. */
  received: string;
};

/**
 * The reasons a record needs a comment, in the order of 07's Comment row (plan of 3.3, decided
 * item 1, Look first): its price differs from the planned price; a price of 0 (a gift); the
 * received quantity after it goes above the plan ("More was bought than approved"), never a part
 * record such as 60 of 100; another subtype than the ordered one was bought (a substitution, plan
 * of 3.6, decided item 2, Look first); its payment type is not the order's. Differing extra costs
 * need none. The form and the server both ask this function.
 */
export function purchaseCommentNeeds(record: RecordAgainstPlan): CommentReason[] {
  const reasons: CommentReason[] = [];
  if (record.unitPrice !== record.plannedPrice) reasons.push("PRICE_CHANGED");
  if (record.unitPrice === 0n) reasons.push("GIFT");
  const after = receivedOf(record.received).plus(quantityOf(record.qty));
  if (after.gt(quantityOf(record.plannedQty))) reasons.push("OVER_PLAN");
  if (record.variantId !== record.plannedVariantId) reasons.push("SUBSTITUTED");
  if (record.paymentType !== record.plannedPaymentType) reasons.push("PAYMENT_CHANGED");
  return reasons;
}

/**
 * Whether an order is Substituted (07 Substitution; 00-definitions, Substitution): a record that is
 * not cancelled bought another subtype than the ordered one (plan of 3.6, decided item 3, Look
 * first). Cancelled records are left out, as from every sum (08). 4.4's closing rules and exact
 * match ("the subtype was not substituted", 08 Exact match) read this.
 */
export function isSubstituted(
  orderedVariantId: string,
  records: readonly { variantId: string; isCancelled: boolean }[],
): boolean {
  return records.some((each) => !each.isCancelled && each.variantId !== orderedVariantId);
}

/**
 * A purchase record can be cancelled (07 Fixing a mistake: "While the order is Open, the Manager
 * can cancel a purchase record with a reason"; plan of 3.7, decided item 4, Look first): its order
 * is Open (`PURCHASING`) whatever its progress, and the record is not cancelled yet, since the
 * cancel is one update that is never repeated (Decided ahead, question 3). Who may is
 * `purchase.cancel` (03 Manager rights: CANCEL_PURCHASES). The screen asks this for its buttons,
 * the actions ask it again.
 */
export function purchaseCancelAllows(
  status: RequestStatus,
  record: { isCancelled: boolean },
): boolean {
  return status === "PURCHASING" && !record.isCancelled;
}

/** How many of an order's records were cancelled (07 Fixing a mistake, third bullet). */
export function cancelledCount(records: readonly { isCancelled: boolean }[]): number {
  return records.filter((each) => each.isCancelled).length;
}

/**
 * The finish reason an order keeps once a cancel changed its progress: the reason only at Done
 * short or Not bought, else none, as `orders_finish_reason_check` (0026) holds it (plan of 3.7,
 * review correction 1).
 */
export function finishReasonAfter(progress: OrderProgress, reason: string | null): string | null {
  return progress === "DONE_SHORT" || progress === "NOT_BOUGHT" ? reason : null;
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
