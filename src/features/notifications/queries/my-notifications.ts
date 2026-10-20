import { and, count, desc, eq, isNull } from "drizzle-orm";
import * as z from "zod";

import {
  NOTIFICATIONS_MAX_PAGE,
  NOTIFICATIONS_PAGE_SIZE,
  type NotificationParams,
  type NotificationType,
} from "@/domain/notifications";
import { authorize } from "@/server/authorize";
import { notifications } from "@/server/db/schema";

import { visibleToItsUser } from "../visible";

// The signed-in person's own notifications (10-notifications-analytics-reports.md,
// Notifications: "an in-app bell with an unread count"; 11-screens-and-ux.md, Screens:
// `/notifications`, All). Through notification.own (plan of 0.11, decision 2, Look first); the
// SQL filters by the user, so nobody reads another person's notifications, and by the branches the
// reader has now (`visibleToItsUser`; build-plan 2.3b, which replaces decision 4 of 0.11, D55 item
// 20). 25 a page, newest first (11-screens-and-ux.md rule 8).

const listInput = z.object({
  page: z.number().int().min(1).max(NOTIFICATIONS_MAX_PAGE).default(1),
});

export type NotificationRow = {
  id: string;
  type: NotificationType;
  params: NotificationParams;
  link: string;
  readAt: Date | null;
  createdAt: Date;
};

export type NotificationPage = { rows: NotificationRow[]; page: number; hasMore: boolean };

/** One page of the user's notifications, newest first. */
export async function listMyNotifications(
  userId: string,
  rawInput: z.input<typeof listInput>,
): Promise<NotificationPage> {
  await authorize(userId, "notification.own");
  const input = listInput.parse(rawInput);

  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  const { db } = await import("@/server/db/client");
  const found = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      params: notifications.params,
      link: notifications.link,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), visibleToItsUser))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(NOTIFICATIONS_PAGE_SIZE + 1)
    .offset((input.page - 1) * NOTIFICATIONS_PAGE_SIZE);

  const rows = found.slice(0, NOTIFICATIONS_PAGE_SIZE).map((row) => ({
    ...row,
    params: row.params as NotificationParams,
  }));
  return { rows, page: input.page, hasMore: found.length > NOTIFICATIONS_PAGE_SIZE };
}

/** The bell's number: the user's unread notifications. */
export async function countMyUnread(userId: string): Promise<number> {
  await authorize(userId, "notification.own");
  const { db } = await import("@/server/db/client");
  const [row] = await db
    .select({ unread: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), visibleToItsUser));
  return row?.unread ?? 0;
}
