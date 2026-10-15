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
