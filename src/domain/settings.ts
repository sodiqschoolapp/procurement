import { PAYMENT_TYPES, type PaymentType } from "./payment-types";

// The settings of the school (14-data-model.md, System: `settings key KEY, value JSONB`, and
// Notes for the build: the keys and their defaults; build-plan 1.1). Pure: the keys, the default
// of each, the shape a value must have, and the limits, written once (CLAUDE.md rule 1). The
// accessor of src/server/settings.ts reads the rows through settingsFrom(); the action's Zod
// schema takes its limits from here; migration 0007 holds the same limits as CHECKs, and
// src/server/db/schema/settings-values.db.test.ts checks every edge of the SQL against these
// constants (plan of 1.1, review Should fix 1 and correction 2).

/** A whole percent: the price hint and the overspend guard (plan of 1.1, decision 2, Look first). */
export const PERCENT_MIN = 0;
export const PERCENT_MAX = 1000;
/** Hours before a reminder and before the Head is told (06-approval-workflow.md rule 8). */
export const HOURS_MIN = 1;
export const HOURS_MAX = 720;
/** The school name, trimmed (decision 10). */
export const SCHOOL_NAME_MAX = 120;

/** The overspend guard switched off (08-money-and-settlement.md, Overspend guard; decision 1). */
export const GUARD_OFF = "off";

/** The first day of the school year: a month and a day (14, Notes; D10; decision 9). */
export type MonthDay = { month: number; day: number };

export type SettingValues = {
  default_payment_type: PaymentType;
  price_hint_percent: number;
  /** A whole percent, or `"off"`: 0 means every overspend needs the Head (08). */
  overspend_guard_percent: number | typeof GUARD_OFF;
  reminder_hours: number;
  escalation_hours: number;
  receipt_required_for_cash: boolean;
  /** No default: `null` until the Head sets it. */
  school_name: string | null;
  /** No default: `null` until the Head sets it; the school-year period is hidden till then (10). */
  school_year_start: MonthDay | null;
};

export type SettingKey = keyof SettingValues;

/** The eight keys, in the order the screen shows them. */
export const SETTING_KEYS = [
  "school_name",
  "school_year_start",
  "default_payment_type",
  "price_hint_percent",
  "overspend_guard_percent",
  "receipt_required_for_cash",
  "reminder_hours",
  "escalation_hours",
] as const satisfies readonly SettingKey[];

/**
 * The value of each key with no row. `default_payment_type` is Cash: 05-order-request-form.md
 * field 12, "Default is Cash (a setting)"; the rest are 14-data-model.md, Notes for the build.
 */
export const SETTING_DEFAULTS: SettingValues = {
  default_payment_type: "CASH",
  price_hint_percent: 20,
  overspend_guard_percent: 10,
  reminder_hours: 24,
  escalation_hours: 48,
  receipt_required_for_cash: false,
  school_name: null,
  school_year_start: null,
};

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** The last day of a month in every year: February has 28, as 29 February is not in every year. */
export function lastDayOf(month: number): number {
  return DAYS_IN_MONTH[month - 1] ?? 0;
}

function isWhole(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

export function isPercent(value: unknown): value is number {
  return isWhole(value, PERCENT_MIN, PERCENT_MAX);
}

export function isHours(value: unknown): value is number {
  return isWhole(value, HOURS_MIN, HOURS_MAX);
}

export function isGuard(value: unknown): value is number | typeof GUARD_OFF {
  return value === GUARD_OFF || isPercent(value);
}

export function isPaymentType(value: unknown): value is PaymentType {
  return typeof value === "string" && (PAYMENT_TYPES as readonly string[]).includes(value);
}

/**
 * Trimmed, 1 to 120 characters (decision 10). Characters are counted as PostgreSQL's
 * `char_length` counts them, by code point, so the CHECK of migration 0007 agrees.
 */
export function isSchoolName(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value) return false;
  const length = Array.from(value).length;
  return length >= 1 && length <= SCHOOL_NAME_MAX;
}

/** A day that exists in that month every year; exactly the keys `month` and `day` (decision 9). */
export function isMonthDay(value: unknown): value is MonthDay {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== "day" || keys[1] !== "month") return false;
  const { month, day } = value as Record<string, unknown>;
  return isWhole(month, 1, 12) && isWhole(day, 1, lastDayOf(month as number));
}

/** The check of each key's value; `null` is never a stored value (decision 6). */
export const SETTING_CHECKS: { [Key in SettingKey]: (value: unknown) => boolean } = {
  default_payment_type: isPaymentType,
  price_hint_percent: isPercent,
  overspend_guard_percent: isGuard,
  reminder_hours: isHours,
  escalation_hours: isHours,
  receipt_required_for_cash: (value) => typeof value === "boolean",
  school_name: isSchoolName,
  school_year_start: isMonthDay,
};

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTING_DEFAULTS, key);
}

/**
 * The values in force from the stored rows: a key with no row has its default, an unknown key
 * is ignored. A stored value of the wrong shape cannot exist (the CHECKs of migration 0007); if
 * one did, this throws rather than guess a money rule's value.
 */
export function settingsFrom(rows: readonly { key: string; value: unknown }[]): SettingValues {
  const values: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const { key, value } of rows) {
    if (!isSettingKey(key)) continue;
    if (!SETTING_CHECKS[key](value)) {
      throw new Error(`The stored value of the setting ${key} has the wrong shape.`);
    }
    values[key] = value;
  }
  return values as SettingValues;
}

/** Whether two values of a setting are the same; a month and day compare by their numbers. */
export function sameSettingValue(a: unknown, b: unknown): boolean {
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
    const x = a as Partial<MonthDay>;
    const y = b as Partial<MonthDay>;
    return x.month === y.month && x.day === y.day;
  }
  return a === b;
}

/**
 * The keys of `sent` whose value differs from the value in force, in the screen's order. Only
 * these are written and audited (plan of 1.1, decision 7; review correction 3).
 */
export function changedSettings(
  current: SettingValues,
  sent: Partial<SettingValues>,
): SettingKey[] {
  return SETTING_KEYS.filter(
    (key) => sent[key] !== undefined && !sameSettingValue(current[key], sent[key]),
  );
}
