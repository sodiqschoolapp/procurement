import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { businessDate, nextBusinessDate } from "@/domain/business-date";
import { STUCK_STATUSES, stuckBefore } from "@/domain/order-steps";
import {
  type Approver,
  NEEDED_BY_NEAR_DAYS,
  nearNotices,
  waitingNotices,
} from "@/domain/reminders";
import { enteredCurrentStatusAt, stillDueWhere } from "@/features/orders/queries/order-sql";
import { now } from "@/server/clock";
import { branches, orders, userBranches, users } from "@/server/db/schema";
import { notify } from "@/server/notify";
import { readSettings } from "@/server/settings";

import type { Job } from "./job";

// The reminders (build-plan 8.1; 06-approval-workflow.md rule 9; 10-notifications-analytics-
// reports.md, Notifications). Once a day, at the 00:00 Tashkent tick; the scheduler runs a missed
// day at its first round of that day (plan of 8.1, decided item 5, Look first). It runs as the
// system (plan of 0.13, decision 1): no user, no authorize(); it only writes notifications, through
// notify() with `userId: null`, in its savepoint, so a run that throws tells nobody.
//
// Three reads, whatever the number of orders (developer-rules.md rule 12): the orders at a Waiting
// step past the smaller setting, the active approvers, the orders needed by soon. "Waited more
// than N hours" and "buying not finished" are the SQL the order list reads (./order-sql.ts of the
// orders feature; decided items 4 and 7), compared with stuckBefore() of the injected clock.

export const reminders: Job = {
  name: "reminders",
  schedule: { everyMinutes: 1440 },
  async run({ tx }) {
    const at = now();
    const settings = await readSettings(tx);
    const hours = { reminder: settings.reminder_hours, escalation: settings.escalation_hours };
    const before = (setting: number) => sql`${stuckBefore(at, setting).toISOString()}::timestamptz`;

    const waiting = await tx
      .select({
        status: orders.status,
        branchId: orders.branchId,
        pastReminder: sql<boolean>`${enteredCurrentStatusAt} < ${before(hours.reminder)}`,
        pastEscalation: sql<boolean>`${enteredCurrentStatusAt} < ${before(hours.escalation)}`,
      })
      .from(orders)
      .where(
        and(
          inArray(orders.status, [...STUCK_STATUSES]),
          sql`${enteredCurrentStatusAt} < ${before(Math.min(hours.reminder, hours.escalation))}`,
        ),
      );

    // Every active Head, and the active Principals and Finance users with their branches.
    const approverRows = await tx
      .select({
        id: users.id,
        role: users.role,
        branchIds: sql<string[]>`coalesce(array_agg(${userBranches.branchId}::text)
          filter (where ${userBranches.branchId} is not null), '{}')`,
      })
      .from(users)
      .leftJoin(
        userBranches,
        and(eq(userBranches.userId, users.id), eq(userBranches.userIsActive, true)),
      )
      .where(and(eq(users.isActive, true), inArray(users.role, ["HEAD", "PRINCIPAL", "FINANCE"])))
      .groupBy(users.id, users.role);
    const approvers = approverRows as Approver[];

    for (const notice of waitingNotices(waiting, approvers, hours)) {
      await notify(
        { tx, userId: null },
        // The count is already cut to each recipient's branches and the text names no branch
        // (decided item 6).
        {
          to: notice.to,
          type: notice.type,
          params: notice.params,
          branchId: null,
          link: notice.link,
          at,
        },
      );
    }

    // Needed by today to today + 2 and still due (decided item 7, Look first).
    const today = businessDate(at);
    let last = today;
    for (let day = 0; day < NEEDED_BY_NEAR_DAYS; day += 1) last = nextBusinessDate(last);
    const near = await tx
      .select({ ownerId: orders.ownerId, branchId: orders.branchId, branchCode: branches.code })
      .from(orders)
      .innerJoin(branches, eq(branches.id, orders.branchId))
      .where(and(gte(orders.neededBy, today), lte(orders.neededBy, last), stillDueWhere()))
      .orderBy(orders.ownerId, branches.code);

    for (const notice of nearNotices(near)) {
      await notify(
        { tx, userId: null },
        {
          to: notice.to,
          type: "NEEDED_BY_NEAR",
          params: notice.params,
          branchId: notice.branchId,
          link: notice.link,
          at,
        },
      );
    }
  },
};
