import { describe, expect, it } from "vitest";

import { orderNumber } from "./order-numbers";

// 05-order-request-form.md, Order number: "branch code, two-digit year, four-digit counter:
// CHL-26-0142"; rule 2: "starts at 0001. After 9999 it simply grows to five digits."

describe("orderNumber (05 Order number)", () => {
  it("writes the branch code, the two-digit year and four digits (05 Order number, format)", () => {
    expect(orderNumber("CHL", 2026, 142)).toBe("CHL-26-0142");
    expect(orderNumber("AB", 2027, 1)).toBe("AB-27-0001");
    expect(orderNumber("ABCD", 2026, 9999)).toBe("ABCD-26-9999");
  });

  it("grows to five digits after 9999 (05 Order number 2)", () => {
    expect(orderNumber("CHL", 2026, 10000)).toBe("CHL-26-10000");
    expect(orderNumber("CHL", 2026, 123456)).toBe("CHL-26-123456");
  });

  it("pads the year's last two digits (05 Order number, two-digit year)", () => {
    expect(orderNumber("CHL", 2100, 7)).toBe("CHL-00-0007");
    expect(orderNumber("CHL", 2009, 7)).toBe("CHL-09-0007");
  });

  it("matches the database CHECK orders_number_check (14-data-model.md)", () => {
    for (const number of [orderNumber("CHL", 2026, 1), orderNumber("AB", 2030, 10000)]) {
      expect(number).toMatch(/^[A-Z]{2,4}-[0-9]{2}-[0-9]{4,}$/);
    }
  });

  it("refuses a counter below 1, a bad code and a bad year: a wrong number is never made", () => {
    expect(() => orderNumber("CHL", 2026, 0)).toThrow(RangeError);
    expect(() => orderNumber("CHL", 2026, 1.5)).toThrow(RangeError);
    expect(() => orderNumber("chl", 2026, 1)).toThrow(RangeError);
    expect(() => orderNumber("CHLAB", 2026, 1)).toThrow(RangeError);
    expect(() => orderNumber("CHL", 1999, 1)).toThrow(RangeError);
  });
});
