import { describe, expect, it } from "vitest";

import { CLIENT_KEY_PATTERN, isClientKey, newClientKey } from "./client-key";

// developer-rules.md rule 8, "Safe repeats": "Each create action carries an ID made in the browser."
describe("the browser-made client_key (developer-rules.md rule 8)", () => {
  it("is a UUID version 4", () => {
    expect(newClientKey()).toMatch(CLIENT_KEY_PATTERN);
  });

  it("is new every time: 1 000 keys are all different", () => {
    const keys = new Set(Array.from({ length: 1000 }, () => newClientKey()));
    expect(keys.size).toBe(1000);
  });

  it("is recognised by the server-side check", () => {
    expect(isClientKey(newClientKey())).toBe(true);
    expect(isClientKey("0b7c6a52-3f0e-4c1a-9d2e-5a8b7c6d4e3f")).toBe(true);
  });

  it("refuses anything that is not a version 4 UUID", () => {
    for (const wrong of [
      "",
      "not-a-key",
      "0b7c6a52-3f0e-4c1a-9d2e-5a8b7c6d4e3f ",
      " 0b7c6a52-3f0e-4c1a-9d2e-5a8b7c6d4e3f",
      "0b7c6a52-3f0e-4c1a-9d2e-5a8b7c6d4e3f0",
      "0b7c6a52-3f0e-1c1a-9d2e-5a8b7c6d4e3f",
      "0B7C6A52-3F0E-4C1A-9D2E-5A8B7C6D4E3F",
      42,
      null,
      undefined,
    ]) {
      expect(isClientKey(wrong)).toBe(false);
    }
  });
});
