import { refuseSecretFields } from "./audit-secrets.mjs";

// What an audit row holds (developer-rules.md rule 13: "Changes to catalogs, users and settings
// go to an audit log"; 14-data-model.md, System: audit_log). Pure: src/server/audit.ts writes
// the row, and the change-history component shows what changedFields() returns.

/** The actions that write an audit row; each later task adds its own (plan of 0.9, decision 5). */
export const AUDIT_ACTIONS = [
  "user.create",
  "user.change_language",
  "user.update",
  "user.deactivate",
  "user.activate",
  "user.renew_password",
  "user.switch_right",
  "branch.create",
  "branch.update",
  "branch.deactivate",
  "branch.activate",
  "unit.create",
  "unit.update",
  "unit.deactivate",
  "unit.activate",
  "category.create",
  "category.update",
  "category.deactivate",
  "category.activate",
  "extra_cost_type.create",
  "extra_cost_type.update",
  "extra_cost_type.deactivate",
  "extra_cost_type.activate",
  "company.create",
  "company.update",
  "company.deactivate",
  "company.activate",
  "department.create",
  "department.update",
  "department.deactivate",
  "department.activate",
  "product.create",
  "product.update",
  "product.deactivate",
  "product.activate",
  "subtype.create",
  "subtype.update",
  "subtype.deactivate",
  "subtype.activate",
  "price.add",
  "suggestion.create",
  "suggestion.add",
  "suggestion.decline",
  "settings.change",
  "direct_entry.create",
  "direct_entry.reverse",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditJson =
  string | number | boolean | null | AuditJson[] | { [key: string]: AuditJson };
export type AuditObject = { [key: string]: AuditJson };

/** A record as an action has it: money as bigint, moments as Date. */
export type AuditRecord = { readonly [key: string]: unknown };

function toJson(value: unknown, path: string): AuditJson | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  // Money stays exact: its decimal text, never a JavaScript number (developer-rules.md rule 6).
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Refused: "${path}" is not a finite number.`);
    return value;
  }
  // A moment as its UTC ISO text (developer-rules.md rule 10).
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`Refused: "${path}" is an invalid date.`);
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => toJson(item, `${path}[${index}]`) ?? null);
  }
  if (typeof value === "object") return toObject(value as AuditRecord, path);
  throw new Error(`Refused: "${path}" cannot be stored in an audit row.`);
}

function toObject(record: AuditRecord, path: string): AuditObject {
  const result: AuditObject = {};
  for (const [name, value] of Object.entries(record)) {
    const converted = toJson(value, path ? `${path}.${name}` : name);
    if (converted !== undefined) result[name] = converted;
  }
  return result;
}

/**
 * The JSON stored in `before` or `after`: a bigint becomes its exact decimal text, a Date its UTC
 * ISO text, an undefined field is left out. Refuses a secret field name at any depth (plan of
 * 0.9, decision 7).
 */
export function auditValue(record: AuditRecord): AuditObject {
  refuseSecretFields(record);
  return toObject(record, "");
}

export type FieldChange = { field: string; before: AuditJson | null; after: AuditJson | null };

/** The same JSON text for equal values, whatever the order of an object's keys. */
function canonical(value: AuditJson | undefined): string {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * The fields whose values differ between two audit values, ordered by field name. A field only
 * in `after` was added (`before` null), a field only in `before` was removed (`after` null). A
 * create (`before` null) lists every field of `after`.
 */
export function changedFields(
  before: AuditObject | null,
  after: AuditObject | null,
): FieldChange[] {
  const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  return [...fields]
    .sort()
    .filter((field) => canonical(before?.[field]) !== canonical(after?.[field]))
    .map((field) => ({ field, before: before?.[field] ?? null, after: after?.[field] ?? null }));
}
