import { eq } from "drizzle-orm";

import { tickOf } from "@/domain/schedule";
import { describeForLog } from "@/server/action";
import { reportError } from "@/server/error-report";
import { now } from "@/server/clock";
import { db } from "@/server/db/client";
import { scheduledJobs } from "@/server/db/schema";

import type { Job } from "./job";

// One round of the scheduler (build-plan 0.13; 13-technology.md, Scheduled jobs: "The lock makes
// sure a job never runs twice at once"). Every instance of the app runs rounds; the job's row in
// `scheduled_jobs` is its lock, so a tick runs once whichever instances wake (plan of 0.13,
// decisions 3 and 4, as the review of the plan confirmed them):
//
//   1. the rows of jobs that have none are made, in a short transaction of their own, so an
//      instance never waits behind another one's running job (spec review, Should fix 1);
//   2. per job, one transaction: the row FOR UPDATE SKIP LOCKED (held elsewhere: skipped); the
//      tick of now(); nothing unless the tick is later than both `last_tick` and
//      `last_failed_tick` (a clock behind another instance's never runs a tick again); the run
//      in a savepoint; the record of the run, or of its failure, under the same lock.
//
// A missed tick is not caught up: the job runs once, for the tick it finds (decision 6).

/** What a round did with one job. */
export type JobOutcome = "ran" | "failed" | "not_due" | "locked" | "error";

export async function runDueJobs(jobs: readonly Job[]): Promise<Record<string, JobOutcome>> {
  const outcomes: Record<string, JobOutcome> = {};
  if (jobs.length === 0) return outcomes;
  try {
    await makeMissingRows(jobs);
  } catch (error) {
    console.error(`Scheduler could not make the job rows: ${describeForLog(error)}`);
    void reportError(error, "scheduler job rows");
    for (const job of jobs) outcomes[job.name] = "error";
    return outcomes;
  }
  for (const job of jobs) {
    try {
      outcomes[job.name] = await runOne(job);
    } catch (error) {
      // The record itself could not be written: nothing of this round is saved for the job.
      console.error(`Job ${job.name} could not be recorded: ${describeForLog(error)}`);
      void reportError(error, `job ${job.name}`);
      outcomes[job.name] = "error";
    }
  }
  return outcomes;
}

async function makeMissingRows(jobs: readonly Job[]): Promise<void> {
  const createdAt = now();
  await db
    .insert(scheduledJobs)
    .values(jobs.map((job) => ({ name: job.name, schedule: job.schedule, createdAt })))
    .onConflictDoNothing({ target: scheduledJobs.name });
}

async function runOne(job: Job): Promise<JobOutcome> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(scheduledJobs)
      .where(eq(scheduledJobs.name, job.name))
      .for("update", { skipLocked: true });
    if (!row) return "locked";

    const tick = tickOf(job.schedule, now());
    const done = [row.lastTick, row.lastFailedTick].some(
      (seen) => seen !== null && tick.getTime() <= seen.getTime(),
    );
    if (done) return "not_due";

    const startedAt = now();
    try {
      await tx.transaction(async (savepoint) => {
        await job.run({ tx: savepoint, tick });
      });
    } catch (error) {
      // The savepoint is rolled back: nothing of the run is saved (developer-rules.md rule 3).
      // The failure is recorded under the lock that is still held, so no other instance runs
      // this tick again (review of the plan, correction 1). Not tried again until the next tick.
      console.error(`Job ${job.name} failed: ${describeForLog(error)}`);
      void reportError(error, `job ${job.name}`);
      await tx
        .update(scheduledJobs)
        .set({ schedule: job.schedule, lastFailedTick: tick, lastFailedAt: now() })
        .where(eq(scheduledJobs.name, job.name));
      return "failed";
    }
    await tx
      .update(scheduledJobs)
      .set({
        schedule: job.schedule,
        lastTick: tick,
        lastStartedAt: startedAt,
        lastFinishedAt: now(),
      })
      .where(eq(scheduledJobs.name, job.name));
    return "ran";
  });
}
