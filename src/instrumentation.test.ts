import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// build-plan 0.13; plan of 0.13, decision 8, and the spec review of the plan, Should fix 4: the
// scheduler starts once per server process, only in the Node.js runtime, never during
// `next build`, and not with SCHEDULER=off. The scheduler module is mocked: in the unit project
// the database client refuses to load.

const { startScheduler } = vi.hoisted(() => ({ startScheduler: vi.fn() }));
vi.mock("@/server/jobs/scheduler", () => ({ startScheduler }));
vi.mock("@/server/jobs/registry", () => ({ JOBS: ["the jobs"] }));

const KEY = "procurementSchedulerStarted";

beforeEach(() => {
  delete (globalThis as Record<string, unknown>)[KEY];
  startScheduler.mockClear();
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("NEXT_PHASE", "phase-production-server");
  vi.stubEnv("SCHEDULER", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete (globalThis as Record<string, unknown>)[KEY];
});

describe("register() starts the scheduler inside the app (13-technology.md, Scheduled jobs)", () => {
  it("starts it once in the Node.js runtime, even when called twice", async () => {
    const { register } = await import("./instrumentation");
    await register();
    await register();
    expect(startScheduler).toHaveBeenCalledTimes(1);
    expect(startScheduler).toHaveBeenCalledWith({ jobs: ["the jobs"] });
  });

  it("starts nothing in the edge runtime", async () => {
    vi.stubEnv("NEXT_RUNTIME", "edge");
    const { register } = await import("./instrumentation");
    await register();
    expect(startScheduler).not.toHaveBeenCalled();
  });

  it("starts nothing while next build runs", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    const { register } = await import("./instrumentation");
    await register();
    expect(startScheduler).not.toHaveBeenCalled();
  });

  it("starts nothing with SCHEDULER=off", async () => {
    vi.stubEnv("SCHEDULER", "off");
    const { register } = await import("./instrumentation");
    await register();
    expect(startScheduler).not.toHaveBeenCalled();
  });
});
