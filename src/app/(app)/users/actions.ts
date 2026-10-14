"use server";

import { revalidatePath } from "next/cache";

import { switchManagerRight } from "@/features/users/actions/manager-rights";
import {
  createUser,
  renewUserPassword,
  setUserActive,
  updateUser,
} from "@/features/users/actions/users";
import { serverAction } from "@/server/action";

// The actions of /users (plan of 1.3, "Server actions and queries"). A success revalidates the
// signed-in layout: a vacancy notice reaches the bell, and the Head's own name or language may
// have changed.

const create = serverAction(createUser);
const update = serverAction(updateUser);
const setActive = serverAction(setUserActive);
const renew = serverAction(renewUserPassword);
const switchRight = serverAction(switchManagerRight);

/** Creates a user; the same client key twice gives the first one (developer-rules.md rule 8). */
export async function createUserAction(input: unknown) {
  const result = await create(input);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Saves the fields the Head changed. */
export async function updateUserAction(input: unknown) {
  const result = await update(input);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Deactivates or activates a user. */
export async function setUserActiveAction(input: unknown) {
  const result = await setActive(input);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Renews another user's password and signs them out everywhere (A8). */
export async function renewUserPasswordAction(input: unknown) {
  const result = await renew(input);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Switches one of a Manager's nine rights on or off (03, "Manager rights the Head can switch"). */
export async function switchManagerRightAction(input: unknown) {
  const result = await switchRight(input);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
