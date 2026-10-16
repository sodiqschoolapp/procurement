// The group rows of the order list (05-order-request-form.md, Group rows; Ticking and filters;
// 08-money-and-settlement.md: "The totals of a group row or of ticked orders are the sums of the
// order values"; plan of 2.8, decided items 3, 5, 14 and 17). The database only groups, orders and
// pages; every number a group row shows is summed here, from its orders, by the one formula of
// ./order-totals.ts (developer-rules.md rule 1).

import Decimal from "decimal.js";

import { ORDER_ACTION_MAX } from "./order-moves";
import { type OrderPlan, type OrdersTotals, ordersTotals, quantityOf } from "./order-totals";
import type { BusinessDate } from "./business-date";
import type { Role } from "./permissions";
import { REQUEST_STATUSES, type RequestStatus } from "./request-status";

/** 25 group rows a page, read from the server (11-screens-and-ux.md rule 8). */
export const ORDER_LIST_PAGE_SIZE = 25;

/**
 * The statuses of the list: every status but Draft. Drafts, never submitted or taken back, stand
 * in the drafts grid and only their owner and the Head see them (11 Order list layout 3; 06
 * Statuses; plan of 2.8, decided item 1, Look first).
 */
export const LIST_STATUSES = REQUEST_STATUSES.filter(
  (status): status is Exclude<RequestStatus, "DRAFT"> => status !== "DRAFT",
);
export type ListStatus = (typeof LIST_STATUSES)[number];

export function isListStatus(value: unknown): value is ListStatus {
  return (LIST_STATUSES as readonly unknown[]).includes(value);
}

/** One order of a group as the sums read it. */
export type GroupMember = OrderPlan & {
  neededBy: BusinessDate;
  priority: "NORMAL" | "URGENT";
  /** The order's price hint, by priceHintPercent(), or null. */
  priceHint: bigint | null;
};

export type GroupSummary = {
  /** The summed quantity as plain decimal text, without trailing zeros. */
  quantity: string;
  /** ordersTotals() of the orders: each order's value, then summed (08). */
  totals: OrdersTotals;
  count: number;
  earliestNeededBy: BusinessDate;
  /** Any of its orders is urgent (05 Group rows 1). */
  urgent: boolean;
  /** The hint farthest from the catalog price, or null (decided item 5, Look first). */
  priceHint: bigint | null;
};

/**
 * Our own decimal.js for the quantity sum: a group may hold more than the 11 whole digits of
 * numeric(14,3) in total, so the sum never goes back through QUANTITY or quantityOf() (review of
 * the plan, Should fix 7).
 */
const Sum = Decimal.clone({ precision: 64, rounding: Decimal.ROUND_HALF_UP });

/** The quantities of a group added exactly; each one is a valid order quantity. */
export function sumQuantities(quantities: readonly string[]): string {
  let sum = new Sum(0);
  for (const quantity of quantities) sum = sum.plus(quantityOf(quantity).toFixed());
  return sum.toFixed();
}

/**
 * The hint a group row shows when any of its orders has one: the largest in size, so the worst is
 * seen; between +x and −x the positive one, since an overpay is what an approver checks (review of
 * the plan, decision 4).
 */
export function groupPriceHint(hints: readonly (bigint | null)[]): bigint | null {
  let chosen: bigint | null = null;
  for (const hint of hints) {
    if (hint === null) continue;
    if (chosen === null) {
      chosen = hint;
      continue;
    }
    const size = hint < 0n ? -hint : hint;
    const chosenSize = chosen < 0n ? -chosen : chosen;
    if (size > chosenSize || (size === chosenSize && hint > chosen)) chosen = hint;
  }
  return chosen;
}

/** What a group row shows (05 Group rows 1). A group has at least one order. */
export function groupSummary(members: readonly GroupMember[]): GroupSummary {
  const [first] = members;
  if (!first) throw new RangeError("A group row has at least one order");
  let earliest = first.neededBy;
  for (const member of members) if (member.neededBy < earliest) earliest = member.neededBy;
  return {
    quantity: sumQuantities(members.map((member) => member.quantity)),
    totals: ordersTotals(members),
    count: members.length,
    earliestNeededBy: earliest,
    urgent: members.some((member) => member.priority === "URGENT"),
    priceHint: groupPriceHint(members.map((member) => member.priceHint)),
  };
}

/** Urgent is pinned on top for approvers: the Head, the Principal and Finance (05 field 14). */
export function pinsUrgent(role: Role): boolean {
  return role !== "MANAGER";
}

/**
 * Whether orders may be ticked beside those already ticked: together at most 200, the most one
 * action covers (06 rule 8; plan of 2.8, decided item 17). A tick that would pass it ticks nothing.
 */
export function tickFits(ticked: readonly string[], adding: readonly string[]): boolean {
  return new Set([...ticked, ...adding]).size <= ORDER_ACTION_MAX;
}
