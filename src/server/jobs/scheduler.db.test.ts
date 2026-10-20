import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db/client";
import { scheduledJobs } from "@/server/db/schema";

import { advanceClock, setClock } from "../../../tests/helpers/clock";
import { catchErrorReports, eventOf } from "../../../tests/helpers/error-reports";
import type { Job } from "./job";
import { heartbeat } from "./registry";
import { runDueJobs } from "./run-due";
import { startScheduler } from "./scheduler";

// build-plan 0.13, Done when: "two scheduler instances started together run the heartbeat once
// per tick; the last run is recorded". 13-technology.md, Scheduled jobs: "The lock makes sure a
// job never runs twice at once". Plan of 0.13 with the spec review and the review of the plan:
// the heartbeat's run is watched by a spy that wraps it, because the table records only the tick.

afterEach(() => {
  vi.restoreAllMocks();
});

/** The heartbeat of the registry with its run watched, under the name given. */
function watched(name = heartbeat.name, run: Job["run"] = heartbeat.run) {
  const spy = vi.fn(run);
  return { job: { ...heartbeat, name, run: spy } satisfies Job, spy };
}

async function rowOf(name: string) {
  const [row] = await db.select().from(scheduledJobs).where(eq(scheduledJobs.name, name));
  if (!row) throw new Error(`No row for job ${name}.`);
  return row;
}

describe("the lock: one run per tick (13-technology.md, Scheduled jobs)", () => {
  it("runs the heartbeat once per tick for two instances, and records the last run", async () => {
    const moment = setClock("2026-10-14T10:00:20Z");
    let started!: () => void;
    const aStarted = new Promise<void>((resolve) => (started = resolve));
    let release!: () => void;
    const aMayFinish = new Promise<void>((resolve) => (release = resolve));
    // Instance A's run holds its transaction, and so the row, until B has returned (D40: without
    // the lock B would find no last tick and run as well).
    const { job, spy } = watched(heartbeat.name, async (context) => {
      started();
      await aMayFinish;
      await heartbeat.run(context);
    });

    const a = runDueJobs([job]);
    await aStarted;
    const b = await runDueJobs([job]);
    expect(b).toEqual({ heartbeat: "locked" });
    release();
    expect(await a).toEqual({ heartbeat: "ran" });
    expect(spy).toHaveBeenCalledTimes(1);

    const row = await rowOf("heartbeat");
    expect(row.lastTick).toEqual(new Date("2026-10-14T10:00:00Z"));
    expect(row.lastStartedAt).toEqual(moment);
    expect(row.lastFinishedAt).toEqual(moment);
    expect(row.schedule).toEqual({ everyMinutes: 1 });

    // An instance that comes after A committed, in the same tick, finds the tick done.
    expect(await runDueJobs([job])).toEqual({ heartbeat: "not_due" });
    expect(spy).toHaveBeenCalledTimes(1);

    // Within the same tick: nothing runs and nothing of the record moves.
    advanceClock({ seconds: 30 });
    // Each finds the tick done, or the row held by the other for that moment.
    for (const outcome of await Promise.all([runDueJobs([job]), runDueJobs([job])])) {
      expect(["not_due", "locked"]).toContain(outcome.heartbeat);
    }
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await rowOf("heartbeat")).toEqual(row);

    // The next tick: once more, whichever instance takes it.
    const next = advanceClock({ seconds: 30 });
    const both = await Promise.all([runDueJobs([job]), runDueJobs([job])]);
    expect(both.filter((outcome) => outcome.heartbeat === "ran")).toHaveLength(1);
    expect(spy).toHaveBeenCalledTimes(2);
    const later = await rowOf("heartbeat");
    expect(later.lastTick).toEqual(new Date("2026-10-14T10:01:00Z"));
    expect(later.lastFinishedAt).toEqual(next);

    // A clock behind (another instance's, or moved back): the earlier tick never runs again
    // (spec review of the plan, Must fix 1).
    advanceClock({ minutes: -1 });
    expect(await runDueJobs([job])).toEqual({ heartbeat: "not_due" });
    expect(spy).toHaveBeenCalledTimes(2);
    expect((await rowOf("heartbeat")).lastTick).toEqual(new Date("2026-10-14T10:01:00Z"));
  });

  it("two schedulers started together run a job once in its tick", async () => {
    setClock("2026-10-14T11:00:05Z");
    const { job, spy } = watched("heartbeat_two_schedulers");
    const rounds: [number, number] = [0, 0];
    const counted = (which: 0 | 1) => async (jobs: readonly Job[]) => {
      const outcome = await runDueJobs(jobs);
      rounds[which] += 1;
      return outcome;
    };
    const first = startScheduler({ jobs: [job], everyMs: 5, runRound: counted(0) });
    const second = startScheduler({ jobs: [job], everyMs: 5, runRound: counted(1) });
    // Several rounds of both, all in the same tick of the fixed clock.
    await vi.waitFor(() => expect(Math.min(...rounds)).toBeGreaterThanOrEqual(4), {
      timeout: 5_000,
    });
    await Promise.all([first.stop(), second.stop()]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect((await rowOf(job.name)).lastTick).toEqual(new Date("2026-10-14T11:00:00Z"));
  });
});

describe("a run uses the injected clock (developer-rules.md rule 10)", () => {
  it("records a tick of the fixed clock", async () => {
    const moment = setClock("2027-03-01T07:42:10Z");
    const { job } = watched("heartbeat_clock");
    expect(await runDueJobs([job])).toEqual({ heartbeat_clock: "ran" });
    const row = await rowOf(job.name);
    expect(row.lastTick).toEqual(new Date("2027-03-01T07:42:00Z"));
    expect(row.lastFinishedAt).toEqual(moment);
    expect(row.createdAt).toEqual(moment);
  });
});

describe("a failed run saves nothing of itself (developer-rules.md rule 3)", () => {
  it("rolls the run back, records the failure under the lock, and waits for the next tick", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const moment = setClock("2026-10-14T12:00:30Z");
    const { job, spy } = watched("failing_probe", async ({ tx }) => {
      await tx.insert(scheduledJobs).values({
        name: "written_by_the_failing_run",
        schedule: { everyMinutes: 1 },
        createdAt: moment,
      });
      throw new Error("the job broke");
    });

    expect(await runDueJobs([job])).toEqual({ failing_probe: "failed" });
    const written = await db
      .select()
      .from(scheduledJobs)
      .where(eq(scheduledJobs.name, "written_by_the_failing_run"));
    expect(written).toEqual([]);
    const row = await rowOf(job.name);
    expect(row.lastTick).toBeNull();
    expect(row.lastStartedAt).toBeNull();
    expect(row.lastFailedTick).toEqual(new Date("2026-10-14T12:00:00Z"));
    expect(row.lastFailedAt).toEqual(moment);
    expect(errors).toHaveBeenCalledWith("Job failing_probe failed: Error: the job broke");

    // Not tried again in the same tick.
    advanceClock({ seconds: 15 });
    expect(await runDueJobs([job])).toEqual({ failing_probe: "not_due" });
    expect(spy).toHaveBeenCalledTimes(1);

    // The next tick runs it again.
    advanceClock({ minutes: 1 });
    expect(await runDueJobs([job])).toEqual({ failing_probe: "failed" });
    expect(spy).toHaveBeenCalledTimes(2);
    expect((await rowOf(job.name)).lastFailedTick).toEqual(new Date("2026-10-14T12:01:00Z"));
  });

  it("one job's failure does not stop the others of the round", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    setClock("2026-10-14T13:00:00Z");
    const broken = watched("broken_first", async () => {
      throw new Error("broken");
    });
    const fine = watched("fine_second");
    expect(await runDueJobs([broken.job, fine.job])).toEqual({
      broken_first: "failed",
      fine_second: "ran",
    });
  });
});

describe("a failure is handed to the error reporter (build-plan 9.3)", () => {
  it("a failed job is reported by its name; a job that ran is not", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reports = catchErrorReports();
    setClock("2026-10-14T13:30:00Z");
    const broken = watched("reported_probe", async () => {
      throw new Error("the job broke");
    });
    const fine = watched("unreported_probe");
    expect(await runDueJobs([broken.job, fine.job])).toEqual({
      reported_probe: "failed",
      unreported_probe: "ran",
    });
    expect(reports.map((report) => eventOf(report).transaction)).toEqual(["job reported_probe"]);
    expect(eventOf(reports[0]!).exception.values[0]!.value).toBe("Error: the job broke");
  });

  it("a round that fails as a whole is reported", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reports = catchErrorReports();
    let failed!: () => void;
    const roundFailed = new Promise<void>((resolve) => (failed = resolve));
    const scheduler = startScheduler({
      jobs: [],
      runRound: async () => {
        failed();
        throw new Error("the round broke");
      },
    });
    await roundFailed;
    await scheduler.stop();
    expect(reports.map((report) => eventOf(report).transaction)).toEqual(["scheduler round"]);
  });
});

describe("the row of a job", () => {
  it("is made once, the first time the scheduler sees the job", async () => {
    setClock("2026-10-14T14:00:00Z");
    const { job } = watched("made_once");
    await runDueJobs([job]);
    advanceClock({ minutes: 1 });
    await runDueJobs([job]);
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(scheduledJobs)
      .where(eq(scheduledJobs.name, "made_once"));
    expect(rows).toEqual([{ count: 1 }]);
  });
});
