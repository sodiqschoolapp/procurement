// What every server action returns to the browser (plan of 0.8): a result, or a refusal with a
// code and a plain-words message key (11-screens-and-ux.md, smooth feel 4: "Errors say in plain
// words what happened and what to do next"). Errors are returned, not thrown: Next.js hides a
// thrown error's message in production (plan of 0.8, decision 7). Types and constants only, so a
// client component may import this file.

/** The refusals the wrapper of src/server/action.ts returns. */
export const SERVER_ERROR_CODES = [
  "invalid_input",
  "signed_out",
  "not_found",
  "forbidden",
  "stale_version",
  "wrong_status",
  "conflict",
  // Some ticked orders are not ready for the move: buying not finished, not an exact match, not
  // ready to close (06-approval-workflow.md, Allowed moves "Needs"; plan of 2.4, decision 1).
  "not_ready",
  "unexpected",
] as const;
export type ServerErrorCode = (typeof SERVER_ERROR_CODES)[number];

/** `network`: the browser got no answer at all (src/components/action-runner.ts). */
export type ActionErrorCode = ServerErrorCode | "network";

/** The message key of each code, under `errors` in uz.json, ru.json and en.json. */
export const ERROR_MESSAGE_KEYS = {
  invalid_input: "errors.invalidInput",
  signed_out: "errors.signedOut",
  not_found: "errors.notFound",
  forbidden: "errors.forbidden",
  stale_version: "errors.staleVersion",
  wrong_status: "errors.wrongStatus",
  conflict: "errors.conflict",
  not_ready: "errors.notReady",
  unexpected: "errors.unexpected",
  network: "errors.network",
} as const satisfies Record<ActionErrorCode, string>;
export type ErrorMessageKey = (typeof ERROR_MESSAGE_KEYS)[ActionErrorCode];

/** What is wrong with one field of the input, under `errors.field`. */
export const FIELD_ERROR_KINDS = [
  "required",
  "tooLong",
  "tooShort",
  "wrongFormat",
  "notANumber",
  "tooSmall",
  "tooLarge",
  "notAllowed",
  // Held by another record: a branch's code or name (plan of 1.2, decision 7).
  "taken",
  // A user's branches (plan of 1.3, decision 16): the branch has an active Principal, the count
  // does not fit the role, a branch is inactive.
  "principalTaken",
  "branchCount",
  "branchInactive",
  // A product's references and photo, and the lock after first use (plan of 1.7): the entry
  // picked is inactive, the file is not a photo, the field is locked because the record is used.
  "inactive",
  "notAPhoto",
  "locked",
  // An Excel import (plan of 1.10): no such entry, a name that fits two, the same value twice in
  // the file, a later row of a product that differs from its first, and the file's own errors.
  "unknown",
  "ambiguous",
  "duplicateInFile",
  "differsInFile",
  "notTemplate",
  "fileTooLarge",
  "tooManyRows",
  "noRows",
  // A product suggestion whose name a product already holds (plan of 1.12, decision 7).
  "inCatalog",
  // A draft's quantity (plan of 2.5a, decided item 5): decimals for a measure counted in whole
  // units, more than 3 decimals; and a change that would make a second never-submitted draft of
  // the same branch, subtype and department (decided item 2, Look first).
  "wholeOnly",
  "tooManyDecimals",
  "draftExists",
  // A needed-by date before today in Tashkent at submit (plan of 2.7, decided item 2).
  "inPast",
  // A purchase's date bought after today or before the order's Finance approval (plan of 3.3,
  // decided item 7).
  "inFuture",
  "beforeApproval",
  // ... before the Principal's approval of orders that skipped Finance (plan of 4.10c).
  "beforePrincipalApproval",
  // A trip over orders of two branches or two owners (07 One trip, many orders; plan of 3.4,
  // decided item 2, Look first).
  "tripOneOwner",
  // A subtype bought of another product than the ordered one (07 Substitution; plan of 3.6).
  "otherProduct",
  // A cancel of a purchase record that would take stock below 0: the items were issued (07
  // Fixing a mistake 2; plan of 3.7, decided item 2, Look first).
  "stockShort",
  // Cash given at Finance's approval to one Manager for orders of two branches: one cash action
  // per Manager never spans two branches (plan of 4.2, decided item 5, Look first).
  "cashOneBranch",
  // A money action of the Money tab (plan of 4.3): a row that would cross over (08 Money ledger 3;
  // decided item 3, Look first), no amount above 0, one Manager's orders in two branches (decided
  // item 4, Look first), a file with two Managers (decided item 5, Look first), and a cancel with
  // an order Closed (08 Money ledger: the Head reopens it first).
  "aboveCount",
  "aboveOwed",
  "noAmount",
  "moneyOneBranch",
  "fileOneManager",
  "closedReopenFirst",
  // A settlement confirmation (plan of 4.5): a transfer whose transferred and received amounts
  // differ needs a note (08 Closing 2); the order used no such payment type, so there is nothing
  // to confirm.
  "noteRequired",
  "noBlock",
  // Move orders to another Manager (plan of 4.10): the chosen user is no active Manager of the
  // orders' branch (decided item 4), an order whose cash count is not 0 (03 rule 7; decided item
  // 2, Look first) or that the chosen Manager owns already (03 rule 7: "another Manager"); and a
  // cancel of what was written before the order was moved (decided item 3, Look first).
  "notBranchManager",
  "cashNotZero",
  "alreadyOwner",
  "movedSince",
  // A cancel of a record given straight to the department while that record's issue is posted,
  // whatever the stock (07 Fixing a mistake 2; plan of 5.4b, decided items 2 and 3, Look first).
  "givenIssuePosted",
  // A return of more than the department received (09 Other documents, Return; plan of 5.6,
  // decided items 2 and 5, Look first): the line over, and the comment it needs.
  "overReturn",
  "overReturnComment",
  // A reverse whose movement would take stock below 0 (09 intro; plan of 5.7).
  "reverseStockShort",
  // A reverse of an issue line over what the department still holds of it (09 Issue to a
  // department 3; plan of 5.7b).
  "reverseOverHeld",
  // A branch the Head deactivates while it has unfinished orders or stock above 0
  // (edge-cases/requests-and-approval.md, "The Head wants to close a branch"; plan of 5.12).
  "unfinishedOrders",
  "stockLeft",
  // ... or a transfer from or to it in transit (plan of 7.1, decided item 4, Look first).
  "transfersInTransit",
  // A received quantity above the quantity sent (plan of 7.2, decided item 4, Look first).
  "aboveSent",
  // A count of a branch or category that holds no item of the stock (plan of 7.3).
  "nothingToCount",
  // The Finance step switched off while orders wait for Finance or for settlement (06 Finance
  // step switched off 5; plan of 4.10c): the numbers of those orders.
  "financeStepWaiting",
] as const;
export type FieldErrorKind = (typeof FIELD_ERROR_KINDS)[number];
export type FieldMessageKey = `errors.field.${FieldErrorKind}`;

/** Why one ticked order refused an action on many orders, in the order they are checked. */
export const ORDER_REFUSAL_CODES = [
  "not_found",
  "stale_version",
  "wrong_status",
  "forbidden",
  "not_ready",
] as const;
export type OrderRefusalCode = (typeof ORDER_REFUSAL_CODES)[number];

/** One failing order of an action on ticked orders (06-approval-workflow.md rule 8). */
export type OrderFailure = {
  orderId: string;
  code: OrderRefusalCode;
  /**
   * For `not_ready` of a Submit: the message key of each cell of this order that stops it, by the
   * field names of the draft actions (`neededBy`, `extras.0.extraCostTypeId`), so the screen marks
   * the exact cell of the exact order (05 Checks at submit; plan of 2.7, decided item 10).
   */
  fields?: Record<string, FieldMessageKey>;
  /**
   * The values the message of `fields` names, by name: the Manager to move the order back to
   * before a cancel (`errors.field.movedSince`; 08 Money ledger; plan of 4.10b, decided item 8);
   * the number of the record's posted issue (`errors.field.givenIssuePosted`; plan of 5.4b).
   */
  values?: Record<string, string>;
};

export type ActionFailure = {
  code: ActionErrorCode;
  messageKey: ErrorMessageKey;
  /** For `invalid_input`: the message key of each field that is wrong, by its path (`lines.0.qty`). */
  fields?: Record<string, FieldMessageKey>;
  /**
   * For an action on ticked orders: every order that failed and why, so the screen names them
   * (06 rule 8; plan of 2.4, decision 1). The action's `code` is the first of these codes, in the
   * order of ORDER_REFUSAL_CODES, that any order has.
   */
  orders?: readonly OrderFailure[];
  /**
   * For a `stockShort` field: the amount left of that line's item, by the same path, numeric(14,3)
   * text (09 Issue to a department 1: the server "names the item and the available amount"; plan of
   * 5.4, decided item 2, Look first). For an `overReturn` field: the department's net received
   * amount of that line's item (plan of 5.6, decided item 5), and for a `reverseOverHeld` field
   * what it still holds (plan of 5.7b). For the `orders` and `stock` fields
   * of a branch's deactivation: counts, not quantities, the branch's unfinished orders and its
   * subtypes with stock above 0, as whole-number text (plan of 5.12, decided items 1 and 2). For a
   * `financeStepWaiting` field: the numbers of the orders that wait for Finance or for settlement,
   * comma-separated (plan of 4.10c). Set only after the action's authorize() passed.
   */
  available?: Record<string, string>;
};

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionFailure };

export function failure(
  code: ActionErrorCode,
  fields?: Record<string, FieldMessageKey>,
  orders?: readonly OrderFailure[],
  available?: Record<string, string>,
): { ok: false; error: ActionFailure } {
  const error: ActionFailure = { code, messageKey: ERROR_MESSAGE_KEYS[code] };
  if (fields) error.fields = fields;
  if (orders) error.orders = orders;
  if (available) error.available = available;
  return { ok: false, error };
}

/** Whether a value is an answer of the wrapper, and not something else that came back. */
export function isActionResult(value: unknown): value is ActionResult<unknown> {
  if (typeof value !== "object" || value === null || !("ok" in value)) return false;
  if (value.ok === true) return "data" in value;
  if (value.ok !== false || !("error" in value)) return false;
  const error = value.error;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code in ERROR_MESSAGE_KEYS
  );
}
