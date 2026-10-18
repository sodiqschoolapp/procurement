import { describe, expect, it } from "vitest";

import { firstDocumentStepWithError } from "./document-steps";

// The issue form's phone steps (11-screens-and-ux.md, Interface per role: Manager; smooth feel 4:
// an error is never left on a hidden step; plan of 5.4, Screens).

describe("firstDocumentStepWithError", () => {
  it("opens the header for its fields, the lines for a line, the last step otherwise", () => {
    expect(firstDocumentStepWithError(["departmentId"], 2)).toBe(0);
    expect(firstDocumentStepWithError(["lines.3.qty"], 2)).toBe(1);
    expect(firstDocumentStepWithError(["lines"], 0)).toBe(1);
    expect(firstDocumentStepWithError(["comment"], 0)).toBe(2);
  });

  it("opens the header for a direct entry's reason (plan of 5.8)", () => {
    expect(firstDocumentStepWithError(["reason"], 2)).toBe(0);
    expect(firstDocumentStepWithError(["lines.0.unitCost"], 2)).toBe(1);
  });

  it("takes the first step that holds an error", () => {
    expect(firstDocumentStepWithError(["comment", "lines.0.qty", "docDate"], 2)).toBe(0);
    expect(firstDocumentStepWithError(["comment", "lines.0.variantId"], 0)).toBe(1);
  });

  it("stays on the current step without a field error", () => {
    expect(firstDocumentStepWithError([], 1)).toBe(1);
  });
});
