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

export async function GET(): Promise<Response> {
  const answer = await checkHealth(readTimeZone);
  return Response.json(answer.body, {
    status: answer.httpStatus,
    headers: { "Cache-Control": "no-store" },
  });
}
