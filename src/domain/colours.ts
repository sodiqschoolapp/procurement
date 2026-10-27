// The three colours, Number, Price and Total, of an order and of a set of orders
// (08-money-and-settlement.md, The three colours; plan of 3.8). Every screen that shows a colour
// label calls this module: the colours are decided once (developer-rules.md rule 1).
//
// This file holds only the colour decisions. Every number comes from ./order-totals.ts and
// ./purchases.ts; the one comparison of its own, round(planned price × actual quantity), is made
// with their `Exact` clone, rounded half up (developer-rules.md rule 6).

import {
  Exact,
  type OrderPlan,
  type PricedPlan,
  isPriced,
  orderExtras,
  orderGoods,
  orderTotal,
  quantityOf,
} from "./order-totals";
import {
  BUYING_STATUSES,
  type OrderProgress,
  type PurchaseRecord,
  actualExtra,
  actualGoods,
  actualQuantity,
  actualUnitPrice,
  actualTotal,
  difference,
  liveRecords,
  overPlan,
} from "./purchases";
import type { RequestStatus } from "./request-status";

/** 08's green, orange and red; orange is drawn amber (plan of 0.10a, decision 7). */
export type Colour = "green" | "amber" | "red";

const GREY = { colour: "grey" } as const;
type Grey = typeof GREY;

/**
 * An order without a planned price: its Price and Total labels read "No planned price" (08
 * Numbers, the paragraph under the table; plan of 2.5d-b, decided item 3, Look first).
 */
const UNPRICED = { colour: "unpriced" } as const;
type Unpriced = typeof UNPRICED;

/** One order's colour and its amount, or grey. */
export type OrderLabel<Amount> = Grey | { colour: Colour; difference: Amount };

/** A Price or Total label, which an order without a planned price cannot colour. */
export type MoneyLabel = OrderLabel<bigint> | Unpriced;

export type OrderColours = {
  /** Planned − actual quantity as numeric text, below 0 when more was bought. */
  number: OrderLabel<string>;
  /** round(planned price × actual quantity) − actual goods; green is always 0 (decided item 3). */
  price: MoneyLabel;
  /** 08 Difference: planned total − actual total. */
  total: MoneyLabel;
};

/** A set's Number or Price: the worst colour and how many orders carry it (decided item 2). */
export type SetLabel = Grey | { colour: Colour; orders: number };

export type SetColours = {
  number: SetLabel;
  /** The worst among the orders with a planned price; "unpriced" when none has one. */
  price: SetLabel | Unpriced;
  /**
   * The summed difference of the orders with a planned price (08 The three colours, bullet 2);
   * "unpriced" when none has one.
   */
  total: MoneyLabel;
  /** How many of the orders from Open on have no planned price, left out of Price and Total. */
  unpriced: number;
};

export type ColourOrder = {
  status: RequestStatus;
  progress: OrderProgress;
  plan: OrderPlan;
  records: readonly PurchaseRecord[];
};

/** round(planned price × actual quantity), half up: the actual quantity at the planned price. */
function goodsAtPlannedPrice(plan: PricedPlan, received: string): bigint {
  const atPlan = new Exact(received).times(plan.price.toString());
  return BigInt(atPlan.toDecimalPlaces(0, Exact.ROUND_HALF_UP).toFixed(0));
}

/** The colour of a difference by its sign: 0 green, above 0 amber, below 0 red. */
function bySign(value: bigint): Colour {
  return value === 0n ? "green" : value > 0n ? "amber" : "red";
}

/**
 * The three colours of one order, or null before Open: nothing is bought there (decided item 5).
 * - Number and Total are grey while the order's buying is Open (08 bullet 1; decided item 1).
 * - Price is grey until a record that is not cancelled exists; green when every such record's
 *   unit price is the planned one; otherwise amber at or below round(planned price × actual
 *   quantity), red above it (08, Price row; decided item 3).
 * - Without a planned price, Price and Total are "unpriced" from Open on: there is nothing to
 *   compare with (08 Numbers; plan of 2.5d-b, decided item 3, Look first). Number is as for any
 *   order.
 */
export function orderColours(order: ColourOrder): OrderColours | null {
  if (!BUYING_STATUSES.has(order.status)) return null;
  const { plan, records } = order;
  const received = actualQuantity(records);
  const inProgress = order.progress === "OPEN";

  let number: OrderLabel<string> = GREY;
  if (!inProgress) {
    const left = quantityOf(plan.quantity).minus(new Exact(received));
    number = {
      colour: overPlan(plan.quantity, received) ? "red" : left.isZero() ? "green" : "amber",
      difference: left.toFixed(),
    };
  }

  if (!isPriced(plan)) return { number, price: UNPRICED, total: UNPRICED };

  let price: OrderLabel<bigint> = GREY;
  if (received !== "0") {
    if (liveRecords(records).every((record) => record.unitPrice === plan.price)) {
      price = { colour: "green", difference: 0n };
    } else {
      const saved = goodsAtPlannedPrice(plan, received) - actualGoods(records);
      price = { colour: saved >= 0n ? "amber" : "red", difference: saved };
    }
  }

  let total: OrderLabel<bigint> = GREY;
  if (!inProgress) {
    const left = difference(orderTotal(plan), actualTotal(records));
    total = { colour: bySign(left), difference: left };
  }

  return { number, price, total };
}

/**
 * An order's plan beside what was bought, line by line, for the order page's Plan and actual
 * table (redesign of 22.10.2026). Every number is one of 08's, and the three effects split 08's
 * Difference exactly: planned total − actual total = quantity + price + extras, each planned −
 * actual (above 0 less was spent, below 0 more):
 * - quantity: planned goods − round(planned price × actual quantity), what buying more or fewer
 *   units did at the planned price;
 * - price: round(planned price × actual quantity) − actual goods, the Price label's amount;
 * - extras: planned extra costs − actual extra costs.
 */
export type PlanVsActual = {
  quantity: { planned: string; actual: string };
  /**
   * The actual price is actualUnitPrice(): goods ÷ quantity, half up; `difference` is planned −
   * actual per unit (above 0 cheaper, below 0 dearer), each already whole so'm.
   */
  unitPrice: {
    planned: bigint | null;
    actual: bigint;
    difference: bigint | null;
    oneUnitPrice: boolean;
  };
  extras: { planned: bigint; actual: bigint };
  /** `difference` is 08's Difference: planned − actual, the sum of the three effects. */
  total: { planned: bigint | null; actual: bigint; difference: bigint | null };
  /**
   * Null without a planned price: each effect is a money value against the planned price, and 08
   * gives such an order no difference (plan of 2.5d-b, decided item 4, Look first).
   */
  effects: { quantity: bigint; price: bigint; extras: bigint } | null;
};

/**
 * The plan beside the actual numbers, or null before Open or while nothing counted is bought
 * (the table compares something bought with its plan). `oneUnitPrice` is false when the live
 * records were bought at more than one price, so the actual price is an average.
 */
export function planVsActual(order: ColourOrder): PlanVsActual | null {
  if (!BUYING_STATUSES.has(order.status)) return null;
  const { plan, records } = order;
  const received = actualQuantity(records);
  const actualPrice = actualUnitPrice(records);
  if (actualPrice === null) return null;
  const goods = actualGoods(records);
  const extras = actualExtra(records);
  const prices = new Set(liveRecords(records).map((record) => record.unitPrice));
  const actual = actualTotal(records);
  if (!isPriced(plan)) {
    return {
      quantity: { planned: quantityOf(plan.quantity).toFixed(), actual: received },
      unitPrice: {
        planned: null,
        actual: actualPrice,
        difference: null,
        oneUnitPrice: prices.size === 1,
      },
      extras: { planned: orderExtras(plan), actual: extras },
      total: { planned: null, actual, difference: null },
      effects: null,
    };
  }
  const atPlan = goodsAtPlannedPrice(plan, received);
  const planned = orderTotal(plan);
  return {
    quantity: { planned: quantityOf(plan.quantity).toFixed(), actual: received },
    unitPrice: {
      planned: plan.price,
      actual: actualPrice,
      difference: plan.price - actualPrice,
      oneUnitPrice: prices.size === 1,
    },
    extras: { planned: orderExtras(plan), actual: extras },
    total: { planned, actual, difference: difference(planned, actual) },
    effects: {
      quantity: orderGoods(plan) - atPlan,
      price: atPlan - goods,
      extras: orderExtras(plan) - extras,
    },
  };
}

const RANK: Record<Colour, number> = { green: 0, amber: 1, red: 2 };

/** The worst colour among the labels that have one, and how many carry it; grey if none has. */
function worst(labels: readonly (OrderLabel<unknown> | Unpriced)[]): SetLabel {
  let chosen: Colour | null = null;
  let orders = 0;
  for (const label of labels) {
    if (label.colour === "grey" || label.colour === "unpriced") continue;
    if (chosen === null || RANK[label.colour] > RANK[chosen]) {
      chosen = label.colour;
      orders = 1;
    } else if (label.colour === chosen) {
      orders += 1;
    }
  }
  return chosen === null ? GREY : { colour: chosen, orders };
}

/**
 * The three colours of a group row or of ticked orders, or null when none of them is from Open on
 * (08 The three colours, bullet 2; decided items 2, 4 and 5). Orders before Open are left out.
 * - Number and Price: the worst colour among the orders that have one (red beats orange, orange
 *   beats green); grey only when none has one.
 * - Total: the summed difference, grey while any order's buying is Open.
 * - Orders without a planned price are left out of Price and Total and counted in `unpriced`;
 *   when every order is without one, both are "unpriced" (08 Numbers; plan of 2.5d-b, decided
 *   item 3, Look first).
 */
export function setColours(orders: readonly ColourOrder[]): SetColours | null {
  const each = orders.map(orderColours).filter((colours) => colours !== null);
  if (each.length === 0) return null;
  const priced = each.filter((colours) => colours.total.colour !== "unpriced");
  const unpriced = each.length - priced.length;
  const number = worst(each.map((colours) => colours.number));
  if (priced.length === 0) return { number, price: UNPRICED, total: UNPRICED, unpriced };
  let total: MoneyLabel = GREY;
  // Grey while any order's buying is Open, its own Number grey too (08 bullet 1).
  if (each.every((colours) => colours.number.colour !== "grey")) {
    let sum = 0n;
    for (const colours of priced)
      if (colours.total.colour !== "grey" && colours.total.colour !== "unpriced") {
        sum += colours.total.difference;
      }
    total = { colour: bySign(sum), difference: sum };
  }
  return { number, price: worst(priced.map((colours) => colours.price)), total, unpriced };
}

/** An order's Plan vs actual outcome (10 Analytics, Head, Plan vs actual; plan of 6.4). */
export type OrderOutcome = {
  colour: Colour;
  /** orderTotal() of the plan. */
  planned: bigint;
  /** actualTotal() of the live records. */
  actual: bigint;
  /** planned − actual: above 0 saved, below 0 overspent (08 Difference). */
  difference: bigint;
};

/**
 * How an order ended against its plan, or null while it has not (plan of 6.4, decided items 3
 * and 4, Look first): from Open on, buying Done or Done short, its colour the Total colour of
 * orderColours(). An order marked Not bought is left out: nothing was bought, so its planned total
 * would read as saved. An order without a planned price is left out: it has no Total colour (08
 * Numbers; plan of 2.5d-b, decided item 4).
 */
export function orderOutcome(order: ColourOrder): OrderOutcome | null {
  if (order.progress !== "DONE" && order.progress !== "DONE_SHORT") return null;
  const colours = orderColours(order);
  // Without a planned price there is no Total colour and no difference (08 Numbers).
  if (!colours || colours.total.colour === "grey" || colours.total.colour === "unpriced") {
    return null;
  }
  if (!isPriced(order.plan)) return null;
  const planned = orderTotal(order.plan);
  return {
    colour: colours.total.colour,
    planned,
    actual: planned - colours.total.difference,
    difference: colours.total.difference,
  };
}
