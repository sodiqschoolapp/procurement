import { businessDate, businessMonth, type BusinessDate } from "@/domain/business-date";
import { type OrderAction, allowedActions } from "@/domain/order-moves";
import type { ListStatus } from "@/domain/order-list";
import type { OrdersTotals } from "@/domain/order-totals";
import { authorize, authorizeList } from "@/server/authorize";
import { now } from "@/server/clock";
import { readSnapshot } from "@/server/read-snapshot";

import { type ListFilters, NO_FILTERS } from "@/features/orders/list-filters";
import {
  type OrderGroup,
  countOrdersByStatus,
  listOrderGroups,
  orderTotalsOnFilter,
} from "@/features/orders/queries/order-list";

import { branchSpending } from "../spending";

// The Principal's home, "My tasks" (10-notifications-analytics-reports.md, Home page per role:
// "Waiting for my approval, with the total amount; my branch's orders by status; my branch's
// spending this month"; 11-screens-and-ux.md, Interface per role: Principal, "waiting group rows
// as large cards with total, urgent label and price hints"; plan of 6.1). Under `data.view` with
// the order list's own walls in the SQL; everything in one snapshot, so the total over the cards
// is the sum of the cards' orders (spec review of the plan, Must fix 2).

/** The moves a waiting card offers: those the state machine allows on all of its orders. */
const CARD_MOVES = ["APPROVE", "SEND_BACK", "REJECT"] as const satisfies readonly OrderAction[];
export type CardMove = (typeof CARD_MOVES)[number];

export type WaitingCard = { group: OrderGroup; moves: CardMove[] };

export type PrincipalHome = {
  /** The filters of the waiting list's link. */
  waitingFilters: ListFilters;
  /** The first page of waiting group rows, urgent first (05 field 14). */
  cards: WaitingCard[];
  /** How many group rows wait in all, and how many orders, with their totals (08). */
  cardCount: number;
  waiting: { count: number; totals: OrdersTotals };
  byStatus: { status: ListStatus; count: number }[];
  /** 08 Actual total of the records bought this Tashkent month (decided item 6, Look first). */
  spending: bigint;
  month: { first: BusinessDate; last: BusinessDate };
};

export async function getPrincipalHome(
  userId: string,
  branch: string | null,
): Promise<PrincipalHome> {
  return readSnapshot(async (db) => {
    const actor = await authorizeList(userId, "data.view", db);
    if (branch) await authorize(userId, "data.view", { branchId: branch }, db);
    const scope: ListFilters = { ...NO_FILTERS, branch };
    const waitingFilters: ListFilters = { ...scope, status: "PENDING_PRINCIPAL" };
    const page = await listOrderGroups(userId, waitingFilters, 1, db);
    const month = businessMonth(businessDate(now()));
    return {
      waitingFilters,
      cards: page.groups.map((group) => ({
        group,
        // The state machine decides; a card over 200 orders gets none (06 rule 8). The facts of
        // Close and settlement are not read: no move of a waiting order asks them.
        moves: allowedActions(
          actor,
          group.orders.map((order) => ({
            id: order.id,
            status: group.status,
            branchId: group.branchId,
            ownerId: order.ownerId,
            createdByHead: false,
            // A waiting order always has its number (05 Order number).
            numbered: true,
            buyingFinished: false,
            exactMatch: false,
            ownerClosesAlone: false,
            readyToClose: false,
          })),
        ).filter((action): action is CardMove =>
          (CARD_MOVES as readonly string[]).includes(action),
        ),
      })),
      cardCount: page.total,
      waiting: await orderTotalsOnFilter(userId, waitingFilters, db),
      byStatus: await countOrdersByStatus(userId, scope, db),
      spending: await branchSpending(db, actor, branch, month),
      month,
    };
  });
}
