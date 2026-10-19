import { describe, expect, it } from "vitest";

import { checkSchedule } from "@/domain/schedule";

import { JOBS, jobsFor } from "./registry";

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

// build-plan 8.2 (plan, decided item 8; review of the plan, Should fix 3 and nit 3): the weekly
// copy runs only in a production server with file storage, and last in a round.
describe("jobsFor (build-plan 8.2; 13-technology.md, Running it)", () => {
  const names = (env: Record<string, string | undefined>) => jobsFor(env).map((job) => job.name);

  it("always holds the nightly stock check", () => {
    expect(names({})).toContain("stock_check");
  });

  it("holds the weekly copy, last, in a production server with S3_BUCKET", () => {
    const found = names({ NODE_ENV: "production", S3_BUCKET: "invented-bucket" });
    expect(found.at(-1)).toBe("database_copy");
  });

  it("leaves it out of npm run dev and Playwright's next dev, and of a server with no bucket (CI's image container)", () => {
    expect(names({ NODE_ENV: "development", S3_BUCKET: "invented-bucket" })).not.toContain(
      "database_copy",
    );
    expect(names({ NODE_ENV: "test", S3_BUCKET: "invented-bucket" })).not.toContain(
      "database_copy",
    );
    expect(names({ NODE_ENV: "production" })).not.toContain("database_copy");
    expect(names({ NODE_ENV: "production", S3_BUCKET: "" })).not.toContain("database_copy");
  });

  it("gives the copy a schedule the scheduler accepts and a name its row accepts", () => {
    const copy = jobsFor({ NODE_ENV: "production", S3_BUCKET: "invented-bucket" }).at(-1)!;
    expect(copy.schedule).toEqual({ weeklyOn: 7, dailyAt: "04:00" });
    expect(() => checkSchedule(copy.schedule)).not.toThrow();
    expect(copy.name).toMatch(/^[a-z][a-z0-9_]*$/);
  });
});
