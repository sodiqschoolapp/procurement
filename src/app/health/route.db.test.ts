import { afterEach, describe, expect, it, vi } from "vitest";

import { FORCED_ERROR_MESSAGE, GET } from "./route";

// build-plan 0.16: the health route answers when the database answers; developer-rules.md
// rule 10: every session speaks UTC, which the route reports so the owner can see it online.

describe("GET /health against a real database (build-plan 0.16; developer-rules rule 10)", () => {
  it("answers 200, status ok, the time zone UTC, and is never cached", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = (await response.json()) as { status: string; timezone: string; commit: string };
    expect(body.status).toBe("ok");
    expect(body.timezone).toBe("UTC");
    expect(typeof body.commit).toBe("string");
  });
});

describe("the forced error of the monitoring check (build-plan 9.3; plan decision 10)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("without FORCED_ERROR=on, ?forced-error answers as /health does", async () => {
    vi.stubEnv("FORCED_ERROR", "");
    const response = await GET(new Request("http://localhost/health?forced-error"));
    expect(response.status).toBe(200);
    expect(((await response.json()) as { status: string }).status).toBe("ok");
  });

  it("with FORCED_ERROR=on, /health without the query answers as before", async () => {
    vi.stubEnv("FORCED_ERROR", "on");
    const response = await GET(new Request("http://localhost/health"));
    expect(response.status).toBe(200);
  });

  it("with both, the route throws the forced error", async () => {
    vi.stubEnv("FORCED_ERROR", "on");
    await expect(GET(new Request("http://localhost/health?forced-error"))).rejects.toThrow(
      FORCED_ERROR_MESSAGE,
    );
  });
});
