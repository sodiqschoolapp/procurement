import type { SettingValues } from "@/domain/settings";
import { authorize } from "@/server/authorize";
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
 * The school name for the shell, or `null` until the Head sets it. profile.edit, which every
 * signed-in role holds, like the top bar's branch list: the name is not branch data and every
 * role sees it (plan of 1.1, decision 4, Look first).
 */
export async function getSchoolName(userId: string): Promise<string | null> {
  await authorize(userId, "profile.edit");
  const { db } = await import("@/server/db/client");
  return (await readSettings(db)).school_name;
}
