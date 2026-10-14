import { sql } from "drizzle-orm";
import * as z from "zod";

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
} from "@/domain/settings";
import { GLOBAL_TARGET, defineAction } from "@/server/action";
import { audit } from "@/server/audit";
import { now } from "@/server/clock";
import { settings } from "@/server/db/schema";

// The Head saves the settings on /settings (build-plan 1.1; 03-roles-and-permissions.md,
// Permission matrix: "Manage catalogs, users, branches, settings", Head only). Through the
// wrapper's global form (decisions 0.10b, item 4). The form sends only the keys the Head changed;
// the action writes only the keys whose value differs from the value in force, so two Heads
// changing different keys do not overwrite each other, and the same values again write nothing
// (plan of 1.1, decision 7). No client key and no `repeat`: it changes values, it creates no
// record, and a repeat finds nothing to change (decision 15). One audit row per save, entity
// `settings`, entity id `settings`, `before` and `after` with the same changed keys; `before` is
// the value in force, so a default shows as "20 → 30" (decision 8; review correction 3).

const percent = z.number().int().min(PERCENT_MIN).max(PERCENT_MAX);
const hours = z.number().int().min(HOURS_MIN).max(HOURS_MAX);

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
    receipt_required_for_cash: z.boolean(),
    reminder_hours: hours,
    escalation_hours: hours,
  })
  .partial()
  .strict();

export type SettingsInput = z.input<typeof settingsInput>;

/** The settings advisory lock: seed 1, apart from the wrapper's client-key locks (seed 0). */
const SETTINGS_LOCK = sql`select pg_advisory_xact_lock(hashtextextended('settings', 1))`;

export type SavedSettings = {
  changed: SettingKey[];
  before: Partial<SettingValues>;
  after: Partial<SettingValues>;
};

function pick(values: Partial<SettingValues>, keys: readonly SettingKey[]): Partial<SettingValues> {
  return Object.fromEntries(keys.map((key) => [key, values[key]])) as Partial<SettingValues>;
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
    const rows = await tx
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .for("update");
    return { target: GLOBAL_TARGET, rows: settingsFrom(rows) };
  },
  async write({ tx, input, locked }): Promise<SavedSettings> {
    const current = locked!.rows;
    const sent = input as Partial<SettingValues>;
    const changed = changedSettings(current, sent);
    const at = now();
    for (const key of changed) {
      await tx
        .insert(settings)
        .values({ key, value: sent[key], createdAt: at })
        .onConflictDoUpdate({ target: settings.key, set: { value: sent[key] } });
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
