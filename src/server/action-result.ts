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
] as const;
export type FieldErrorKind = (typeof FIELD_ERROR_KINDS)[number];
export type FieldMessageKey = `errors.field.${FieldErrorKind}`;

export type ActionFailure = {
  code: ActionErrorCode;
  messageKey: ErrorMessageKey;
  /** For `invalid_input`: the message key of each field that is wrong, by its path (`lines.0.qty`). */
  fields?: Record<string, FieldMessageKey>;
};

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ActionFailure };

export function failure(
  code: ActionErrorCode,
  fields?: Record<string, FieldMessageKey>,
): { ok: false; error: ActionFailure } {
  const error: ActionFailure = { code, messageKey: ERROR_MESSAGE_KEYS[code] };
  if (fields) error.fields = fields;
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
