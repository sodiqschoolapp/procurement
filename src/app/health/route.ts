import { sql } from "drizzle-orm";

import { checkHealth } from "@/server/health";

// GET /health, for App Platform's health check and the owner's check of the test copy (0.16).
// Open without sign-in and without authorize(): the health check cannot sign in, and the route
// reads no table (plan decision 1, Look first). Not under /api/: there is no REST API (D5).

export const dynamic = "force-dynamic";

async function readTimeZone(): Promise<string> {
  // Loaded here, not at the top: the client refuses to load without DATABASE_URL, and
  // `next build` runs with no database address (no secret at build time).
  const { db } = await import("@/server/db/client");
  const result = await db.execute<{ timezone: string }>(
    sql`select current_setting('TimeZone') as timezone`,
  );
  const timezone = result.rows[0]?.timezone;
  if (!timezone) throw new Error("no answer");
  return timezone;
}

/** The error the owner's check of 9.3 raises (docs/monitoring.md). */
export const FORCED_ERROR_MESSAGE = "Forced error for the monitoring check";

/**
 * Whether this request asks for the forced error of 9.3 (plan decision 10): only with
 * FORCED_ERROR=on in the environment and the query `forced-error`. App Platform's and
 * UptimeRobot's checks never send that query, and without the variable nothing changes.
 */
function forcesError(request: Request | undefined): boolean {
  if (process.env.FORCED_ERROR !== "on" || !request) return false;
  return new URL(request.url).searchParams.has("forced-error");
}

export async function GET(request?: Request): Promise<Response> {
  if (forcesError(request)) throw new Error(FORCED_ERROR_MESSAGE);
  const answer = await checkHealth(readTimeZone);
  return Response.json(answer.body, {
    status: answer.httpStatus,
    headers: { "Cache-Control": "no-store" },
  });
}
