// Next.js calls register() once when a server process starts. It starts the scheduler of
// src/server/jobs/ (13-technology.md, Scheduled jobs: "A scheduler inside the app"; build-plan
// 0.13; plan of 0.13, decision 8): only in the Node.js runtime, never while `next build` runs,
// and not when SCHEDULER=off. Every instance of the app starts one; the lock of each job makes
// that safe. The scheduler is imported inside the Node.js branch: a top-level import would pull
// the database driver into the edge bundle.

const startedOnce = globalThis as typeof globalThis & { procurementSchedulerStarted?: boolean };

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.SCHEDULER === "off") return;
  // `next dev` may load this file again; the scheduler still starts once per process.
  if (startedOnce.procurementSchedulerStarted) return;
  startedOnce.procurementSchedulerStarted = true;

  const { startScheduler } = await import("@/server/jobs/scheduler");
  const { JOBS } = await import("@/server/jobs/registry");
  startScheduler({ jobs: JOBS });
}
