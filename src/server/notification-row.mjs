// The one statement that writes notifications (10-notifications-analytics-reports.md,
// Notifications; build-plan 0.11). Plain .mjs, so the development script scripts/dev-notify.mjs
// writes its row the same way as notify() of src/server/notify.ts (plan of 0.11, decision 11).
// The caller gives the query and so the transaction; this file never opens one.
//
// One statement for every recipient (developer-rules.md rule 12: no query in a loop): one row per
// active user among `userIds`, each named once, the actor left out (plan of 0.11, decision 5).
// When the event is about a branch, only a Head or a person of that branch is told: a recipient
// list worked out wrongly by a later task cannot carry a branch's request number or amount to
// another branch (permission review of 0.11, Should fix 1; 03-roles-and-permissions.md rule 1).

export const INSERT_NOTIFICATIONS = `insert into notifications
     (user_id, type, params, link, created_at)
   select u.id, $2::notification_type, $3::jsonb, $4, $5
   from users u
   where u.id in (select jsonb_array_elements_text($1::jsonb)::uuid)
     and u.is_active
     and ($6::uuid is null or u.id <> $6::uuid)
     and ($7::uuid is null
          or u.role = 'HEAD'
          or exists (select 1 from user_branches ub
                     where ub.user_id = u.id and ub.branch_id = $7::uuid))`;

/**
 * @typedef {{
 *   userIds: readonly string[],
 *   actorId: string | null,
 *   branchId: string | null,
 *   type: string,
 *   params: { readonly [key: string]: string | number },
 *   link: string,
 *   at: Date,
 * }} NotificationRows
 */

/**
 * Writes the notifications through `query`, in the caller's transaction, and returns how many.
 * @param {(text: string, values: unknown[]) => Promise<{ rowCount?: number | null }>} query
 * @param {NotificationRows} rows
 * @returns {Promise<number>}
 */
export async function insertNotifications(query, rows) {
  if (!(rows.at instanceof Date) || Number.isNaN(rows.at.getTime())) {
    throw new Error("Refused: a notification needs the moment of the clock (CLAUDE.md rule 10).");
  }
  if (rows.userIds.length === 0) return 0;
  const result = await query(INSERT_NOTIFICATIONS, [
    // As a JSON array: Drizzle's `sql` would spread a JavaScript array into a list.
    JSON.stringify(rows.userIds),
    rows.type,
    JSON.stringify(rows.params),
    rows.link,
    rows.at,
    rows.actorId,
    rows.branchId,
  ]);
  return result.rowCount ?? 0;
}
