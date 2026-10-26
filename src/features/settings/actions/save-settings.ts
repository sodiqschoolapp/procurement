import * as z from "zod";

import { parseSomOrZero } from "@/domain/money";
import { type OrderFields, PRICE_ASK_CHOICES_NOW, isOrderFields } from "@/domain/order-fields";
import { PAYMENT_TYPES } from "@/domain/payment-types";
import {
  GUARD_OFF,
  HOURS_MAX,
  HOURS_MIN,
  PERCENT_MAX,
  PERCENT_MIN,
  type SettingKey,
  type SettingValues,
  changedSettings,
  isMonthDay,
  isSchoolName,
  settingsFrom,
  storedSettingValue,
} from "@/domain/settings";
import { GLOBAL_TARGET, defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { now } from "@/server/clock";
import { settings } from "@/server/db/schema";
import { SETTINGS_LOCK, parsedSettingRows, selectSettingRows } from "@/server/settings";

// The Head saves the settings on /settings (build-plan 1.1; 03-roles-and-permissions.md,
// Permission matrix: "Manage catalogs, users, branches, settings", Head only). Through the
// wrapper's global form (decisions 0.10b, item 4). The form sends only the keys the Head changed;
// the action writes only the keys whose value differs from the value in force, so two Heads
// changing different keys do not overwrite each other, and the same values again write nothing
// (plan of 1.1, decision 7). No client key and no `repeat`: it changes values, it creates no
// record, and a repeat finds nothing to change (decision 15). One audit row per save, entity
// `settings`, entity id `settings`, `before` and `after` with the same changed keys; `before` is
// the value in force, so a default shows as "20 → 30" (decision 8; review correction 3). The
// order fields are saved as one key, the whole object (05 Fields the Head sets 4: "A change writes
// an audit row"; plan of 2.5d, decided item 3).

const percent = z.number().int().min(PERCENT_MIN).max(PERCENT_MAX);
const hours = z.number().int().min(HOURS_MIN).max(HOURS_MAX);
/** Whole so'm as typed, 0 allowed, read into a bigint (plan of 2.1, decisions 1 and 2). */
const amount = z
  .string()
  .refine((text) => parseSomOrZero(text) !== null)
  .transform((text) => parseSomOrZero(text)!);

/**
 * The fields the Head sets, the whole object (05 Fields the Head sets; plan of 2.5d, decided item
 * 3), checked by isOrderFields() of src/domain/order-fields.ts. The price takes Required
 * only until task 2.5d-b (decided item 1, Look first).
 */
const orderFields = z
  .custom<OrderFields>(isOrderFields)
  .refine((fields) => PRICE_ASK_CHOICES_NOW.includes(fields.price.ask), { path: ["price"] });

/** The limits are those of src/domain/settings.ts; nothing is written here a second time. */
export const settingsInput = z
  .object({
    school_name: z.string().trim().min(1).refine(isSchoolName),
    school_year_start: z
      .object({ month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) })
      .strict()
      .refine(isMonthDay, { path: ["day"] }),
    default_payment_type: z.enum(PAYMENT_TYPES),
    price_hint_percent: percent,
    overspend_guard_percent: z.union([z.literal(GUARD_OFF), percent]),
    overspend_guard_min_amount: amount,
    receipt_required_for_cash: z.boolean(),
    reminder_hours: hours,
    escalation_hours: hours,
    order_fields: orderFields,
  })
  .partial()
  .strict();

export type SettingsInput = z.input<typeof settingsInput>;

/** Values as the settings row and the audit row hold them: the amount as decimal text. */
type StoredSettings = { [Key in SettingKey]?: unknown };

export type SavedSettings = {
  changed: SettingKey[];
  before: StoredSettings;
  after: StoredSettings;
};

/** The keys' values in their stored form (review of the plan of 2.1, Must fix 1). */
function pick(values: Partial<SettingValues>, keys: readonly SettingKey[]): StoredSettings {
  return Object.fromEntries(keys.map((key) => [key, storedSettingValue(key, values[key])]));
}

export const saveSettings = defineAction({
  name: "saveSettings",
  permission: "catalog.manage",
  input: settingsInput,
  async target() {
    return GLOBAL_TARGET;
  },
  async lock({ tx }) {
    await tx.execute(SETTINGS_LOCK);
    const rows = await selectSettingRows(tx).for("update");
    return { target: GLOBAL_TARGET, rows: settingsFrom(parsedSettingRows(rows)) };
  },
  async write({ tx, input, locked }): Promise<SavedSettings> {
    const current = locked!.rows;
    const sent = input as Partial<SettingValues>;
    const changed = changedSettings(current, sent);
    const at = now();
    for (const key of changed) {
      const value = storedSettingValue(key, sent[key]);
      await tx
        .insert(settings)
        .values({ key, value, createdAt: at })
        .onConflictDoUpdate({ target: settings.key, set: { value } });
    }
    return { changed, before: pick(current, changed), after: pick(sent, changed) };
  },
  async history({ tx, userId }, result) {
    // No change, no row (developer-rules.md rule 13 records changes).
    if (result.changed.length === 0) return;
    await audit(
      { tx, userId },
      {
        action: "settings.change",
        entity: "settings",
        entityId: "settings",
        before: result.before,
        after: result.after,
        at: now(),
      },
    );
  },
});
