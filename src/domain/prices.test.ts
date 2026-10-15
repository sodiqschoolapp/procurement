import { describe, expect, it } from "vitest";

import { PRICE_NOTE_MAX, PRICE_SOURCES, isPriceNote, isPriceSource, priceNote } from "./prices";

// 04-catalogs.md rule 4 ("the Head adds the new price with a short note"); 14-data-model.md,
// price_history.source [HEAD|PURCHASE]; plan of 1.9, decision 8.

describe("the source (14-data-model.md, price_history)", () => {
  it("HEAD and PURCHASE only", () => {
    expect(PRICE_SOURCES).toEqual(["HEAD", "PURCHASE"]);
    expect(isPriceSource("HEAD")).toBe(true);
    expect(isPriceSource("PURCHASE")).toBe(true);
    for (const value of ["head", "IMPORT", "", null, 1]) expect(isPriceSource(value)).toBe(false);
  });
});

describe("the note of a new price (04 rule 4: a short note; plan of 1.9, decision 8)", () => {
  it("is trimmed, inner spaces kept", () => {
    expect(priceNote("  Yangi narx  yetkazib beruvchidan \n")).toBe(
      "Yangi narx  yetkazib beruvchidan",
    );
  });

  it("is 1 to 200 code points once trimmed", () => {
    expect(isPriceNote("Narx oshdi")).toBe(true);
    expect(isPriceNote("a".repeat(PRICE_NOTE_MAX))).toBe(true);
    expect(isPriceNote("😀".repeat(PRICE_NOTE_MAX))).toBe(true);
    expect(isPriceNote("a".repeat(PRICE_NOTE_MAX + 1))).toBe(false);
  });

  it("is required: empty, blank or untrimmed is refused", () => {
    for (const value of ["", "   ", " padded ", null, undefined, 5]) {
      expect(isPriceNote(value)).toBe(false);
    }
  });
});
