import { describe, expect, it } from "vitest";

import { firstStepWithError } from "./purchase-steps";

// 11-screens-and-ux.md, smooth feel 3 ("one order or group row at a time") and 4 (errors say what
// happened); plan of 3.9, Tests, and its review, correction 3: a refused save opens the step with
// the error, never leaves it on a hidden step.

// Three steps: one order, a group row of two orders, one order.
const steps = [["a"], ["b", "c"], ["d"]];

describe("firstStepWithError (11 smooth feel 3 and 4; plan of 3.9)", () => {
  it("a line error of the second block opens step 2", () => {
    expect(firstStepWithError(["lines.2.unitPrice"], ["a", "b", "c", "d"], steps, 0)).toBe(1);
  });

  it("a line error maps through what was sent: the first order left out at 0 moves every place", () => {
    // "a" had quantity 0 and was not sent, so lines.0 is "b", in the group row's step.
    expect(firstStepWithError(["lines.0.qty"], ["b", "c", "d"], steps, 2)).toBe(1);
    // lines.2 is "d", the last step, not "c".
    expect(firstStepWithError(["lines.2.comment"], ["b", "c", "d"], steps, 0)).toBe(2);
  });

  it("a visit error and the trip-wide alert open the last step, where the visit and Save are", () => {
    for (const key of ["purchasedOn", "supplierId", "receiptFileIds", "orders"]) {
      expect(firstStepWithError([key], ["a", "b", "c", "d"], steps, 0)).toBe(2);
    }
  });

  it("a line error of an earlier step wins over a visit error", () => {
    expect(firstStepWithError(["purchasedOn", "lines.0.qty"], ["a", "d"], steps, 2)).toBe(0);
  });

  it("no error keeps the step shown", () => {
    expect(firstStepWithError([], ["a"], steps, 1)).toBe(1);
  });
});
