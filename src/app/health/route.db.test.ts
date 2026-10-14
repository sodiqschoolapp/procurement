import { describe, expect, it } from "vitest";

import { GET } from "./route";

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
