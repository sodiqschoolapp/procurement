import { sql } from "drizzle-orm";

import { type SettingValues, settingsFrom } from "@/domain/settings";
import type { Executor } from "@/server/authorize";
import { settings } from "@/server/db/schema";

// The typed settings accessor (build-plan 1.1; 14-data-model.md, Notes for the build): the one
// way every later task reads a setting (the price hint and default payment type of 2.x, the
// receipt rule and the overspend guard of 3.x and 4.x, the school year of 6.x, the reminder hours
// of 8.1, the school name of the PDF). A missing key has its default; `school_name` and
// `school_year_start` are `null` until set (src/domain/settings.ts).
//
// It checks no permission, like audit(): it is called only inside an action or a query that has
// already called authorize(), with that action's transaction or the query's client (plan of 1.1,
// decision 4, Look first; review of the plan, decision 4). A page never calls it: it reads the
// settings through src/features/settings/queries/.

/**
 * The stored rows, each value read as its JSON text and parsed once here. Drizzle's jsonb column
 * parses a JSON text a second time after the driver, so a stored `"100000"` would come back as
 * the number 100000 and a school name of digits as a number (plan of 2.1, decision 1: the amount
 * is a JSON text and must stay one). `for("update")` can follow, as in saveSettings.
 */
export function selectSettingRows(executor: Executor) {
  return executor
    .select({ key: settings.key, json: sql<string>`${settings.value}::text` })
    .from(settings);
}

/** The rows of selectSettingRows() with each value parsed. */
export function parsedSettingRows(rows: readonly { key: string; json: string }[]) {
  return rows.map(({ key, json }) => ({ key, value: JSON.parse(json) as unknown }));
}

/** The values in force, read with the caller's transaction or client. */
export async function readSettings(executor: Executor): Promise<SettingValues> {
  return settingsFrom(parsedSettingRows(await selectSettingRows(executor)));
}

/**
 * The settings advisory lock: seed 1, apart from the wrapper's client-key locks (seed 0). A write
 * of the settings takes it exclusive (`saveSettings`, `switchFinanceStep`, `switchPrincipalStep`).
 * The approvals of the Head and the Principal, and the Submit of a Head-created order, take it
 * shared before they read the steps (`approvalSteps()`), so a switch and such a move cannot cross:
 * the switch counts the waiting orders only once no move holds it, and a move reads the steps only
 * once no switch holds it (06 Finance step switched off 5; Principal step switched off 4; plan of
 * 4.10c, decided item 1; plan of 4.10d, decided items 1 and 2, Look first). Shared, so approvals
 * never wait for each other.
 */
export const SETTINGS_LOCK = sql`select pg_advisory_xact_lock(hashtextextended('settings', 1))`;
export const SETTINGS_LOCK_SHARED = sql`select pg_advisory_xact_lock_shared(hashtextextended('settings', 1))`;

/**
 * The two approval steps as they are now, read after the settings lock is taken shared, in the
 * caller's transaction (READ COMMITTED: a switch that committed before the lock was granted is
 * seen). For the moves that read them: the Head's and the Principal's approvals, a Head-created
 * Submit (plan of 4.10d, decided items 1 and 2, Look first).
 */
export async function approvalSteps(
  executor: Executor,
): Promise<{ principalStep: boolean; financeStep: boolean }> {
  await executor.execute(SETTINGS_LOCK_SHARED);
  const values = await readSettings(executor);
  return { principalStep: values.principal_step, financeStep: values.finance_step };
}
