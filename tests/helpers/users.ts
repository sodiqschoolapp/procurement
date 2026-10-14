import { db } from "@/server/db/client";
import { now } from "@/server/clock";
import { type SessionCookie } from "@/server/auth/session-cookie";
import { signIn } from "@/server/auth/sign-in";

import { insertPasswordUser } from "../../src/server/auth/password-user.mjs";
import { type InventedRole, type InventedUser, inventedUser } from "./invented";

// Users in the database for tests (progress 0.4: "`insertUser()`: 0.6"). Every person is
// invented (CLAUDE.md, Conventions); the password is hashed as the library hashes it.

export const INVENTED_PASSWORD = "invented-password";

export type InsertedUser = InventedUser & { id: string; password: string };

/** Inserts an invented user with a password account, at the moment of the clock. */
export async function insertUser(
  role: InventedRole,
  options: Partial<InventedUser> & { password?: string; isActive?: boolean } = {},
): Promise<InsertedUser> {
  const { password = INVENTED_PASSWORD, isActive = true, ...overrides } = options;
  const user = inventedUser(role, overrides);
  const { id } = await insertPasswordUser(
    (text, values) => db.$client.query(text, values),
    { ...user, isActive },
    password,
    now(),
  );
  return { ...user, id, password };
}

/** Signs a user in and returns the session cookie, as the browser would keep it. */
export async function signInAs(user: {
  username: string;
  password: string;
}): Promise<SessionCookie> {
  const result = await signIn({ username: user.username, password: user.password });
  if (!result.ok) throw new Error(`signInAs: ${user.username} was refused (${result.reason}).`);
  return result.cookie;
}
