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

/** The values in force, read with the caller's transaction or client. */
export async function readSettings(executor: Executor): Promise<SettingValues> {
  const rows = await executor.select({ key: settings.key, value: settings.value }).from(settings);
  return settingsFrom(rows);
}
