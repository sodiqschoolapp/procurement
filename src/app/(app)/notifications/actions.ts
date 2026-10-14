"use server";

import { revalidatePath } from "next/cache";

import { serverAction } from "@/server/action";

import { markAllNotificationsRead } from "@/features/notifications/actions/mark-all-read";
import { openNotification } from "@/features/notifications/actions/open-notification";

// The actions of /notifications (plan of 0.11, "Server actions and queries"; decision 8). A
// success revalidates the signed-in layout, so the bell's count comes back with the action's
// answer; the screen then only navigates (a push and a refresh at once can leave the address
// behind the page).

const open = serverAction(openNotification);
const markAll = serverAction(markAllNotificationsRead);

/** Marks one of the person's notifications read and returns its link. */
export async function openNotificationAction(input: unknown) {
  const result = await open(input);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

/** Marks every unread notification of the person read. */
export async function markAllNotificationsReadAction(input: unknown) {
  const result = await markAll(input);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
