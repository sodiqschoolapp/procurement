import { describe, expect, it } from "vitest";

import { enterGoesTo, enterMoves } from "./grid-keys";

// 11-screens-and-ux.md rule 2 ("Tab and Enter move between cells, and Enter on the last row adds a
// draft") and rule 13 (everything works with the keyboard); plan of 2.6, decided items 2 and 3.

describe("enterMoves (11 rules 2 and 13)", () => {
  it("a typed field and a select move on Enter", () => {
    expect(enterMoves({ tagName: "input", type: "text" })).toBe(true);
    expect(enterMoves({ tagName: "INPUT" })).toBe(true);
    expect(enterMoves({ tagName: "SELECT" })).toBe(true);
    expect(enterMoves({ tagName: "INPUT", type: "text", expanded: "false" })).toBe(true);
  });

  it("a button, the tick box and an open product list keep Enter for themselves", () => {
    expect(enterMoves({ tagName: "BUTTON" })).toBe(false);
    expect(enterMoves({ tagName: "INPUT", type: "checkbox" })).toBe(false);
    expect(enterMoves({ tagName: "INPUT", type: "file" })).toBe(false);
    expect(enterMoves({ tagName: "INPUT", type: "text", expanded: "true" })).toBe(false);
    expect(enterMoves({ tagName: "TEXTAREA" })).toBe(false);
    expect(enterMoves({ tagName: "A" })).toBe(false);
  });
});

describe("enterGoesTo (11 rule 2: Enter down, Shift+Enter up, the last row to the add row)", () => {
  it("Enter goes to the next draft, and from the last draft to the add row", () => {
    expect(enterGoesTo(0, 3, false)).toBe(1);
    expect(enterGoesTo(1, 3, false)).toBe(2);
    expect(enterGoesTo(2, 3, false)).toBe("add");
    expect(enterGoesTo(0, 1, false)).toBe("add");
  });

  it("Shift+Enter goes up and stops at the first draft", () => {
    expect(enterGoesTo(2, 3, true)).toBe(1);
    expect(enterGoesTo(0, 3, true)).toBeNull();
  });

  it("a row that is not shown goes nowhere", () => {
    expect(enterGoesTo(-1, 3, false)).toBeNull();
    expect(enterGoesTo(3, 3, false)).toBeNull();
  });
});
