import type { Role } from "./permissions";

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
 * The params of each type that has a text in the message files (`notifications.types.<TYPE>`).
 * The task that first sends a type adds it here with its text, and names any amount or request
 * number in it as a Look first of its own (plan of 0.11, decisions 4 and 10). A value is a JSON
 * string or number (an ICU argument; a flag is a word for a `select`); money is a string of whole so'm, formatted when shown (decision 9;
 * CLAUDE.md rule 6).
 */
export type NotificationParamsOf = {
  /** "Branch has no active user for a role": the branch's code and the role's code. */
  BRANCH_ROLE_VACANT: { branch: string; role: Role };
};

/** A type notify() accepts: one with params and a text (decision 10). */
export type SendableType = keyof NotificationParamsOf;

/** The params of every sendable type, by name, for the test that reads the message files. */
export const NOTIFICATION_PARAMS: {
  [Type in SendableType]: readonly (keyof NotificationParamsOf[Type])[];
} = {
  BRANCH_ROLE_VACANT: ["branch", "role"],
};

export type NotificationParamValue = string | number;
export type NotificationParams = { readonly [key: string]: NotificationParamValue };

/**
 * An address inside the app: `/` and a path, never `//host`, `/\host` or an address with a host,
 * and no white space or control character, which a browser strips (`/<TAB>/host` becomes
 * `//host`). The database CHECK notifications_link_check says the same (plan of 0.11, review of
 * the plan, Should fix 6); the screen asks this again before it follows a link.
 */
export function isInternalLink(link: string): boolean {
  return /^\/([^/\\]|$)/.test(link) && !/[\s\p{Cc}]/u.test(link);
}

/** 25 rows a page (11-screens-and-ux.md rule 8). */
export const NOTIFICATIONS_PAGE_SIZE = 25;

/** The bell's number: up to 99, then "99+" (plan of 0.11, Screens). */
export function unreadCountLabel(count: number): string | null {
  if (count <= 0) return null;
  return count > 99 ? "99+" : String(count);
}
