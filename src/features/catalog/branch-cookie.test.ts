import { afterEach, describe, expect, it, vi } from "vitest";

import { branchCookieOptions, branchCookieValue, branchOfCookie } from "./branch-cookie";

// 11-screens-and-ux.md rule 1 (the default is "All my branches"); developer-rules.md rule 13
// ("Cookies are httpOnly, secure and sameSite"); review of the plan of 0.10b, corrections 2
// and 3.

const ANVAR = "00000000-0000-4000-8000-00000000a001";
const BOBUR = "00000000-0000-4000-8000-00000000b002";
const BRANCH = "00000000-0000-4000-8000-0000000000c3";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the branch cookie (11-screens rule 1; developer-rules rule 13)", () => {
  it("is httpOnly, SameSite=Lax, for the whole app, and kept for a year", () => {
    expect(branchCookieOptions()).toEqual({
      path: "/",
      maxAge: 365 * 24 * 60 * 60,
      sameSite: "lax",
      httpOnly: true,
      secure: false,
    });
  });

  it("is Secure in production (correction 2)", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(branchCookieOptions()).toMatchObject({ secure: true, httpOnly: true, sameSite: "lax" });
  });

  it("gives back the branch to the person it names", () => {
    expect(branchOfCookie(branchCookieValue(ANVAR, BRANCH), ANVAR)).toBe(BRANCH);
  });

  it("reads as All my branches for the next person on the same device (correction 3)", () => {
    expect(branchOfCookie(branchCookieValue(ANVAR, BRANCH), BOBUR)).toBeNull();
  });

  it("reads as All my branches for 'all', nothing, or anything that is not a branch id", () => {
    for (const value of [
      undefined,
      "",
      branchCookieValue(ANVAR, "all"),
      BRANCH,
      `${ANVAR}:not-a-uuid`,
      `${ANVAR}:`,
    ]) {
      expect(branchOfCookie(value, ANVAR), String(value)).toBeNull();
    }
  });
});
