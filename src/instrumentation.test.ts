import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { catchErrorReports, eventOf } from "../tests/helpers/error-reports";

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

describe("onRequestError hands a server error to the error reporter (build-plan 9.3)", () => {
  const context = {
    routerKind: "App Router",
    routePath: "/orders/[id]",
    routeType: "action",
  } as unknown as Parameters<typeof import("./instrumentation").onRequestError>[2];
  const request = { path: "/orders/1?q=Invented", method: "POST", headers: {} };

  it("in the Node.js runtime: the route's pattern and type, never the path", async () => {
    const reports = catchErrorReports();
    const { onRequestError } = await import("./instrumentation");
    await onRequestError(new Error("invented"), request, context);
    expect(reports).toHaveLength(1);
    expect(eventOf(reports[0]!)).toMatchObject({
      transaction: "action /orders/[id]",
      tags: { where: "action /orders/[id]", routeType: "action" },
    });
    expect(reports[0]!.body).not.toContain("q=Invented");
  });

  it("in the edge runtime: nothing", async () => {
    const reports = catchErrorReports();
    vi.stubEnv("NEXT_RUNTIME", "edge");
    const { onRequestError } = await import("./instrumentation");
    await onRequestError(new Error("invented"), request, context);
    expect(reports).toEqual([]);
  });
});
