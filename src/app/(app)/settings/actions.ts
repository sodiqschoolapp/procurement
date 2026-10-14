"use server";

import { revalidatePath } from "next/cache";

import { serverAction } from "@/server/action";

import { saveSettings } from "@/features/settings/actions/save-settings";

// The action of /settings (plan of 1.1, "Server actions and queries"). A success revalidates the
// signed-in layout, so the school name in the menu comes back with the answer.

const run = serverAction(saveSettings);

/** Saves the settings the Head changed. */
export async function saveSettingsAction(input: unknown) {
  const result = await run(input);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
