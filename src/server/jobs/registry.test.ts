import { describe, expect, it } from "vitest";

import { checkSchedule } from "@/domain/schedule";

import { JOBS } from "./registry";

// The job registry (build-plan 0.13: "a job registry with name, schedule and last run"). A job
// that the scheduler cannot run (a schedule refused by src/domain/schedule.ts, a name refused by
// scheduled_jobs_name_check, two jobs on one row) is found here, not as an error on every round
// (spec review of 0.13, Should fix 1).

describe("JOBS (13-technology.md, Scheduled jobs)", () => {
  it("holds the heartbeat", () => {
    expect(JOBS.map((job) => job.name)).toContain("heartbeat");
  });

  it("gives every job a schedule the scheduler accepts", () => {
    for (const job of JOBS) expect(() => checkSchedule(job.schedule), job.name).not.toThrow();
  });

  it("gives every job a name its row accepts, used by no other job", () => {
    const names = JOBS.map((job) => job.name);
    for (const name of names) expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(new Set(names).size).toBe(names.length);
  });
});
