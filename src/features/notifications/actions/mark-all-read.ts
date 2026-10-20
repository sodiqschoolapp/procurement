import { and, eq, inArray, isNull } from "drizzle-orm";
import * as z from "zod";

import { GLOBAL_TARGET, defineAction } from "@/server/action";
import { now } from "@/server/clock";
import { notifications } from "@/server/db/schema";

import { visibleToItsUser } from "../visible";

// "Mark all as read" on /notifications (plan of 0.11, decision 8). The signed-in user's unread
// rows the bell shows only (plan of 2.3b, decided item 6), locked and then marked in one statement, through the wrapper's global form
// (decision 2, Look first). It loses nothing, so it asks no confirmation.

export const markAllNotificationsRead = defineAction({
  name: "markAllNotificationsRead",
  permission: "notification.own",
  input: z.object({}),
  async target() {
    return GLOBAL_TARGET;
  },
  async lock({ tx, userId }) {
    const rows = await tx
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), visibleToItsUser))
      .for("update");
    return { target: GLOBAL_TARGET, rows: rows.map((row) => row.id) };
  },
  async write({ tx, locked }) {
    const ids = locked!.rows;
    if (ids.length === 0) return { count: 0 };
    await tx.update(notifications).set({ readAt: now() }).where(inArray(notifications.id, ids));
    return { count: ids.length };
  },
});
