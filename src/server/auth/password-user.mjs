// Writing a user with a password, outside the login library: the first-Head script
// (scripts/first-head.mjs) and the test helpers use it. Plain .mjs, so a script runs it with
// Node.js alone (decisions 0.2: no tsx). The password is hashed by the library's own function
// (scrypt, plan of 0.6 decision 13), so the library checks it at sign-in.
import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";

/** 3 to 30 lower-case letters, digits, `_` and `.`: the username plugin's rule (plan of 0.6, decision 11). */
export const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;

/** The placeholder email (13-technology.md, Login); `.invalid` can never receive mail (RFC 2606). */
export function placeholderEmail(userId) {
  return `${userId}@users.invalid`;
}

/**
 * Inserts one user and its password account. Runs every statement through `query`, so the caller
 * decides the connection and the transaction.
 * @param {(text: string, values: unknown[]) => Promise<unknown>} query
 * @param {{ fullName: string, username: string, phone: string, role: string, locale?: string, isActive?: boolean }} user
 * @param {string} password any text that is not empty (A8: no password rules)
 * @param {Date} moment the time of the write, from the caller's clock (CLAUDE.md rule 10)
 * @returns {Promise<{ id: string, username: string }>}
 */
export async function insertPasswordUser(query, user, password, moment) {
  const username = user.username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) {
    throw new Error("A username is 3 to 30 letters, digits, _ or . (no spaces).");
  }
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("The password is empty.");
  }
  const id = randomUUID();
  await query(
    `insert into users (id, full_name, username, display_username, email, phone, role, locale,
       is_active, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
    [
      id,
      user.fullName.trim(),
      username,
      user.username.trim(),
      placeholderEmail(id),
      user.phone.trim(),
      user.role,
      user.locale ?? "uz",
      user.isActive ?? true,
      moment,
    ],
  );
  await query(
    `insert into accounts (user_id, account_id, provider_id, password, created_at, updated_at)
     values ($1, $2, 'credential', $3, $4, $4)`,
    [id, id, await hashPassword(password), moment],
  );
  return { id, username };
}
