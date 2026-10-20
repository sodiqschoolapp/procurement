import { afterEach, describe, expect, it, vi } from "vitest";

import { catchErrorReports, eventOf } from "../tests/helpers/error-reports";
import { FORCED_ERROR_MESSAGE, GET } from "./app/health/route";
import { onRequestError } from "./instrumentation";

// build-plan 9.3, Done when: "A forced error in a production build is handed to the
// error-reporting client (stubbed) in a test". Read as the code path a production build runs (plan
// of 9.3, decision 1, Look first, confirmed by the review): NODE_ENV=production, the Node.js
// runtime, the forced error of the real /health route passed to the real onRequestError as
// Next.js passes it, and the real client with only `fetch` stubbed. Next.js's own call of the hook
// in a built app is shown by the owner's check during the trial (docs/monitoring.md).

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a forced error in production reaches the error-reporting client (build-plan 9.3)", () => {
  it("is sent once, with the route's pattern, the commit and the environment, and no query or header", async () => {
    const reports = catchErrorReports();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("FORCED_ERROR", "on");
    vi.stubEnv("GIT_COMMIT", "fedcba9876543210fedcba9876543210fedcba98");
    vi.stubEnv("SEED_DEMO_DATA", "yes");
    const request = new Request("https://ombor.invalid/health?forced-error&who=Invented", {
      headers: { cookie: "session=invented-cookie", "x-invented": "invented-header" },
    });

    const thrown = await GET(request).then(
      () => null,
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(FORCED_ERROR_MESSAGE);

    // As Next.js calls the hook for an error of a route handler.
    await onRequestError(
      thrown,
      {
        path: "/health?forced-error&who=Invented",
        method: "GET",
        headers: { cookie: "session=invented-cookie", "x-invented": "invented-header" },
      },
      {
        routerKind: "App Router",
        routePath: "/health",
        routeType: "route",
        renderSource: undefined,
        revalidateReason: undefined,
        renderType: undefined,
      } as unknown as Parameters<typeof onRequestError>[2],
    );

    expect(reports).toHaveLength(1);
    const event = eventOf(reports[0]!);
    expect(event).toMatchObject({
      release: "fedcba9876543210fedcba9876543210fedcba98",
      environment: "trial",
      transaction: "route /health",
      tags: { routeType: "route" },
    });
    expect(event.exception.values[0]!.value).toBe(`Error: ${FORCED_ERROR_MESSAGE}`);
    for (const value of ["Invented", "invented-cookie", "invented-header", "who="]) {
      expect(reports[0]!.body).not.toContain(value);
    }
  });
});
