"use server";

import { serverAction } from "@/server/action";

import { chooseOwnLanguage } from "@/features/catalog/actions/own-language";

// The actions of /profile (plan of 0.10b, "Server actions and queries").

const run = serverAction(chooseOwnLanguage);

/** Saves the person's own language; the page re-renders in it after router.refresh(). */
export async function chooseOwnLanguageAction(input: unknown) {
  return run(input);
}
