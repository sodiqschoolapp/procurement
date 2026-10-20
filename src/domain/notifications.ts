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
  "CASH_SETTLED",
  "REQUEST_SENT_BACK_FOR_CORRECTION",
  "STOCK_CHECK_MISMATCH",
  "TRANSFER_CANCELLED",
  "REQUEST_CANCELLED",
  "REQUEST_MOVED_IN",
  "REQUEST_MOVED_OUT",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * The params of an order action's notification (10, Notifications: "One action sends one
 * notification to each person told, never one per order: 'Dilnoza submitted 15 orders in CHL'").
 * `actor`: the name of the user who acted; `count`: how many of the action's orders are in
 * `branch`; `branch`: one branch's code. An action on ticked orders of several branches sends one
 * notification per branch, each with that branch's id, code and count, so nobody learns another
 * branch's orders (03 rule 1; permission review of 2.1, Must fix 1). orderActionNotices() splits.
 */
export type OrderActionParams = { actor: string; count: number; branch: string };

/**
 * Where cash was given (plan of 4.3, decided item 7): with Finance's approval (4.2), whose text
 * says "approved", or later from the Money tab, whose text does not.
 */
export type CashGivenVia = "approval" | "money";

/** The direction of a settlement action's net (`SettlementNet` of ./money-ledger.ts). */
/**
 * What a stock change asked of the Head is (10 Notifications, "Write-off or correction asked";
 * plan of 5.11, decided item 5, Look first): a write-off, or a count's corrections (plan of 7.4,
 * decided item 10).
 */
export type StockChangeKind = "WRITE_OFF" | "COUNT";

/**
 * The Head's answer to it, as the notice's `select` reads it; `recount` when an approval found
 * items that moved and sent the count back (plan of 7.4, decided item 2).
 */
export type StockChangeOutcome = "approved" | "refused" | "recount";

export type SettlementDirection = "TO_FINANCE" | "TO_MANAGER" | "NONE";

/**
 * The params of a waiting reminder (10: "9 orders have waited more than 24 hours"): `hours` is
 * the setting in force (`reminder_hours`, `escalation_hours`), never a fixed 24 (decision 3).
 * `count` covers only the branches the recipient may see: a Principal's or a Finance user's own
 * branches, every branch for the Head (03 rule 1; permission review of 2.1, Should fix 2).
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
  /**
   * "Cash given" at Finance's approval (plan of 4.2, decided item 4, Look first): it replaces
   * REQUEST_FINANCE_APPROVED for an owner given cash, so that owner is told once. `count` is the
   * approved orders in `branch`, as in that notice; `amount` the cash given to this owner in
   * `branch`, a string of whole so'm (decision 9), formatted when shown (MONEY_PARAMS).
   */
  CASH_GIVEN: OrderActionParams & { amount: string; via: CashGivenVia };
  /**
   * "Cash returned" and "Paid back" from the Money tab (10 Notifications, "Cash given, cash
   * returned, paid back | Owner"; plan of 4.3, decided item 7): one per money action, so one
   * Manager and one branch; `count` is the action's orders, `amount` its total (`actionTotal()`).
   */
  CASH_RETURNED: OrderActionParams & { amount: string };
  CASH_PAID_BACK: OrderActionParams & { amount: string };
  /**
   * The settlement action of Finance's settlement screen (10 Notifications, "Cash given, cash
   * returned, paid back | Owner"; plan of 4.5, decided item 8, Look first): one per money action,
   * so one Manager and one branch, with its net (`settlementNet()`): who hands whom `amount`.
   */
  CASH_SETTLED: OrderActionParams & { amount: string; direction: SettlementDirection };
  REQUEST_SENT_BACK: OrderActionParams;
  /** Send back for correction (plan of 4.5, decided item 7, Look first): owners and Heads. */
  REQUEST_SENT_BACK_FOR_CORRECTION: OrderActionParams;
  REQUEST_REJECTED: OrderActionParams;
  REQUEST_SENT_TO_SETTLEMENT: OrderActionParams;
  /**
   * The overspend guard (10 Notifications; plan of 4.7, decided items 1 and 6, Look first): above
   * the guard at Send to settlement, to the Heads, `count` the sent orders above it in `branch`;
   * acknowledged, to the branch's Finance, `count` the acknowledged orders.
   */
  OVERSPEND_ABOVE_GUARD: OrderActionParams;
  OVERSPEND_ACKNOWLEDGED: OrderActionParams;
  REQUEST_CLOSED: OrderActionParams;
  REQUEST_REOPENED: OrderActionParams;
  /**
   * "Purchase record cancelled" (plan of 3.7, decided item 9): `count` is the records cancelled
   * by the action in `branch` (a trip is one branch), not its orders.
   */
  PURCHASE_CANCELLED: OrderActionParams;
  /**
   * "Recent purchases differ from the reference price by more than 20%" (plan of 3.10, decided
   * item 8, Look first): `count` is the subtypes a purchase action made prompt in `branch`.
   */
  PRICE_DIFFERS: { count: number; branch: string };
  /**
   * "Item reached its minimum stock" (plan of 5.10, decided item 9): one per item and Manager;
   * `item` is the product's name, with the subtype's when it is not the hidden default (04 rule
   * 1), and `branch` the branch's code. No quantity.
   */
  MINIMUM_STOCK_REACHED: { item: string; branch: string };
  /**
   * "Write-off or correction asked" (plan of 5.11, decided item 5, Look first): to every active
   * Head; `number` is the document's (WOF-…), `branch` its branch's code. "The decision goes back
   * to the Manager": to the one who asked, with the outcome.
   */
  STOCK_CHANGE_ASKED: { actor: string; number: string; branch: string; kind: StockChangeKind };
  STOCK_CHANGE_DECIDED: {
    number: string;
    branch: string;
    kind: StockChangeKind;
    outcome: StockChangeOutcome;
  };
  /**
   * "Transfer sent" (plan of 7.1, decided items 3 and 8, Look first): to every active Manager of
   * the receiving branch, the notice's `branchId`; `number` is the transfer's (TRF-…), `branch`
   * the sending branch's code, `actor` who sent it. No quantity and no amount.
   */
  TRANSFER_SENT: { actor: string; number: string; branch: string };
  /**
   * "Transfer cancelled" (plan of 7.4c, decided item 6, Look first): as TRANSFER_SENT, to every
   * active Manager of the receiving branch, the notice's `branchId`; `actor` who cancelled.
   */
  TRANSFER_CANCELLED: { actor: string; number: string; branch: string };
  /**
   * "Cancelled by someone other than its owner | Owner" (10 Notifications; plan of 2.3b, decided
   * item 8): one per owner, action and branch; `count` is that owner's cancelled orders in `branch`.
   */
  REQUEST_CANCELLED: OrderActionParams;
  /**
   * "Orders moved to another Manager | The new owner and the old one" (plan of 2.3b, decided item
   * 9): per action and branch, to the new owner `count` orders that came; to each old owner
   * `count` of theirs that left, and `manager` the new owner's name.
   */
  REQUEST_MOVED_IN: OrderActionParams;
  REQUEST_MOVED_OUT: OrderActionParams & { manager: string };
  REQUEST_WAITING_24H: OrdersWaitingParams;
  REQUEST_WAITING_48H: OrdersWaitingParams;
  /**
   * "Needed-by date is 2 days away and the order's buying is not finished" (plan of 8.1, decided
   * items 6 and 7, Look first): to the owner, one per branch; `count` the owner's orders of
   * `branch` (its code) needed by today to today + 2. No amount and no order number.
   */
  NEEDED_BY_NEAR: { count: number; branch: string };
  /**
   * The nightly stock check found balances that are not what their movements say (plan of 8.2,
   * decided items 1 and 11, Look first): to every active Head, `branchId` null; `count` the
   * branch-and-subtype items that differ. No branch, item or quantity.
   */
  STOCK_CHECK_MISMATCH: { count: number };
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
  CASH_GIVEN: ["actor", "count", "branch", "amount", "via"],
  CASH_RETURNED: ["actor", "count", "branch", "amount"],
  CASH_PAID_BACK: ["actor", "count", "branch", "amount"],
  CASH_SETTLED: ["actor", "count", "branch", "amount", "direction"],
  REQUEST_SENT_BACK: ["actor", "count", "branch"],
  REQUEST_SENT_BACK_FOR_CORRECTION: ["actor", "count", "branch"],
  REQUEST_REJECTED: ["actor", "count", "branch"],
  REQUEST_SENT_TO_SETTLEMENT: ["actor", "count", "branch"],
  OVERSPEND_ABOVE_GUARD: ["actor", "count", "branch"],
  OVERSPEND_ACKNOWLEDGED: ["actor", "count", "branch"],
  REQUEST_CLOSED: ["actor", "count", "branch"],
  REQUEST_REOPENED: ["actor", "count", "branch"],
  PURCHASE_CANCELLED: ["actor", "count", "branch"],
  PRICE_DIFFERS: ["count", "branch"],
  MINIMUM_STOCK_REACHED: ["item", "branch"],
  STOCK_CHANGE_ASKED: ["actor", "number", "branch", "kind"],
  STOCK_CHANGE_DECIDED: ["number", "branch", "kind", "outcome"],
  TRANSFER_SENT: ["actor", "number", "branch"],
  TRANSFER_CANCELLED: ["actor", "number", "branch"],
  REQUEST_CANCELLED: ["actor", "count", "branch"],
  REQUEST_MOVED_IN: ["actor", "count", "branch"],
  REQUEST_MOVED_OUT: ["actor", "count", "branch", "manager"],
  REQUEST_WAITING_24H: ["count", "hours"],
  REQUEST_WAITING_48H: ["count", "hours"],
  NEEDED_BY_NEAR: ["count", "branch"],
  STOCK_CHECK_MISMATCH: ["count"],
  BRANCH_ROLE_VACANT: ["branch", "role"],
  MANAGER_RIGHT_SWITCHED: ["right", "state"],
  PRODUCT_SUGGESTED: ["name", "branch"],
  PRODUCT_SUGGESTION_DECIDED: ["name", "outcome"],
};

/** The params that are money, a string of whole so'm, formatted as money when shown (decision 9). */
export const MONEY_PARAMS: { readonly [Type in SendableType]?: readonly string[] } = {
  CASH_GIVEN: ["amount"],
  CASH_RETURNED: ["amount"],
  CASH_PAID_BACK: ["amount"],
  CASH_SETTLED: ["amount"],
};

/**
 * A param a stored notification may lack because an earlier task wrote it without one, with the
 * value it is shown with: a CASH_GIVEN of 4.2 has no `via` and was given with the approval (plan of
 * 4.3, decided item 7).
 */
export const PARAM_DEFAULTS: {
  readonly [Type in SendableType]?: Readonly<Record<string, NotificationParamValue>>;
} = {
  CASH_GIVEN: { via: "approval" },
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

/** One order of an action, by its branch: what orderActionNotices() needs. */
export type OrderInBranch = { branchId: string; branchCode: string };

/**
 * The notifications of one action on ticked orders: one per branch the orders are in, with that
 * branch's id (notify()'s branch filter), its code and its count, in the order of the codes
 * (03 rule 1; 10, Notifications; permission review of 2.1, Must fix 1, Look first).
 */
export function orderActionNotices(
  actor: string,
  orders: readonly OrderInBranch[],
): { branchId: string; params: OrderActionParams }[] {
  const byBranch = new Map<string, { code: string; count: number }>();
  for (const { branchId, branchCode } of orders) {
    const entry = byBranch.get(branchId) ?? { code: branchCode, count: 0 };
    entry.count += 1;
    byBranch.set(branchId, entry);
  }
  return [...byBranch.entries()]
    .sort(([, a], [, b]) => a.code.localeCompare(b.code))
    .map(([branchId, { code, count }]) => ({
      branchId,
      params: { actor, count, branch: code },
    }));
}
