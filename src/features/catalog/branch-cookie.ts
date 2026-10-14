import * as z from "zod";

// The branch view of the top bar (11-screens-and-ux.md rule 1: "Users with several branches get
// a branch switcher on top; the default is 'All my branches'"). The choice is a cookie, never a
// column (plan of 0.10b, decision 5), and it names its user: on a shared device the next person
// starts on "All my branches" (review of the plan of 0.10b, correction 3). It is checked again
// against the person's branches at every read, so a stale cookie never widens the view (03 rule
// 1). Writing it touches no database row, so it runs outside the action wrapper (decision 3).

export const BRANCH_COOKIE = "branch";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** httpOnly, SameSite Lax and, in production, Secure (developer-rules.md rule 13). */
export function branchCookieOptions() {
  return {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax" as const,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  };
}

/** The cookie's value: the user, then the branch id or "all". */
export function branchCookieValue(userId: string, choice: string): string {
  return `${userId}:${choice}`;
}

/** The branch id the cookie names for this user, or null: "All my branches". */
export function branchOfCookie(value: string | undefined, userId: string): string | null {
  if (!value) return null;
  const separator = value.indexOf(":");
  if (separator < 0 || value.slice(0, separator) !== userId) return null;
  const choice = value.slice(separator + 1);
  return z.uuid().safeParse(choice).success ? choice : null;
}
