import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { now } from "@/server/clock";
import { db } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";

import { loginPathFor } from "./return-path";
import { authSecret } from "./secret";
import { SESSION_COOKIE_NAMES, verifySignedToken } from "./session-cookie";

// The one reader of sessions (plan of 0.6, "What will exist"). It never starts the login
// library: with no cookie it answers at once, and otherwise it checks the cookie's signature and
// reads the `sessions` row itself. Our clock alone decides whether a session has ended
// (CLAUDE.md rule 10), and an inactive user is out at the next request (plan, decision 15).

export type CurrentUser = {
  id: string;
  fullName: string;
  role: "HEAD" | "MANAGER" | "PRINCIPAL" | "FINANCE";
  locale: "uz" | "ru" | "en";
  /** The session token of this device, for sign-out. */
  sessionToken: string;
};

type CookieReader = { get(name: string): { value: string } | undefined };

/** The session cookie's value of a request, under either of its two names. */
export function sessionCookieValue(store: CookieReader): string | undefined {
  for (const name of SESSION_COOKIE_NAMES) {
    const value = store.get(name)?.value;
    if (value) return value;
  }
  return undefined;
}

/** The user of a signed session token, or `null` when the session is unknown, ended or the user inactive. */
export async function userOfCookieValue(value: string | undefined): Promise<CurrentUser | null> {
  if (!value) return null;
  const secret = authSecret();
  if (!secret) return null;
  const token = verifySignedToken(value, secret);
  if (!token) return null;

  const [found] = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      role: users.role,
      locale: users.locale,
      sessionToken: sessions.token,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, now()), eq(users.isActive, true)));
  return found ?? null;
}

/** The user of a request's cookies, or `null`. */
export async function userOfCookies(store: CookieReader): Promise<CurrentUser | null> {
  return userOfCookieValue(sessionCookieValue(store));
}

/** The signed-in user of this request, or `null`. Read once per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  return userOfCookies(await cookies());
});

/** The signed-in user; a signed-out request goes to the sign-in page, which returns to `returnPath`. */
export async function requireUser(returnPath: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(loginPathFor(returnPath));
  return user;
}
