import type { Job } from "./job";

// The job registry (build-plan 0.13): every job the scheduler of src/instrumentation.ts runs.
// A later task adds its job here: the reminders (8.1), the nightly check and the weekly copy
// (8.2), the analytics refresh (6.x).

/**
 * The heartbeat: every minute, it writes nothing but the record of its run in `scheduled_jobs`,
 * which shows the scheduler works (plan of 0.13, decision 10).
 */
export const heartbeat: Job = {
  name: "heartbeat",
  schedule: { everyMinutes: 1 },
  async run() {},
};

export const JOBS: readonly Job[] = [heartbeat];
