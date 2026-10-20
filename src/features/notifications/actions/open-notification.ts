import { and, eq } from "drizzle-orm";
import * as z from "zod";

import { GLOBAL_TARGET, defineAction } from "@/server/action";
import { now } from "@/server/clock";
import { notifications } from "@/server/db/schema";

import { visibleToItsUser } from "../visible";

// Opening a notification on /notifications: it is marked read and its link goes back to the
// screen, which then follows it (build-plan 0.11: "mark as read"; plan of 0.11, decision 8).
// Through the wrapper's global form: notification.own names no branch (decision 2, Look first);
// the lock reads the row by its id and the signed-in user together, so another person's
// notification is "Not found" (03-roles-and-permissions.md rule 1). Read again: nothing changes,
// the first read_at stays (the trigger notifications_guard allows read_at to be set once). A row
// of a branch the user no longer has is hidden from the bell, so it is "Not found" here too (plan
// of 2.3b, decided item 6, Look first).

export const openNotification = defineAction({
  name: "openNotification",
  permission: "notification.own",
  input: z.object({ id: z.uuid() }),
  async target() {
    return GLOBAL_TARGET;
  },
  async lock({ tx, input, userId }) {
    const [row] = await tx
      .select({ id: notifications.id, link: notifications.link, readAt: notifications.readAt })
      .from(notifications)
      .where(
        and(eq(notifications.id, input.id), eq(notifications.userId, userId), visibleToItsUser),
      )
      .for("update");
    return row ? { target: GLOBAL_TARGET, rows: row } : null;
  },
  async write({ tx, locked }) {
    const row = locked!.rows;
    if (row.readAt === null) {
      await tx.update(notifications).set({ readAt: now() }).where(eq(notifications.id, row.id));
    }
    return { link: row.link };
  },
});
