import type { ManagerRight, Role } from "./permissions";
import type { SuggestionOutcome } from "./suggestions";

// What a notification is (10-notifications-analytics-reports.md, Notifications; 14-data-model.md,
// System: `notifications user_id, type, params JSONB, link, read_at`). Pure: src/server/notify.ts
// writes the rows, the bell and /notifications show them through the message files.

/**
 * One value per event of the spec's table (plan of 0.11, decision 1, Look first). "Sent back,
 * rejected" and "Closed, reopened" are two values each, "Cash given, cash returned, paid back"
 * three; "the decision goes back to the Manager" is a notification of its own. The database enum
 * `notification_type` is this list (src/server/db/schema/system.ts); a value added later is a new
 * migration with `ALTER TYPE … ADD VALUE`, at the end of this list.
 */
export const NOTIFICATION_TYPES = [
  "REQUEST_SUBMITTED",
  "REQUEST_HEAD_APPROVED",
  "REQUEST_PRINCIPAL_APPROVED",
  "REQUEST_FINANCE_APPROVED",
  "REQUEST_SENT_BACK",
  "REQUEST_REJECTED",
  "CASH_GIVEN",
  "CASH_RETURNED",
  "CASH_PAID_BACK",
  "REQUEST_SENT_TO_SETTLEMENT",
  "OVERSPEND_ABOVE_GUARD",
  "OVERSPEND_ACKNOWLEDGED",
  "REQUEST_CLOSED",
  "REQUEST_REOPENED",
  "REQUEST_WAITING_24H",
  "REQUEST_WAITING_48H",
  "NEEDED_BY_NEAR",
  "PRODUCT_SUGGESTED",
  "PRODUCT_SUGGESTION_DECIDED",
  "STOCK_CHANGE_ASKED",
  "STOCK_CHANGE_DECIDED",
  "TRANSFER_SENT",
  "MINIMUM_STOCK_REACHED",
  "BRANCH_ROLE_VACANT",
  "PURCHASE_CANCELLED",
  "PRICE_DIFFERS",
  "MANAGER_RIGHT_SWITCHED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * The params of an order action's notification (10, Notifications: "One action sends one
 * notification to each person told, never one per order: 'Dilnoza submitted 15 orders in CHL'").
 * `actor`: the name of the user who acted; `count`: how many orders the action covered;
 * `branch`: the codes of their branches, joined by ", ", as one action may cover ticked orders
 * of several branches (plan of 2.1, decision 3).
 */
export type OrderActionParams = { actor: string; count: number; branch: string };

/**
 * The params of a waiting reminder (10: "9 orders have waited more than 24 hours"): `hours` is
 * the setting in force (`reminder_hours`, `escalation_hours`), never a fixed 24 (decision 3).
 */
export type OrdersWaitingParams = { count: number; hours: number };

/**
 * The params of each type that has a text in the message files (`notifications.types.<TYPE>`).
 * The task that first sends or first words a type adds it here with its text (the order types:
 * build-plan 2.1, "carry a count"), and names any amount or order number in it as a Look first
 * of its own (plan of 0.11, decisions 4 and 10). A value is a JSON string or number (an ICU
 * argument; a flag is a word for a `select`); money is a string of whole so'm, formatted when
 * shown (decision 9; CLAUDE.md rule 6).
 */
export type NotificationParamsOf = {
  /** "Orders submitted or submitted again" (decision 3: one type for both). */
  REQUEST_SUBMITTED: OrderActionParams;
  REQUEST_HEAD_APPROVED: OrderActionParams;
  REQUEST_PRINCIPAL_APPROVED: OrderActionParams;
  REQUEST_FINANCE_APPROVED: OrderActionParams;
  REQUEST_SENT_BACK: OrderActionParams;
  REQUEST_REJECTED: OrderActionParams;
  REQUEST_SENT_TO_SETTLEMENT: OrderActionParams;
  REQUEST_CLOSED: OrderActionParams;
  REQUEST_REOPENED: OrderActionParams;
  REQUEST_WAITING_24H: OrdersWaitingParams;
  REQUEST_WAITING_48H: OrdersWaitingParams;
  /** "Branch has no active user for a role": the branch's code and the role's code. */
  BRANCH_ROLE_VACANT: { branch: string; role: Role };
  /** "A Manager's right is switched on or off": the right's code, and "on" or "off". */
  MANAGER_RIGHT_SWITCHED: { right: ManagerRight; state: "on" | "off" };
  /** "Product suggested": the suggested name and the branch's code (plan of 1.12, decision 8). */
  PRODUCT_SUGGESTED: { name: string; branch: string };
  /** "The decision goes back to the Manager": the suggested name and the outcome (decision 8). */
  PRODUCT_SUGGESTION_DECIDED: { name: string; outcome: SuggestionOutcome };
};

/** A type notify() accepts: one with params and a text (decision 10). */
export type SendableType = keyof NotificationParamsOf;

/** The params of every sendable type, by name, for the test that reads the message files. */
export const NOTIFICATION_PARAMS: {
  [Type in SendableType]: readonly (keyof NotificationParamsOf[Type])[];
} = {
  REQUEST_SUBMITTED: ["actor", "count", "branch"],
  REQUEST_HEAD_APPROVED: ["actor", "count", "branch"],
  REQUEST_PRINCIPAL_APPROVED: ["actor", "count", "branch"],
  REQUEST_FINANCE_APPROVED: ["actor", "count", "branch"],
  REQUEST_SENT_BACK: ["actor", "count", "branch"],
  REQUEST_REJECTED: ["actor", "count", "branch"],
  REQUEST_SENT_TO_SETTLEMENT: ["actor", "count", "branch"],
  REQUEST_CLOSED: ["actor", "count", "branch"],
  REQUEST_REOPENED: ["actor", "count", "branch"],
  REQUEST_WAITING_24H: ["count", "hours"],
  REQUEST_WAITING_48H: ["count", "hours"],
  BRANCH_ROLE_VACANT: ["branch", "role"],
  MANAGER_RIGHT_SWITCHED: ["right", "state"],
  PRODUCT_SUGGESTED: ["name", "branch"],
  PRODUCT_SUGGESTION_DECIDED: ["name", "outcome"],
};

export type NotificationParamValue = string | number;
export type NotificationParams = { readonly [key: string]: NotificationParamValue };

/**
 * An address inside the app: `/` and a path, never `//host`, `/\host` or an address with a host,
 * and printable ASCII only: no white space or control character, which a browser strips
 * (`/<TAB>/host` becomes `//host`); anything else in an address is percent-encoded. The database CHECK notifications_link_check says the same (plan of 0.11, review of
 * the plan, Should fix 6); the screen asks this again before it follows a link.
 */
export function isInternalLink(link: string): boolean {
  return /^\/([^/\\]|$)/.test(link) && /^[!-~]+$/.test(link);
}

/** 25 rows a page (11-screens-and-ux.md rule 8). */
export const NOTIFICATIONS_PAGE_SIZE = 25;

/** The highest page asked for: far past any list, and the offset stays an exact integer. */
export const NOTIFICATIONS_MAX_PAGE = 10_000;

/** The bell's number: up to 99, then "99+" (plan of 0.11, Screens). */
export function unreadCountLabel(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}
