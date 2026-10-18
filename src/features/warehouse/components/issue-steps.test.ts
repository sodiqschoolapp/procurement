import { describe, expect, it } from "vitest";

import { firstIssueStepWithError } from "./issue-steps";

// The issue form's phone steps (11-screens-and-ux.md, Interface per role: Manager; smooth feel 4:
// an error is never left on a hidden step; plan of 5.4, Screens).

describe("firstIssueStepWithError", () => {
  it("opens the header for its fields, the lines for a line, the last step otherwise", () => {
    expect(firstIssueStepWithError(["departmentId"], 2)).toBe(0);
    expect(firstIssueStepWithError(["lines.3.qty"], 2)).toBe(1);
    expect(firstIssueStepWithError(["lines"], 0)).toBe(1);
    expect(firstIssueStepWithError(["comment"], 0)).toBe(2);
  });

  it("takes the first step that holds an error", () => {
    expect(firstIssueStepWithError(["comment", "lines.0.qty", "docDate"], 2)).toBe(0);
    expect(firstIssueStepWithError(["comment", "lines.0.variantId"], 0)).toBe(1);
  });

  it("stays on the current step without a field error", () => {
    expect(firstIssueStepWithError([], 1)).toBe(1);
  });
});
