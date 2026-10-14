import { describe, expect, it, vi } from "vitest";

// Plan of 0.6, decision 18: the session reader never starts the login library, so `next build`,
// /health and a page without a session cookie run without it (and without its secret). Any
// import of the library in this file fails loudly.
vi.mock("better-auth", () => {
  throw new Error("the login library was loaded");
});

describe("reading a session never loads the login library (plan of 0.6, decision 18)", () => {
  it("answers signed out with no cookie, and with a cookie that has no session", async () => {
    const { userOfCookies, userOfCookieValue } = await import("./session");

    expect(await userOfCookies({ get: () => undefined })).toBeNull();
    expect(await userOfCookieValue("invented_token.AAAA")).toBeNull();
  });
});
