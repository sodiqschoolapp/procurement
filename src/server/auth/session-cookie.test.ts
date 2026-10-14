import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SECURE_SESSION_COOKIE,
  SESSION_COOKIE,
  sessionCookie,
  signToken,
  verifySignedToken,
} from "./session-cookie";

// developer-rules.md rule 13: "Cookies are httpOnly, secure and sameSite"; A8: a session lasts
// 24 hours. Review of the plan of 0.6, correction 2: the signature is checked in constant time.

const SECRET = "invented-secret-for-tests-only-0000000000";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the session cookie (developer-rules.md rule 13; A8)", () => {
  it("is httpOnly, SameSite=Lax, for the whole app, and lasts 24 hours", () => {
    expect(sessionCookie("invented_token", SECRET)).toMatchObject({
      name: SESSION_COOKIE,
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 24 * 60 * 60,
    });
  });

  it("is Secure, under its __Secure- name, in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(sessionCookie("invented_token", SECRET)).toMatchObject({
      name: SECURE_SESSION_COOKIE,
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });
  });

  it("gives back the token of a value it signed", () => {
    expect(verifySignedToken(signToken("invented_token", SECRET), SECRET)).toBe("invented_token");
  });

  it.each([
    ["no value", undefined],
    ["an empty value", ""],
    ["a token without a signature", "invented_token"],
    ["a wrong signature", "invented_token.AAAA"],
    [
      "a signature of another token",
      `other_token.${signToken("invented_token", SECRET).split(".")[1]}`,
    ],
    ["a signature with a character added", `${signToken("invented_token", SECRET)}A`],
  ])("refuses %s", (_what, value) => {
    expect(verifySignedToken(value, SECRET)).toBeNull();
  });

  it("refuses a value signed with another secret", () => {
    expect(
      verifySignedToken(signToken("invented_token", "another-invented-secret"), SECRET),
    ).toBeNull();
  });
});
