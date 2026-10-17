import { describe, expect, it } from "vitest";

import {
  PRICE_NOTE_MAX,
  PRICE_PROMPT_PERCENT,
  PRICE_SOURCES,
  RECENT_PURCHASE_COUNT,
  RECENT_PURCHASE_DAYS,
  RECENT_PURCHASE_MIN,
  isPriceNote,
  isPriceSource,
  pricePrompt,
  priceNote,
  recentPurchaseSince,
} from "./prices";

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

// The price prompt: 04 rule 4 ("When recent purchases differ from the reference price by more
// than 20%"); open question 8, Decided ahead 2; plan of 3.10, decided items 1 to 6.

describe("the numbers of the prompt (Decided ahead 2; 04 rule 4)", () => {
  it("the last 3, at least 2, 90 days, more than 20%", () => {
    expect([RECENT_PURCHASE_COUNT, RECENT_PURCHASE_MIN, RECENT_PURCHASE_DAYS]).toEqual([3, 2, 90]);
    expect(PRICE_PROMPT_PERCENT).toBe(20);
  });
});

describe("recentPurchaseSince(): the window, today and the 89 days before it (decided item 6)", () => {
  it("is today − 89 days", () => {
    expect(recentPurchaseSince("2031-05-10")).toBe("2031-02-10");
  });

  it("across a year end and a leap February", () => {
    expect(recentPurchaseSince("2031-01-15")).toBe("2030-10-18");
    expect(recentPurchaseSince("2032-03-30")).toBe("2032-01-01");
  });

  it("refuses a day that does not exist", () => {
    expect(() => recentPurchaseSince("2031-02-30")).toThrow();
  });
});

describe("pricePrompt() (04 rule 4; Decided ahead 2; decided items 1, 2 and 4, Look first)", () => {
  it("prompts with the mean, the percent and the count (the reviewer's worked case)", () => {
    expect(pricePrompt(10_000n, [13_000n, 12_000n])).toEqual({
      average: 12_500n,
      percent: 25n,
      count: 2,
    });
  });

  it("no reference price, no prompt", () => {
    expect(pricePrompt(null, [13_000n, 13_000n, 13_000n])).toBeNull();
  });

  it("fewer than 2 prices, no prompt; 2 are enough", () => {
    expect(pricePrompt(10_000n, [])).toBeNull();
    expect(pricePrompt(10_000n, [20_000n])).toBeNull();
    expect(pricePrompt(10_000n, [20_000n, 20_000n])).toMatchObject({ count: 2 });
  });

  it("exactly +20% and exactly −20% give none (more than)", () => {
    expect(pricePrompt(10_000n, [12_000n, 12_000n])).toBeNull();
    expect(pricePrompt(10_000n, [8_000n, 8_000n])).toBeNull();
  });

  it("one so'm past +20% and past −20% gives one, compared on the unrounded mean", () => {
    // The mean 12 000.5 is past 20%; rounded half up it would read 12 001, and the percent 20.
    expect(pricePrompt(10_000n, [12_000n, 12_001n])).toEqual({
      average: 12_001n,
      percent: 20n,
      count: 2,
    });
    expect(pricePrompt(10_000n, [8_000n, 7_999n])).toEqual({
      average: 8_000n,
      percent: -20n,
      count: 2,
    });
  });

  it("only the newest 3 count", () => {
    // The 4th, older price would bring the mean back inside 20%.
    expect(pricePrompt(10_000n, [13_000n, 13_000n, 13_000n, 1_000n])).toEqual({
      average: 13_000n,
      percent: 30n,
      count: 3,
    });
  });

  it("a gift (0 so'm) is not counted (decided item 4)", () => {
    expect(pricePrompt(10_000n, [0n, 15_000n])).toBeNull();
    expect(pricePrompt(10_000n, [15_000n, 0n, 15_000n])).toMatchObject({ count: 2 });
  });

  it("the mean is plain, rounded half up (decided items 1 and 2; CLAUDE.md rule 6)", () => {
    expect(pricePrompt(10_000n, [13_000n, 13_000n, 13_001n])).toMatchObject({
      average: 13_000n,
    });
    expect(pricePrompt(10_000n, [13_000n, 13_001n])).toMatchObject({ average: 13_001n });
  });

  it("the percent rounds half away from zero, as the price hint", () => {
    // Mean 13 250 against 10 000: 32.5% → 33; mean 6 750: −32.5% → −33.
    expect(pricePrompt(10_000n, [13_000n, 13_500n])).toMatchObject({ percent: 33n });
    expect(pricePrompt(10_000n, [7_000n, 6_500n])).toMatchObject({ percent: -33n });
  });
});
