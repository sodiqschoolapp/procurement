import { describe, expect, it } from "vitest";

import { loginPathFor, safeReturnPath } from "./return-path";

// edge-cases/system.md ("The session ends in the middle of a form"): "After login the user
// returns to the same page". Only a path of this app is accepted (plan of 0.6).

describe("the page to return to after sign-in (edge-cases/system.md)", () => {
  it("keeps a path of this app with its query", () => {
    expect(safeReturnPath("/orders?tab=x")).toBe("/orders?tab=x");
    expect(safeReturnPath("/warehouse/items/invented-id")).toBe("/warehouse/items/invented-id");
  });

  it.each([
    ["another site", "//evil.example"],
    ["another site, backslash", "/\\evil.example"],
    ["an address with a scheme", "https://evil.example/orders"],
    ["a scheme without slashes", "javascript:alert(1)"],
    ["the sign-in page itself", "/login"],
    ["the sign-in page with a query", "/login?next=/orders"],
    ["a line break", "/orders\nSet-Cookie: x"],
    ["an empty value", ""],
    ["no value", undefined],
  ])("refuses %s and lands on /", (_what, next) => {
    expect(safeReturnPath(next)).toBe("/");
  });

  it("builds the sign-in address that returns to a page", () => {
    expect(loginPathFor("/orders?tab=x")).toBe("/login?next=%2Forders%3Ftab%3Dx");
    expect(loginPathFor("/")).toBe("/login");
  });
});
