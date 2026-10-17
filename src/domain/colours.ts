// The three colours, Number, Price and Total, of an order and of a set of orders
// (08-money-and-settlement.md, The three colours; plan of 3.8). Every screen that shows a colour
// label calls this module: the colours are decided once (developer-rules.md rule 1).
//
// This file holds only the colour decisions. Every number comes from ./order-totals.ts and
// ./purchases.ts; the one comparison of its own, round(planned price × actual quantity), is made
// with their `Exact` clone, rounded half up (developer-rules.md rule 6).

import { Exact, type OrderPlan, orderTotal, quantityOf } from "./order-totals";
import {
  BUYING_STATUSES,
  type OrderProgress,
  type PurchaseRecord,
  actualGoods,
  actualQuantity,
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

/** One order's colour and its amount, or grey. */
export type OrderLabel<Amount> = Grey | { colour: Colour; difference: Amount };

export type OrderColours = {
  /** Planned − actual quantity as numeric text, below 0 when more was bought. */
  number: OrderLabel<string>;
  /** round(planned price × actual quantity) − actual goods; green is always 0 (decided item 3). */
  price: OrderLabel<bigint>;
  /** 08 Difference: planned total − actual total. */
  total: OrderLabel<bigint>;
};

/** A set's Number or Price: the worst colour and how many orders carry it (decided item 2). */
export type SetLabel = Grey | { colour: Colour; orders: number };

export type SetColours = {
  number: SetLabel;
  price: SetLabel;
  /** The summed difference of the orders (08 The three colours, bullet 2). */
  total: OrderLabel<bigint>;
};

export type ColourOrder = {
  status: RequestStatus;
  progress: OrderProgress;
  plan: OrderPlan;
  records: readonly PurchaseRecord[];
};

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

  let price: OrderLabel<bigint> = GREY;
  if (received !== "0") {
    if (liveRecords(records).every((record) => record.unitPrice === plan.price)) {
      price = { colour: "green", difference: 0n };
    } else {
      const atPlan = new Exact(received).times(plan.price.toString());
      const saved =
        BigInt(atPlan.toDecimalPlaces(0, Exact.ROUND_HALF_UP).toFixed(0)) - actualGoods(records);
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

const RANK: Record<Colour, number> = { green: 0, amber: 1, red: 2 };

/** The worst colour among the labels that have one, and how many carry it; grey if none has. */
function worst(labels: readonly OrderLabel<unknown>[]): SetLabel {
  let chosen: Colour | null = null;
  let orders = 0;
  for (const label of labels) {
    if (label.colour === "grey") continue;
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
 */
export function setColours(orders: readonly ColourOrder[]): SetColours | null {
  const each = orders.map(orderColours).filter((colours) => colours !== null);
  if (each.length === 0) return null;
  let total: OrderLabel<bigint> = GREY;
  if (each.every((colours) => colours.total.colour !== "grey")) {
    let sum = 0n;
    for (const colours of each) if (colours.total.colour !== "grey") sum += colours.total.difference;
    total = { colour: bySign(sum), difference: sum };
  }
  return {
    number: worst(each.map((colours) => colours.number)),
    price: worst(each.map((colours) => colours.price)),
    total,
  };
}
