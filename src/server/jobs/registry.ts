import { analyticsRefresh } from "./analytics-refresh";
import { databaseCopyJob } from "./database-copy";
import type { Job } from "./job";
import { reminders } from "./reminders";
import { stockCheck } from "./stock-check";

// The job registry (build-plan 0.13): every job the scheduler of src/instrumentation.ts runs.
// A later task adds its job here. The analytics refresh came with 6.3, the reminders with 8.1, the
// nightly stock check and the weekly copy with 8.2.

/**
 * The heartbeat: every minute, it writes nothing but the record of its run in `scheduled_jobs`,
 * which shows the scheduler works (plan of 0.13, decision 10).
 */
export const heartbeat: Job = {
  name: "heartbeat",
  schedule: { everyMinutes: 1 },
  async run() {},
};

/**
 * Whether the weekly copy runs here: only in a production server with file storage (the test copy,
 * later the live app). `npm run dev`, Playwright's `next dev` and CI's image container, which has no
 * S3_* variable, never run it, so it never fails there for want of `pg_dump` 17 or a bucket (plan
 * of 8.2, decided item 8).
 */
export function copyRuns(env: Record<string, string | undefined>): boolean {
  return env.NODE_ENV === "production" && Boolean(env.S3_BUCKET);
}

/** The jobs of a server with this environment; the copy last, as a dump delays what follows it. */
export function jobsFor(env: Record<string, string | undefined>): readonly Job[] {
  const jobs = [heartbeat, analyticsRefresh, reminders, stockCheck];
  return copyRuns(env) ? [...jobs, databaseCopyJob] : jobs;
}

export const JOBS: readonly Job[] = jobsFor(process.env);
