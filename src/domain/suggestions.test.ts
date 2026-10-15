import { describe, expect, it } from "vitest";

import {
  SUGGESTION_STATUSES,
  canDecide,
  isSuggestionNote,
  isSuggestionStatus,
  isUnitText,
  statusAfter,
  suggestionNote,
  unitText,
} from "./suggestions";

describe("a suggestion is decided once (04-catalogs.md rule 8; plan of 1.12, decision 9)", () => {
  it("has the three statuses of 14-data-model.md", () => {
    expect(SUGGESTION_STATUSES).toEqual(["PENDING", "ADDED", "DECLINED"]);
    expect(isSuggestionStatus("ADDED")).toBe(true);
    expect(isSuggestionStatus("added")).toBe(false);
  });

  it("is decided only while pending", () => {
    expect(canDecide("PENDING")).toBe(true);
    expect(canDecide("ADDED")).toBe(false);
    expect(canDecide("DECLINED")).toBe(false);
  });

  it("is added or declined", () => {
    expect(statusAfter("added")).toBe("ADDED");
    expect(statusAfter("declined")).toBe("DECLINED");
  });
});

describe("the fields of a suggestion (04 rule 8; plan of 1.12, decision 5)", () => {
  it("keeps a measure text of 1 to 30 characters, spaces collapsed", () => {
    expect(unitText("  big   box ")).toBe("big box");
    expect(isUnitText("box")).toBe(true);
    expect(isUnitText("x".repeat(30))).toBe(true);
    expect(isUnitText("x".repeat(31))).toBe(false);
    expect(isUnitText("")).toBe(false);
    expect(isUnitText(" box")).toBe(false);
  });

  it("keeps a note or a reason of 1 to 500 characters", () => {
    expect(suggestionNote("  for the lab \n")).toBe("for the lab");
    expect(isSuggestionNote("a")).toBe(true);
    expect(isSuggestionNote("ё".repeat(500))).toBe(true);
    expect(isSuggestionNote("ё".repeat(501))).toBe(false);
    expect(isSuggestionNote("")).toBe(false);
    expect(isSuggestionNote(" padded")).toBe(false);
  });
});
