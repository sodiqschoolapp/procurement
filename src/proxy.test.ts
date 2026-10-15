import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { config, proxy } from "./proxy";
import { RETURN_PATH_HEADER } from "./server/auth/return-path";
import { SECURE_SESSION_COOKIE, SESSION_COOKIE } from "./server/auth/session-cookie";

// edge-cases/system.md: a signed-out person who opens a page signs in and returns to it. The
// proxy only looks for the cookie, under either name (review of the plan of 0.6, Should fix).

function request(path: string, cookie?: string): NextRequest {
  const headers = cookie ? { cookie: `${cookie}=invented.value` } : undefined;
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers });
}

describe("the proxy (edge-cases/system.md: back to the same page after sign-in)", () => {
  it("sends a request without a session cookie to /login with the page it asked for", () => {
    const response = proxy(request("/orders?tab=x"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Forders%3Ftab%3Dx",
    );
  });

  it.each([SESSION_COOKIE, SECURE_SESSION_COOKIE])("lets a request with %s through", (name) => {
    const response = proxy(request("/orders?tab=x", name));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("hands the asked-for path to the layout, over any value the browser sent (spec review of 0.10b)", () => {
    const sent = new NextRequest(new URL("/profile?tab=x", "http://localhost:3000"), {
      headers: { cookie: `${SESSION_COOKIE}=invented.value`, [RETURN_PATH_HEADER]: "/elsewhere" },
    });
    const response = proxy(sent);

    expect(response.headers.get(`x-middleware-request-${RETURN_PATH_HEADER}`)).toBe(
      "/profile?tab=x",
    );
  });

  it.each(["/login", "/health"])("leaves %s open without a cookie", (path) => {
    expect(proxy(request(path)).headers.get("location")).toBeNull();
  });

  it("sends / to /login: it is the home page of a signed-in person (plan of 0.10b)", () => {
    const location = proxy(request("/")).headers.get("location");

    expect(location).not.toBeNull();
    expect(new URL(location!).pathname).toBe("/login");
  });
});

describe("the proxy's matcher (plan of 0.12, decision 7, Look first)", () => {
  const matches = (path: string) =>
    unstable_doesMiddlewareMatch({ config, url: `http://localhost:3000${path}` });

  it("leaves the upload and download routes of /files to themselves", () => {
    expect(matches("/files")).toBe(false);
    expect(matches("/files/00000000-0000-4000-8000-000000000001/large")).toBe(false);
  });

  it("still covers the pages, also one whose name starts with files", () => {
    expect(matches("/orders")).toBe(true);
    expect(matches("/filesystem")).toBe(true);
    expect(matches("/")).toBe(true);
  });
});
