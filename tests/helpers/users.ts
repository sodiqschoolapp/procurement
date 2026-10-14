import { db } from "@/server/db/client";
import { now } from "@/server/clock";
import { type SessionCookie } from "@/server/auth/session-cookie";
import { signIn } from "@/server/auth/sign-in";

import { insertPasswordUser } from "../../src/server/auth/password-user.mjs";
import { insertBranch } from "./branches";
import { type InventedRole, type InventedUser, inventedUser } from "./invented";

// Users in the database for tests (progress 0.4: "`insertUser()`: 0.6"). Every person is
// invented (CLAUDE.md, Conventions); the password is hashed as the library hashes it.

export const INVENTED_PASSWORD = "invented-password";

export type InsertedUser = InventedUser & {
  id: string;
  password: string;
  branchIds: readonly string[];
};

/**
 * Inserts an invented user with a password account and its branches, at the moment of the clock.
 * Everything is written on one connection between BEGIN and COMMIT: the database checks "exactly
 * one branch for a Principal" at commit (migration 0002), so a Principal with no branch given
 * gets a new branch of its own.
 */
export async function insertUser(
  role: InventedRole,
  options: Partial<InventedUser> & {
    password?: string;
    isActive?: boolean;
    branches?: readonly string[];
  } = {},
): Promise<InsertedUser> {
  const { password = INVENTED_PASSWORD, isActive = true, branches, ...overrides } = options;
  const user = inventedUser(role, overrides);
  const branchIds =
    branches ?? (role === "PRINCIPAL" ? [(await insertBranch()).id] : ([] as string[]));
  const moment = now();
  const client = await db.$client.connect();
  try {
    await client.query("begin");
    const { id } = await insertPasswordUser(
      (text, values) => client.query(text, values),
      { ...user, isActive },
      password,
      moment,
    );
    for (const branchId of branchIds) {
      await client.query(
        `insert into user_branches (user_id, branch_id, user_role, user_is_active, created_at)
         values ($1, $2, $3, $4, $5)`,
        [id, branchId, role, isActive, moment],
      );
    }
    await client.query("commit");
    return { ...user, id, password, branchIds };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
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
