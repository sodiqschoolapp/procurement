import { describe, expect, it } from "vitest";

import { signedQuantity } from "./count-difference";

// 09-warehouse.md, Other documents, Stock count: "The system shows the differences" (plan of 7.3).

describe("signedQuantity (09 Stock count: the differences shown)", () => {
  const quantity = (value: string) => value.replace(".", ",");

  it("puts + before a rise, keeps the formatter's minus of a fall, and nothing before 0", () => {
    expect(signedQuantity("2", quantity)).toBe("+2");
    expect(signedQuantity("-0.5", quantity)).toBe("-0,5");
    expect(signedQuantity("0", quantity)).toBe("0");
  });
});
