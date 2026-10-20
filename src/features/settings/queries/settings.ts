import { desc, eq } from "drizzle-orm";

import { type BusinessDate, businessDate } from "@/domain/business-date";
import type { SettingValues } from "@/domain/settings";
import { authorize } from "@/server/authorize";
import { databaseCopies } from "@/server/db/schema";
import { readSettings } from "@/server/settings";

// The settings for screens (build-plan 1.1). Every query calls authorize() (developer-rules.md
// rule 4). No branch filter: the settings belong to the whole school, not to a branch.

/** The values in force for the Head's /settings form: "Manage … settings", Head only (03). */
export async function getSettingsForHead(userId: string): Promise<SettingValues> {
  await authorize(userId, "catalog.manage");
  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  const { db } = await import("@/server/db/client");
  return readSettings(db);
}

/**
 * The Tashkent date of the last good copy of the database, or `null` when none was made yet
 * (13-technology.md, Running it: "the Head's Settings page shows the date of the last copy"; plan
 * of 8.2b, decided item 7): the day of the job's tick, the date in the file's name. The Head only,
 * as the page.
 */
export async function getLastDatabaseCopy(userId: string): Promise<BusinessDate | null> {
  await authorize(userId, "catalog.manage");
  const { db } = await import("@/server/db/client");
  const [good] = await db
    .select({ tick: databaseCopies.tick })
    .from(databaseCopies)
    .where(eq(databaseCopies.succeeded, true))
    .orderBy(desc(databaseCopies.tick))
    .limit(1);
  return good ? businessDate(good.tick) : null;
}

/**
 * The school name for the shell, or `null` until the Head sets it. profile.edit, which every
 * signed-in role holds, like the top bar's branch list: the name is not branch data and every
 * role sees it (plan of 1.1, decision 4, Look first).
 */
export async function getSchoolName(userId: string): Promise<string | null> {
  await authorize(userId, "profile.edit");
  const { db } = await import("@/server/db/client");
  return (await readSettings(db)).school_name;
}
