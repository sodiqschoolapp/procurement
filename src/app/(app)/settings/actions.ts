"use server";

import { revalidatePath } from "next/cache";

import { serverAction } from "@/server/action";

import { saveSettings } from "@/features/settings/actions/save-settings";
import { switchFinanceStep } from "@/features/settings/actions/switch-finance-step";

// The action of /settings (plan of 1.1, "Server actions and queries"). A success revalidates the
// signed-in layout, so the school name in the menu comes back with the answer.

const run = serverAction(saveSettings);
const runSwitch = serverAction(switchFinanceStep);

/** Saves the settings the Head changed. */
export async function saveSettingsAction(input: unknown) {
  const result = await run(input);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/**
 * Switches the Finance step off or on (06 Finance step switched off; plan of 4.10c). Every page
 * reads the step on its next load: the order pages, the Principal's approval and the users page.
 */
export async function switchFinanceStepAction(input: unknown) {
  const result = await runSwitch(input);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
