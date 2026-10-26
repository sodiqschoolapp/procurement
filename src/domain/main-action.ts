// The main action of the order page (11-screens-and-ux.md, Order page layout 4: "the main next
// action this user can take as one button, and the user's other actions now under More"; plan of
// 2.9b, decided item 1, Look first). Beside the state machine (order-moves.ts), which decides what
// is allowed; this only picks which of the offered actions comes first. Pure: the page passes what
// it offers (allowedActions(), buyingActions() and its can… facts), and every action asks the
// server again.

import type { OrderAction } from "./order-moves";
import type { BuyingAction } from "./purchases";
import type { RequestStatus } from "./request-status";

/** Every action the order page's bar can offer. */
export type PageAction =
  | OrderAction
  | BuyingAction
  | "ACKNOWLEDGE_OVERSPEND"
  | "RECORD_PURCHASE"
  | "RECORD_MONEY"
  | "SETTLE"
  | "COPY";

/** The actions that can be main, first first; one status never offers two that clash. */
const MAIN_FIRST: readonly PageAction[] = [
  "APPROVE",
  "SUBMIT",
  "SUBMIT_AGAIN",
  "RECORD_PURCHASE",
  "CLOSE_EXACT",
  "CLOSE_SKIPPED",
  "SEND_TO_SETTLEMENT",
  "SETTLE",
  "CLOSE",
  "ACKNOWLEDGE_OVERSPEND",
  "RECORD_MONEY",
];

/** Moves that undo, stop or correct: never the main action, always under More. */
export const NEVER_MAIN: ReadonlySet<PageAction> = new Set([
  "SEND_BACK",
  "REJECT",
  "TAKE_BACK",
  "CANCEL",
  "SEND_BACK_FOR_CORRECTION",
  "REOPEN",
  "FINISH_ORDER",
  "MARK_NOT_BOUGHT",
  "REOPEN_BUYING",
]);

/** The statuses after which nothing more happens to the order: Copy as new can come first. */
const FINISHED: ReadonlySet<RequestStatus> = new Set(["CLOSED", "REJECTED", "CANCELLED"]);

/**
 * The main action among those offered, or null when the user only waits (the top line says who
 * acts) or has nothing at all. Copy as new is main only on a finished order.
 */
export function mainAction(
  status: RequestStatus,
  offered: readonly PageAction[],
): PageAction | null {
  const main = MAIN_FIRST.find((action) => offered.includes(action));
  if (main) return main;
  return FINISHED.has(status) && offered.includes("COPY") ? "COPY" : null;
}
