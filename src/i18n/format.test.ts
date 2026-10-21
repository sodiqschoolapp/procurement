import { describe, expect, it } from "vitest";

import en from "./messages/en.json";
import ru from "./messages/ru.json";
import uz from "./messages/uz.json";
import {
  bindFormatters,
  formatDate,
  formatMoney,
  formatQuantity,
  formatTime,
  formatTypedAmount,
  NBSP,
  parseTypedDate,
  retypeAmount,
  typedAmountValue,
} from "./format";

// 11-screens-and-ux.md rule 10: "Money as `1 250 000 so'm`. Dates as `08.10.2026`. Time in 24
// hours, Tashkent. Quantities without trailing zeros." The spaces are no-break spaces (U+00A0,
// decisions 0.5 item 3); the expected texts spell them out, so a plain space fails.

const SOM = "so'm";

describe("money as 1 250 000 so'm (11-screens-and-ux.md rule 10)", () => {
  it("groups whole so'm by three with no-break spaces", () => {
    expect(formatMoney(1250000n, SOM)).toBe("1 250 000 so'm");
  });

  it("writes no plain space anywhere in an amount", () => {
    expect(formatMoney(1250000n, SOM)).not.toContain(" ");
    expect(formatMoney(-987654321n, SOM)).not.toContain(" ");
  });

  it("writes small amounts and the group edges", () => {
    expect(formatMoney(0n, SOM)).toBe("0 so'm");
    expect(formatMoney(5n, SOM)).toBe("5 so'm");
    expect(formatMoney(999n, SOM)).toBe("999 so'm");
    expect(formatMoney(1000n, SOM)).toBe("1 000 so'm");
  });

  it("writes a negative amount with a minus (a difference where more was spent)", () => {
    expect(formatMoney(-250000n, SOM)).toBe("-250 000 so'm");
  });

  it("keeps every digit above the largest safe float (developer-rules.md rule 6)", () => {
    expect(formatMoney(9007199254740993n, SOM)).toBe("9 007 199 254 740 993 so'm");
  });

  it("refuses a JavaScript number (developer-rules.md rule 6)", () => {
    expect(() => formatMoney(1250000 as unknown as bigint, SOM)).toThrow(/bigint/);
  });

  it("takes so'm from all three message files (decisions 0.5 item 2)", () => {
    expect([uz.format.currency, ru.format.currency, en.format.currency]).toEqual([SOM, SOM, SOM]);
  });
});

describe("dates as 08.10.2026 (11-screens-and-ux.md rule 10)", () => {
  it("rewrites a business date", () => {
    expect(formatDate("2026-10-08")).toBe("08.10.2026");
  });

  it("shows a moment as its Tashkent date: 20:30 UTC on 31 December is 01.01.2027", () => {
    expect(formatDate(new Date("2026-12-31T20:30:00Z"))).toBe("01.01.2027");
  });

  it("refuses a day that does not exist or a text in another form", () => {
    expect(() => formatDate("2026-02-30")).toThrow(/Refused/);
    expect(() => formatDate("08.10.2026")).toThrow(/Refused/);
    expect(() => formatDate(new Date("x"))).toThrow(/not a valid moment/);
  });
});

describe("time in 24 hours, Tashkent (11-screens-and-ux.md rule 10)", () => {
  it("shows 09:05 UTC as 14:05", () => {
    expect(formatTime(new Date("2026-10-08T09:05:00Z"))).toBe("14:05");
  });

  it("shows midnight as 00:00, never 24:00 or AM/PM", () => {
    expect(formatTime(new Date("2026-10-08T19:00:00Z"))).toBe("00:00");
    expect(formatTime(new Date("2026-10-08T08:00:00Z"))).toBe("13:00");
  });

  it("refuses an invalid moment", () => {
    expect(() => formatTime(new Date("x"))).toThrow(/not a valid moment/);
  });
});

describe("quantities without trailing zeros (11-screens-and-ux.md rule 10)", () => {
  it("drops trailing zeros and a bare separator", () => {
    expect(formatQuantity("12.500", "uz")).toBe("12,5");
    expect(formatQuantity("3.000", "uz")).toBe("3");
    expect(formatQuantity("0.125", "ru")).toBe("0,125");
    expect(formatQuantity("7", "uz")).toBe("7");
  });

  it("groups thousands with no-break spaces", () => {
    expect(formatQuantity("1250.000", "uz")).toBe("1 250");
    expect(formatQuantity("1250.000", "uz")).not.toContain(" ");
  });

  it("writes a decimal comma in uz and ru and a point in en (decisions 0.5 item 4)", () => {
    expect(formatQuantity("12.500", "ru")).toBe("12,5");
    expect(formatQuantity("12.500", "en")).toBe("12.5");
    expect(formatQuantity("1250.500", "en")).toBe("1 250.5");
  });

  it("keeps a minus and never shows minus zero", () => {
    expect(formatQuantity("-3.500", "uz")).toBe("-3,5");
    expect(formatQuantity("-0.000", "uz")).toBe("0");
  });

  it("never rounds (decisions 0.5 item 5)", () => {
    expect(formatQuantity("0.0005", "en")).toBe("0.0005");
  });

  it("refuses a text that is not a plain decimal number", () => {
    for (const value of ["1e3", "", "12,5", " 3", "1.", ".5", "abc"]) {
      expect(() => formatQuantity(value, "uz"), value).toThrow(/Refused/);
    }
  });
});

describe("the formatters bound to a language (11-screens-and-ux.md rule 10)", () => {
  it("uses the unit word and the separator of the language", () => {
    const russian = bindFormatters("ru", ru.format.currency);
    expect(russian.money(1250000n)).toBe("1 250 000 so'm");
    expect(russian.quantity("12.500")).toBe("12,5");
    expect(bindFormatters("en", en.format.currency).quantity("12.500")).toBe("12.5");
  });

  it("writes dates and times the same in every language", () => {
    const moment = new Date("2026-10-08T09:05:00Z");
    for (const locale of ["uz", "ru", "en"] as const) {
      const format = bindFormatters(locale, SOM);
      expect([format.date(moment), format.time(moment)]).toEqual(["08.10.2026", "14:05"]);
    }
  });
});

describe("parseTypedDate (11 rule 10: dates as 08.10.2026, typed back)", () => {
  it("reads a date typed as it is shown", () => {
    expect(parseTypedDate("08.10.2026")).toBe("2026-10-08");
    expect(parseTypedDate(" 8.1.2027 ")).toBe("2027-01-08");
    expect(formatDate(parseTypedDate("29.02.2028")!)).toBe("29.02.2028");
  });

  it("refuses a day that does not exist and any other text", () => {
    for (const text of [
      "31.02.2026",
      "2026-10-08",
      "08.10.26",
      "",
      "8 October 2026",
      "00.10.2026",
    ]) {
      expect(parseTypedDate(text)).toBeNull();
    }
  });
});

// The money fields show the digits grouped as they are typed (redesign of 21.10.2026, 11 rule 10)
// and send exactly the digits they sent before: the grouping is only what the field shows.
describe("a money field groups the digits as they are typed and sends the same digits", () => {
  it('typed "1 500 000" sends 1500000, and shows 1 500 000', () => {
    const typed = retypeAmount("1 500 000", 9);
    expect(typed.value).toBe("1500000");
    expect(BigInt(typed.value)).toBe(1_500_000n);
    expect(typed.shown).toBe(`1${NBSP}500${NBSP}000`);
  });

  it("typed without spaces, the value is the same digits; the field shows them grouped", () => {
    expect(retypeAmount("60000", 5)).toEqual({ value: "60000", shown: `60${NBSP}000`, caret: 6 });
    expect(retypeAmount("520000", 6).value).toBe("520000");
  });

  it("no-break, thin and narrow spaces are grouping too", () => {
    expect(typedAmountValue(`1${NBSP}500\u2009000\u202F`)).toBe("1500000");
  });

  it("a text that is not digits is kept as typed, for the field's own check to refuse", () => {
    expect(typedAmountValue("12a")).toBe("12a");
    expect(formatTypedAmount("12a")).toBe("12a");
    expect(typedAmountValue("-500")).toBe("-500");
    expect(formatTypedAmount("")).toBe("");
  });

  it("the caret stays after the digit just typed when a group space appears before it", () => {
    // "6000" shown; the person types 0 at the end: "60000" becomes "60 000", caret at the end.
    expect(retypeAmount(`6${NBSP}0000`, 6).caret).toBe(6);
    // A 9 typed after "1 5" of "1 500": "1 5900" becomes "15 900", the caret still after the 9.
    expect(retypeAmount(`1${NBSP}5900`, 4)).toEqual({
      value: "15900",
      shown: `15${NBSP}900`,
      caret: 4,
    });
  });
});
