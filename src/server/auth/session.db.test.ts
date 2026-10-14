import { describe, expect, it, vi } from "vitest";

import { setClock } from "../../../tests/helpers/clock";
import { insertUser, signInAs } from "../../../tests/helpers/users";
import { closeAuth } from "./auth";
import { userOfCookieValue, userOfCookies } from "./session";
import { SECURE_SESSION_COOKIE, SESSION_COOKIE, signToken } from "./session-cookie";
import { signIn } from "./sign-in";

// The secret in production (review of the plan of 0.6, correction 1; developer-rules.md rule 13;
// CLAUDE.md, what matters most 2): the library's public default secret is never trusted there.

// The library's public default (better-auth/dist/utils/constants.mjs): anyone can sign with it.
const PUBLIC_DEFAULT_SECRET = "better-auth-secret-12345678901234567890";

/** Runs `work` as production without BETTER_AUTH_SECRET, then puts the environment back. */
async function asProductionWithoutSecret<T>(work: () => Promise<T>): Promise<T> {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("BETTER_AUTH_SECRET", "");
  try {
    return await work();
  } finally {
    // Before the clock is reset after the test: the clock refuses to be set in production.
    vi.unstubAllEnvs();
  }
}

describe("the session secret in production (review correction 1; rule 13)", () => {
  it("reads a cookie signed with the public default secret as signed out", async () => {
    setClock("2031-03-10T04:00:00Z");
    const head = await insertUser("HEAD");
    // Outside production this cookie is valid: the default secret is the development one.
    const cookie = await signInAs(head);
    const token = cookie.value.split(".")[0] ?? "";
    const forged = signToken(token, PUBLIC_DEFAULT_SECRET);
    expect(await userOfCookieValue(forged)).toMatchObject({ id: head.id });

    expect(await asProductionWithoutSecret(() => userOfCookieValue(forged))).toBeNull();
  });

  it("refuses sign-in without starting the library", async () => {
    setClock("2031-03-10T04:00:00Z");
    const head = await insertUser("HEAD");
    // An earlier test of this file may have made the instance; start without one.
    await closeAuth();

    const result = await asProductionWithoutSecret(() =>
      signIn({ username: head.username, password: head.password }),
    );
    expect("procurementAuth" in globalThis).toBe(false);

    expect(result).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("the session cookie's two names (plan of 0.6)", () => {
  it.each([SESSION_COOKIE, SECURE_SESSION_COOKIE])("reads the session under %s", async (name) => {
    setClock("2031-03-10T04:00:00Z");
    const head = await insertUser("HEAD");
    const cookie = await signInAs(head);
    const store = {
      get: (asked: string) => (asked === name ? { value: cookie.value } : undefined),
    };

    expect(await userOfCookies(store)).toMatchObject({ id: head.id });
  });
});
