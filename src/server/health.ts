import { currentCommit } from "./commit";

// What GET /health answers (build-plan 0.16: "a health route that answers only when the database
// answers and names the commit it runs"). App Platform sends traffic to a new version only after
// this answers 200. It names nothing else: no address, no error text, no table.

/** How long the database may take before the app counts as not healthy. */
export const DATABASE_WAIT_MS = 3_000;

export type HealthAnswer =
  | { httpStatus: 200; body: { status: "ok"; commit: string; timezone: string } }
  | { httpStatus: 503; body: { status: "database unavailable"; commit: string } };

/**
 * Asks the database for its session time zone and turns the result into the health answer.
 * @param readTimeZone reads `TimeZone` of one database session; any failure counts as no answer
 */
export async function checkHealth(readTimeZone: () => Promise<string>): Promise<HealthAnswer> {
  const commit = currentCommit();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tooLate = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), DATABASE_WAIT_MS);
  });
  try {
    const timezone = await Promise.race([readTimeZone(), tooLate]);
    return { httpStatus: 200, body: { status: "ok", commit, timezone } };
  } catch {
    // The reason is not shown: a driver's message can name the server or the user.
    return { httpStatus: 503, body: { status: "database unavailable", commit } };
  } finally {
    clearTimeout(timer);
  }
}
