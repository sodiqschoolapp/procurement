import { describe, expect, it } from "vitest";

import { canApplyToTicked } from "./grid-rules";

// 03 Manager rights: CREATE_REQUESTS off "can only view orders"; plan of 2.5b, decided item 2
// (Look first); spec review of 2.5b, Must fix 3.
describe("canApplyToTicked (03 Manager rights: CREATE_REQUESTS)", () => {
  const rights = new Map([
    ["own", { editable: true }],
    ["other", { editable: true }],
    ["readOnly", { editable: false }],
  ]);

  it("offers Apply when every ticked row may be edited", () => {
    expect(canApplyToTicked(["own", "other"], rights)).toBe(true);
  });

  it("offers no Apply when a read-only row is ticked, nor for an unknown row or nothing ticked", () => {
    expect(canApplyToTicked(["own", "readOnly"], rights)).toBe(false);
    expect(canApplyToTicked(["readOnly"], rights)).toBe(false);
    expect(canApplyToTicked(["gone"], rights)).toBe(false);
    expect(canApplyToTicked([], rights)).toBe(false);
  });
});
