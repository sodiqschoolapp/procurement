import { describeForLog } from "@/server/action";
import { reportError } from "@/server/error-report";

import type { Job } from "./job";
import { runDueJobs } from "./run-due";

// The scheduler inside the app (13-technology.md, Scheduled jobs; build-plan 0.13). It runs a
// round at once and then every `everyMs` (plan of 0.13, decision 7: 15 seconds), never two
// rounds of one instance at once. Several instances are safe: each job's lock is its row
// (src/server/jobs/run-due.ts). Started by src/instrumentation.ts.

export const SCHEDULER_WAKE_MS = 15_000;

export type Scheduler = {
  /** Stops waking, and waits for a round that is running. */
  stop(): Promise<void>;
};

export function startScheduler(options: {
  jobs: readonly Job[];
  everyMs?: number;
  /** One round; tests pass runDueJobs wrapped to count the rounds. */
  runRound?: (jobs: readonly Job[]) => Promise<unknown>;
}): Scheduler {
  const { jobs, everyMs = SCHEDULER_WAKE_MS, runRound = runDueJobs } = options;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> = Promise.resolve();

  const round = () => {
    timer = undefined;
    running = runRound(jobs).then(
      () => undefined,
      (error: unknown) => {
        console.error(`Scheduler round failed: ${describeForLog(error)}`);
        void reportError(error, "scheduler round");
      },
    );
    void running.then(() => {
      if (stopped) return;
      timer = setTimeout(round, everyMs);
      // A waiting scheduler never keeps a script or a test process alive.
      timer.unref();
    });
  };
  round();

  return {
    async stop() {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      await running;
    },
  };
}
