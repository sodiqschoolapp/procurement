import { describe, expect, it } from "vitest";

import {
  DOCUMENT_PREFIX,
  DOCUMENT_TYPES,
  documentNumber,
  lineMovement,
  reversalOf,
} from "./stock-documents";

// The warehouse documents (09-warehouse.md, Movement types; Issue to a department 2; Direct entry
// 2; Other documents; Stock value; plan of 5.1).

describe("documentNumber (09 Issue 2, Direct entry 2, Other documents)", () => {
  it("writes the spec's own examples", () => {
    expect(documentNumber("ISSUE", "CHL", 2026, 31)).toBe("ISS-CHL-26-0031");
    expect(documentNumber("DIRECT_ENTRY", "CHL", 2026, 4)).toBe("ENT-CHL-26-0004");
    expect(documentNumber("TRANSFER", "CHL", 2026, 7)).toBe("TRF-CHL-26-0007");
  });

  it("has one prefix per type, the scopes of number_counters (14)", () => {
    expect(DOCUMENT_TYPES.map((type) => DOCUMENT_PREFIX[type])).toEqual([
      "ISS",
      "RET",
      "TRF",
      "WOF",
      "CNT",
      "ENT",
    ]);
    expect(documentNumber("RETURN", "AB", 2027, 1)).toBe("RET-AB-27-0001");
    expect(documentNumber("WRITE_OFF", "AB", 2027, 1)).toBe("WOF-AB-27-0001");
    expect(documentNumber("COUNT", "AB", 2027, 1)).toBe("CNT-AB-27-0001");
  });

  it("grows to five digits after 9999 (05 Order number 2)", () => {
    expect(documentNumber("ISSUE", "CHL", 2026, 10000)).toBe("ISS-CHL-26-10000");
  });

  it("refuses a bad code or counter: a wrong number is never made", () => {
    expect(() => documentNumber("ISSUE", "chl", 2026, 1)).toThrow(RangeError);
    expect(() => documentNumber("ISSUE", "CHL", 2026, 0)).toThrow(RangeError);
  });
});

describe("lineMovement (09 Movement types; Stock value; decisions 3.1 item 2)", () => {
  it("an issue and a write-off leave at the average", () => {
    expect(lineMovement("ISSUE", { qty: "3", unitCost: null })).toEqual({
      type: "ISSUE",
      qtyDelta: "-3",
      unitCost: null,
    });
    expect(lineMovement("WRITE_OFF", { qty: "1.5", unitCost: null })).toEqual({
      type: "WRITE_OFF",
      qtyDelta: "-1.5",
      unitCost: null,
    });
  });

  it("a return comes in at the average (Decided ahead, question 11)", () => {
    expect(lineMovement("RETURN", { qty: "2", unitCost: null })).toEqual({
      type: "RETURN",
      qtyDelta: "2",
      unitCost: null,
    });
  });

  it("a transfer leaves the sender at its average (09 Stock value, second bullet)", () => {
    expect(lineMovement("TRANSFER", { qty: "10", unitCost: null })).toEqual({
      type: "TRANSFER_OUT",
      qtyDelta: "-10",
      unitCost: null,
    });
  });

  it("a direct entry comes in at the line's cost (Decided ahead, question 12)", () => {
    expect(lineMovement("DIRECT_ENTRY", { qty: "5", unitCost: 3_000n })).toEqual({
      type: "DIRECT_ENTRY",
      qtyDelta: "5",
      unitCost: 3_000n,
    });
  });

  it("refuses a direct-entry line without a cost and another line with one (09 Direct entry, Lines)", () => {
    expect(() => lineMovement("DIRECT_ENTRY", { qty: "5", unitCost: null })).toThrow(RangeError);
    expect(() => lineMovement("ISSUE", { qty: "5", unitCost: 100n })).toThrow(RangeError);
  });

  it("refuses a line of 0 or not numeric(14,3), and a count line (7.4)", () => {
    expect(() => lineMovement("ISSUE", { qty: "0", unitCost: null })).toThrow(RangeError);
    expect(() => lineMovement("ISSUE", { qty: "0.000", unitCost: null })).toThrow(RangeError);
    expect(() => lineMovement("ISSUE", { qty: "-1", unitCost: null })).toThrow(RangeError);
    expect(() => lineMovement("COUNT", { qty: "1", unitCost: null })).toThrow(RangeError);
  });
});

describe("reversalOf (09 Movement types, last paragraph; plan of 5.1, decided item 2)", () => {
  it("brings an out movement back at the cost it left at", () => {
    expect(reversalOf({ qtyDelta: "-2", unitCost: 100n })).toEqual({
      type: "REVERSAL",
      qtyDelta: "2",
      unitCost: 100n,
    });
  });

  it("takes an in movement out at the cost it came in at", () => {
    expect(reversalOf({ qtyDelta: "5.250", unitCost: 300n })).toEqual({
      type: "REVERSAL",
      qtyDelta: "-5.250",
      unitCost: 300n,
    });
  });
});
