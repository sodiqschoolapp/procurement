// The core of `npm run user:renew-head` (03-roles-and-permissions.md rule 4: "A Head who forgot
// the password gets a new one from a command run in the hosting console, which signs that Head out
// everywhere and writes an audit row"; A8; D55 item 8; build-plan 8.2b). The command line is
// scripts/renew-head.mjs. Plain .mjs, so the image's console runs it with Node.js alone.
import { hashPassword } from "better-auth/crypto";

import { insertAuditRow } from "../src/server/audit-row.mjs";

/** The longest password the app takes, as the Head's form (`passwordInput`, 0.6 item 12). */
export const PASSWORD_MAX = 4096;

/**
 * Renews the password of one active Head, in one transaction: the password replaced by the login
 * library's hash, every session of that Head ended, and a `user.renew_password` audit row whose
 * actor is the Head (the first Head's row is its own, 0.9 item 4: nobody else acts in the
 * console). An unknown username, an inactive Head and a user of another role get one message, so
 * the console does not tell which usernames exist (plan of 8.2b, decided item 9).
 * @param {import("pg").ClientBase} client a connected client, not inside a transaction
 * @param {{ username: string, password: string }} input
 * @param {Date} moment
 * @returns {Promise<{ id: string, username: string, sessionsEnded: number }>}
 */
export async function renewHeadPassword(client, input, moment) {
  if (typeof input.password !== "string" || input.password.length === 0) {
    throw new Error("Refused: the password is empty. Nothing was changed.");
  }
  if (input.password.length > PASSWORD_MAX) {
    throw new Error(
      `Refused: a password is at most ${PASSWORD_MAX} characters. Nothing was changed.`,
    );
  }
  const username = input.username.trim().toLowerCase();
  // Hashed before the transaction: scrypt takes a moment, and no row waits for it.
  const hash = await hashPassword(input.password);
  await client.query("begin");
  try {
    const found = await client.query(
      `select id, username from users
       where username = $1 and role = 'HEAD' and is_active
       for update`,
      [username],
    );
    if (found.rowCount !== 1) throw new Error("Refused: no active Head has this username.");
    const head = found.rows[0];
    const renewed = await client.query(
      `update accounts set password = $1, updated_at = $2
       where user_id = $3 and provider_id = 'credential'`,
      [hash, moment, head.id],
    );
    if (renewed.rowCount !== 1) {
      throw new Error("Refused: this Head has no password account. Nothing was changed.");
    }
    // "A renewal signs that user out on every device at once" (A8).
    const ended = await client.query("delete from sessions where user_id = $1", [head.id]);
    // No field at all, as the Head's renewal of another user (1.3 item 13): no password in it.
    await insertAuditRow((text, values) => client.query(text, values), {
      actorId: head.id,
      action: "user.renew_password",
      entity: "users",
      entityId: head.id,
      before: {},
      after: {},
      at: moment,
    });
    await client.query("commit");
    return { id: head.id, username: head.username, sessionsEnded: ended.rowCount ?? 0 };
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
