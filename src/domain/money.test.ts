import { describe, expect, it } from "vitest";

import { MONEY_MAX, isSom, isSomOrZero, parseSom, parseSomOrZero } from "./money";

// developer-rules.md rule 6 (money is whole so'm in bigint; no JavaScript float touches money);
// 05-order-request-form.md, Line field 10 ("Whole so'm, more than 0"); plan of 1.7, review Should
// fix 3 (the formatter's own spaces, and a value above the stated maximum).

describe("parseSom (developer-rules rule 6; 05 field 10)", () => {
  it('"1 250 000" is 1250000n, a bigint', () => {
    expect(parseSom("1 250 000")).toBe(1_250_000n);
    expect(typeof parseSom("1 250 000")).toBe("bigint");
  });

  it("reads the groups formatMoney writes: no-break space U+00A0 and U+202F", () => {
    expect(parseSom("1 250 000")).toBe(1_250_000n);
    expect(parseSom("1 250 000")).toBe(1_250_000n);
    expect(parseSom(" 5000 ")).toBe(5000n);
  });

  it("refuses 0, a sign, a decimal point or comma, letters and an empty text", () => {
    for (const text of ["0", "000", "-5", "+5", "1.5", "1,5", "abc", "12a", "", "   "]) {
      expect(parseSom(text), text).toBeNull();
    }
  });

  it("refuses a value above MONEY_MAX and keeps every digit up to it", () => {
    expect(parseSom("999 999 999 999 999")).toBe(MONEY_MAX);
    expect(parseSom("1 000 000 000 000 000")).toBeNull();
    expect(parseSom("9223372036854775808")).toBeNull();
  });

  it("is exact beyond a JavaScript number's safe range", () => {
    expect(parseSom("900719925474099")).toBe(900_719_925_474_099n);
  });
});

describe("isSom (05 field 10)", () => {
  it("a bigint more than 0 and at most MONEY_MAX", () => {
    expect(isSom(1n)).toBe(true);
    expect(isSom(MONEY_MAX)).toBe(true);
    expect(isSom(0n)).toBe(false);
    expect(isSom(-1n)).toBe(false);
    expect(isSom(MONEY_MAX + 1n)).toBe(false);
  });

  it("never a JavaScript number (developer-rules rule 6)", () => {
    expect(isSom(5000)).toBe(false);
    expect(isSom("5000")).toBe(false);
  });
});

describe('parseSomOrZero (08-money-and-settlement.md, Overspend guard: "with the amount at 0 only the percent counts")', () => {
  it('"0" is 0n and "100 000" is 100000n, bigints', () => {
    expect(parseSomOrZero("0")).toBe(0n);
    expect(parseSomOrZero("000")).toBe(0n);
    expect(parseSomOrZero("100 000")).toBe(100_000n);
    expect(parseSomOrZero("100\u00a0000")).toBe(100_000n);
    expect(typeof parseSomOrZero("0")).toBe("bigint");
  });

  it("refuses a sign, a fraction, letters, an empty text and a value above MONEY_MAX", () => {
    for (const text of ["-1", "-5", "+5", "1.5", "1,5", "abc", "", "  ", "1 000 000 000 000 000"]) {
      expect(parseSomOrZero(text), text).toBeNull();
    }
    expect(parseSomOrZero("999 999 999 999 999")).toBe(MONEY_MAX);
  });
});

describe("isSomOrZero (developer-rules rule 6)", () => {
  it("a bigint from 0 to MONEY_MAX", () => {
    for (const ok of [0n, 1n, MONEY_MAX]) expect(isSomOrZero(ok)).toBe(true);
    for (const bad of [-1n, MONEY_MAX + 1n, 0, 1, "0", null]) expect(isSomOrZero(bad)).toBe(false);
  });
});
