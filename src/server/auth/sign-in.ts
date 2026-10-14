import { APIError } from "better-auth/api";
import { hashPassword } from "better-auth/crypto";
import { and, eq, gt, sql } from "drizzle-orm";

import { minutesUntil, signInOpensAt, signInWindowStart } from "@/domain/sign-in-limit";
import { now } from "@/server/clock";
import { loginAttempts, sessions, users } from "@/server/db/schema";

import { getAuth } from "./auth";
import { safeReturnPath } from "./return-path";
import { authSecret } from "./secret";
import { type SessionCookie, sessionCookie } from "./session-cookie";
import { signInInput } from "./sign-in-input";

// Signing in (A8; 13-technology.md, Login; developer-rules.md rule 13). Runs before a user is
// known, so it has no authorize() and is outside the action wrapper (plan of 0.6, Look first 3).

export type SignInResult =
  | { ok: true; cookie: SessionCookie; returnPath: string }
  | { ok: false; reason: "invalid" | "wrong" | "unavailable" }
  | { ok: false; reason: "limit"; minutes: number };

// The first key of the two-key advisory lock: the sign-in tries of one username.
const SIGN_IN_LOCK = 6;

// Loaded when used, not at the top, as in src/app/health/route.ts: the start page imports the
// sign-out action, and `next build` runs with no database address.
async function database() {
  return (await import("@/server/db/client")).db;
}

/** Asks the library whether the password is right; the session token when it is, else null. */
async function passwordSession(username: string, password: string): Promise<string | null> {
  try {
    const signedIn = await getAuth().api.signInUsername({ body: { username, password } });
    return signedIn.token;
  } catch (error) {
    // A wrong password, an unknown name, a name the plugin refuses as too short, too long or
    // with other characters (its 401 and 422), and a session the create hook refused: all one
    // refusal (plan of 0.6, decisions 6 and 11).
    if (error instanceof APIError) return null;
    throw error;
  }
}

/**
 * Signs in with a username and a password. In one transaction, with the tries of that username
 * taken one at a time: refuses at once when 5 tries failed in 15 minutes (the password is then
 * not checked), otherwise checks the password, writes the try, and on success `last_login_at`.
 * A try refused by the limit writes no row: counting it would keep the username locked for as
 * long as someone keeps trying.
 */
export async function signIn(input: unknown): Promise<SignInResult> {
  const parsed = signInInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const secret = authSecret();
  if (!secret) {
    console.error("Sign-in refused: BETTER_AUTH_SECRET is not set (docs/deploy.md).");
    return { ok: false, reason: "unavailable" };
  }
  const { username: typed, password } = parsed.data;
  const username = typed.toLowerCase();
  const db = await database();

  // The library writes the session on its own connection, outside this transaction.
  let token: string | null = null;
  try {
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${SIGN_IN_LOCK}, hashtext(${username}))`);
      const moment = now();

      const failures = await tx
        .select({ createdAt: loginAttempts.createdAt })
        .from(loginAttempts)
        .where(
          and(
            eq(loginAttempts.username, username),
            eq(loginAttempts.succeeded, false),
            gt(loginAttempts.createdAt, signInWindowStart(moment)),
          ),
        );
      const opensAt = signInOpensAt(
        failures.map((failure) => failure.createdAt),
        moment,
      );
      if (opensAt)
        return { ok: false, reason: "limit", minutes: minutesUntil(opensAt, moment) } as const;

      const [user] = await tx
        .select({ id: users.id, isActive: users.isActive })
        .from(users)
        .where(eq(users.username, username));
      if (user?.isActive) {
        token = await passwordSession(typed, password);
      } else {
        // An unknown or inactive username: the password is hashed all the same, so the time of
        // the answer does not tell which usernames exist or are switched off (plan, decision 6;
        // permission review of 0.6). The refusal is the same as a wrong password.
        await hashPassword(password);
      }

      await tx
        .insert(loginAttempts)
        .values({ username, succeeded: token !== null, createdAt: moment });
      if (token === null || !user) return { ok: false, reason: "wrong" } as const;

      await tx.update(users).set({ lastLoginAt: moment }).where(eq(users.id, user.id));
      return { ok: true, token } as const;
    });

    if (!outcome.ok) return outcome;
    return {
      ok: true,
      cookie: sessionCookie(outcome.token, secret),
      returnPath: safeReturnPath(parsed.data.returnPath),
    };
  } catch (error) {
    // Our transaction failed after the library wrote the session: no session may exist
    // without its try.
    const orphan: string | null = token;
    if (orphan !== null) await db.delete(sessions).where(eq(sessions.token, orphan));
    throw error;
  }
}

/** Ends one session: this device's only (plan of 0.6, Look first 3 and 4). */
export async function signOut(sessionToken: string): Promise<void> {
  const db = await database();
  await db.delete(sessions).where(eq(sessions.token, sessionToken));
}
