import { afterEach, describe, expect, it, vi } from "vitest";

import { authSecret } from "./secret";

// Review of the plan of 0.6, correction 1, and the permission review of 0.6: production never
// signs or trusts a cookie with the public default secret or a secret that could be guessed.

const STRONG = "invented-strong-secret-for-tests-0123456789";
const PUBLIC_DEFAULT = "better-auth-secret-12345678901234567890";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the session secret (developer-rules.md rule 13)", () => {
  it("uses BETTER_AUTH_SECRET when it is set", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", STRONG);
    expect(authSecret()).toBe(STRONG);
    vi.stubEnv("NODE_ENV", "production");
    expect(authSecret()).toBe(STRONG);
  });

  it("falls back to the public development value outside production only", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    expect(authSecret()).toBe(PUBLIC_DEFAULT);
    vi.stubEnv("NODE_ENV", "production");
    expect(authSecret()).toBeNull();
  });

  it.each([
    ["a secret shorter than 32 characters", "invented-short"],
    ["the public default", PUBLIC_DEFAULT],
    ["spaces only", "   "],
  ])("has no secret in production with %s", (_what, value) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_SECRET", value);
    expect(authSecret()).toBeNull();
  });
});
