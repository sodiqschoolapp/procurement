import { type SQL, sql } from "drizzle-orm";

import { notifications } from "@/server/db/schema";

// The bell's branch wall (10-notifications-analytics-reports.md, Notifications: "The bell shows
// only notifications of branches the reader has now"; build-plan 2.3b). Every reader of one's own
// notifications filters by `user_id` first, so the reader is the row's user: a row shows when it
// has no branch (a notice of no branch, or a row from before migration 0051), when its user is a
// Head (every branch), or when its user holds its branch in user_branches now. Read in the same
// statement as the rows; the count, the list, opening and "Mark all as read" all use it (plan of
// 2.3b, decided items 6 and 7, Look first).
export const visibleToItsUser: SQL<boolean> = sql<boolean>`(${notifications.branchId} is null
  or exists (select 1 from users r where r.id = ${notifications.userId} and r.role = 'HEAD')
  or exists (select 1 from user_branches rb
             where rb.user_id = ${notifications.userId} and rb.branch_id = ${notifications.branchId}))`;
