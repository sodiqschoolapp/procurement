"use server";

import { serverAction } from "@/server/action";

import { markAllNotificationsRead } from "@/features/notifications/actions/mark-all-read";
import { openNotification } from "@/features/notifications/actions/open-notification";

// The actions of /notifications (plan of 0.11, "Server actions and queries"; decision 8).

const open = serverAction(openNotification);
const markAll = serverAction(markAllNotificationsRead);

/** Marks one of the person's notifications read and returns its link. */
export async function openNotificationAction(input: unknown) {
  return open(input);
}

/** Marks every unread notification of the person read. */
export async function markAllNotificationsReadAction(input: unknown) {
  return markAll(input);
}
