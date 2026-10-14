import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { scheduledJobs } from "@/server/db/schema";

import { refusalOf } from "../../../../tests/helpers/database-error";

// The guards of `scheduled_jobs` (build-plan 0.13; plan of 0.13, "Database changes" and decision
// 2), each reached by a direct INSERT and by an UPDATE of an otherwise valid row, with nothing in
// front of it (developer-rules.md rule 5; D39).

const CREATED = new Date("2026-10-14T09:00:00Z");
const STARTED = new Date("2026-10-14T10:00:01Z");
const FINISHED = new Date("2026-10-14T10:00:02Z");
const TICK = new Date("2026-10-14T10:00:00Z");

let counter = 0;
const nextName = () => `job_${(counter += 1)}`;

function valid(overrides: Partial<typeof scheduledJobs.$inferInsert> = {}) {
  return {
    name: nextName(),
    schedule: { everyMinutes: 1 },
    lastTick: TICK,
    lastStartedAt: STARTED,
    lastFinishedAt: FINISHED,
    lastFailedTick: TICK,
    lastFailedAt: FINISHED,
    createdAt: CREATED,
    ...overrides,
  };
}

const REFUSED: Array<[string, Partial<typeof scheduledJobs.$inferInsert>, string]> = [
  ["a name with a capital", { name: "Heartbeat" }, "scheduled_jobs_name_check"],
  ["a name with a space", { name: "heart beat" }, "scheduled_jobs_name_check"],
  ["an empty name", { name: "" }, "scheduled_jobs_name_check"],
  ["a schedule that is not an object", { schedule: [1] }, "scheduled_jobs_schedule_check"],
  ["finished without started", { lastStartedAt: null }, "scheduled_jobs_finished_check"],
  [
    "finished before started",
    { lastStartedAt: FINISHED, lastFinishedAt: STARTED },
    "scheduled_jobs_finished_check",
  ],
  [
    "a tick without a finished run",
    { lastStartedAt: null, lastFinishedAt: null },
    "scheduled_jobs_tick_check",
  ],
  ["a failed tick without its moment", { lastFailedAt: null }, "scheduled_jobs_failed_check"],
  ["a failure moment without its tick", { lastFailedTick: null }, "scheduled_jobs_failed_check"],
];

describe("scheduled_jobs table (plan of 0.13, decision 2)", () => {
  it("takes a row with every column filled, and one with nothing run yet", async () => {
    await db.insert(scheduledJobs).values(valid());
    const fresh = valid({
      lastTick: null,
      lastStartedAt: null,
      lastFinishedAt: null,
      lastFailedTick: null,
      lastFailedAt: null,
    });
    await db.insert(scheduledJobs).values(fresh);
    const [read] = await db.select().from(scheduledJobs).where(eq(scheduledJobs.name, fresh.name));
    expect(read).toMatchObject({ lastTick: null, createdAt: CREATED });
  });

  it.each(REFUSED)("refuses an INSERT with %s", async (_, overrides, constraint) => {
    expect(await refusalOf(db.insert(scheduledJobs).values(valid(overrides)))).toMatchObject({
      code: "23514",
      constraint,
    });
  });

  it.each(REFUSED)("refuses an UPDATE to %s", async (_, overrides, constraint) => {
    const row = valid();
    await db.insert(scheduledJobs).values(row);
    expect(
      await refusalOf(
        db.update(scheduledJobs).set(overrides).where(eq(scheduledJobs.name, row.name)),
      ),
    ).toMatchObject({ code: "23514", constraint });
  });

  it("refuses a second row of the same name", async () => {
    const row = valid();
    await db.insert(scheduledJobs).values(row);
    expect(
      await refusalOf(db.insert(scheduledJobs).values(valid({ name: row.name }))),
    ).toMatchObject({ code: "23505", constraint: "scheduled_jobs_pkey" });
  });
});
