import { afterEach, describe, expect, it, vi } from "vitest";

import { checkHealth, DATABASE_WAIT_MS } from "./health";

// build-plan 0.16: "a health route that answers only when the database answers and names the
// commit it runs". The commit below is invented.

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

describe("the health answer (build-plan 0.16)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("answers 200 with the commit and the session time zone when the database answers", async () => {
    vi.stubEnv("GIT_COMMIT", COMMIT);

    const answer = await checkHealth(async () => "UTC");

    expect(answer).toEqual({
      httpStatus: 200,
      body: { status: "ok", commit: COMMIT, timezone: "UTC" },
    });
  });

  it("answers 503 without the reason when the database refuses (CLAUDE.md, secrets convention)", async () => {
    vi.stubEnv("GIT_COMMIT", COMMIT);

    const answer = await checkHealth(async () => {
      throw new Error("password authentication failed for user invented_user");
    });

    expect(answer).toEqual({
      httpStatus: 503,
      body: { status: "database unavailable", commit: COMMIT },
    });
    expect(JSON.stringify(answer)).not.toContain("invented_user");
  });

  it("answers 503 when the database takes longer than the wait", async () => {
    vi.useFakeTimers();

    const pending = checkHealth(() => new Promise<string>(() => {}));
    await vi.advanceTimersByTimeAsync(DATABASE_WAIT_MS);

    expect((await pending).httpStatus).toBe(503);
  });

  it('names the commit "unknown" when the app was started without one', async () => {
    vi.stubEnv("GIT_COMMIT", "");

    const answer = await checkHealth(async () => "UTC");

    expect(answer.body.commit).toBe("unknown");
  });
});
