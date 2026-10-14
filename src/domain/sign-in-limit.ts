// The sign-in limit (developer-rules.md rule 13: "Login allows 5 tries per 15 minutes"), read
// as: after 5 failed tries of one username within 15 minutes, every try of that username is
// refused, without checking the password, until the oldest of them is 15 minutes old.
// Successful tries do not count (plan of 0.6, decisions 1 and 5). Pure: the moments are passed in.

export const SIGN_IN_TRY_LIMIT = 5;
export const SIGN_IN_WINDOW_MINUTES = 15;

const WINDOW_MS = SIGN_IN_WINDOW_MINUTES * 60 * 1000;

/** The start of the window: a failure at this moment or earlier no longer counts. */
export function signInWindowStart(now: Date): Date {
  return new Date(now.getTime() - WINDOW_MS);
}

/**
 * When the next try of a username is allowed: `null` when it is allowed now, else the moment
 * the oldest counted failure leaves the window. `failedTries` are the moments of that
 * username's failed tries; those outside the window are ignored.
 */
export function signInOpensAt(failedTries: readonly Date[], now: Date): Date | null {
  const start = signInWindowStart(now).getTime();
  const counted = failedTries
    .map((moment) => moment.getTime())
    .filter((moment) => moment > start && moment <= now.getTime())
    .sort((a, b) => a - b);
  if (counted.length < SIGN_IN_TRY_LIMIT) return null;
  // With n counted failures, n - 4 of them must leave before fewer than 5 remain.
  const mustLeave = counted[counted.length - SIGN_IN_TRY_LIMIT] as number;
  return new Date(mustLeave + WINDOW_MS);
}

/** Whole minutes until a moment, rounded up, at least 1: "try again in N minutes". */
export function minutesUntil(moment: Date, now: Date): number {
  return Math.max(1, Math.ceil((moment.getTime() - now.getTime()) / 60_000));
}
