import type * as z from "zod";

import type { FieldErrorKind, FieldMessageKey } from "./action-result";

// The input check of the action wrapper (developer-rules.md rule 13: "Every input is checked on
// the server with Zod"): what a Zod issue means for the person who typed it, as a message key of
// `errors.field` (plan of 0.8, "What will exist").

function valueAt(input: unknown, path: readonly PropertyKey[]): unknown {
  let value = input;
  for (const part of path) {
    if (typeof value !== "object" || value === null) return undefined;
    value = (value as Record<PropertyKey, unknown>)[part];
  }
  return value;
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined || value === null || (typeof value === "string" && value.trim() === "")
  );
}

/** The kind of one issue. `input` is the whole input, read to tell a missing value from a wrong one. */
export function fieldErrorKind(issue: z.core.$ZodIssue, input: unknown): FieldErrorKind {
  const empty = isEmpty(valueAt(input, issue.path));
  switch (issue.code) {
    case "invalid_type":
      if (empty) return "required";
      return issue.expected === "number" || issue.expected === "int" || issue.expected === "bigint"
        ? "notANumber"
        : "wrongFormat";
    case "too_small":
      if (issue.origin === "string") return empty ? "required" : "tooShort";
      if (issue.origin === "array" || issue.origin === "set") return "required";
      return "tooSmall";
    case "too_big":
      return issue.origin === "string" ? "tooLong" : "tooLarge";
    case "invalid_format":
      return empty ? "required" : "wrongFormat";
    case "custom":
      return empty ? "required" : "wrongFormat";
    default:
      return "notAllowed";
  }
}

/** Each wrong field's message key, by its dotted path (`""` for the input as a whole). The first issue of a field wins. */
export function fieldErrors(error: z.ZodError, input: unknown): Record<string, FieldMessageKey> {
  const fields: Record<string, FieldMessageKey> = {};
  for (const issue of error.issues) {
    const path = issue.path.map(String).join(".");
    if (path in fields) continue;
    fields[path] = `errors.field.${fieldErrorKind(issue, input)}`;
  }
  return fields;
}
