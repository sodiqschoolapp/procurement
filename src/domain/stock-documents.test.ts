import { describe, expect, it } from "vitest";

import {
  DOCUMENT_PREFIX,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  documentNumber,
  issueQuantityRefusal,
  lineMovement,
  departmentHolds,
  directEntryCommentRefusal,
  directEntryLineRefusal,
  overReturn,
  reversalOf,
  receivedQuantityRefusal,
  reverseAllows,
  transferReceipt,
  transferReceiveMove,
  WRITE_OFF_OUTCOMES,
  writeOffCommentRefusal,
  writeOffDecisionMove,
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

  it("a return comes in at the average, its line's cost kept for an empty stock (Decided ahead 11; plan of 5.6, decided item 1)", () => {
    expect(lineMovement("RETURN", { qty: "2", unitCost: 4_500n })).toEqual({
      type: "RETURN",
      qtyDelta: "2",
      unitCost: null,
      emptyCost: 4_500n,
    });
    expect(lineMovement("RETURN", { qty: "2", unitCost: 0n })).toMatchObject({ emptyCost: 0n });
  });

  it("refuses a return line without its empty-stock cost (plan of 5.6, correction 1)", () => {
    expect(() => lineMovement("RETURN", { qty: "2", unitCost: null })).toThrow(RangeError);
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
    expect(() => lineMovement("WRITE_OFF", { qty: "5", unitCost: 100n })).toThrow(RangeError);
    expect(() => lineMovement("TRANSFER", { qty: "5", unitCost: 100n })).toThrow(RangeError);
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

describe('issueQuantityRefusal (09 Issue to a department 1; edge case "Half a piece")', () => {
  it("allows up to the stock shown, the stock itself included", () => {
    expect(issueQuantityRefusal("3", false, "10")).toBeNull();
    expect(issueQuantityRefusal("10", false, "10.000")).toBeNull();
    expect(issueQuantityRefusal("2.5", true, "2.500")).toBeNull();
  });

  it("refuses one past the stock", () => {
    expect(issueQuantityRefusal("11", false, "10")).toBe("stockShort");
    expect(issueQuantityRefusal("2.501", true, "2.5")).toBe("stockShort");
    expect(issueQuantityRefusal("1", false, "0")).toBe("stockShort");
  });

  it("asks the quantity rules first: half a piece, 0, empty, too many decimals", () => {
    expect(issueQuantityRefusal("0.5", false, "10")).toBe("wholeOnly");
    expect(issueQuantityRefusal("0", false, "10")).toBe("tooSmall");
    expect(issueQuantityRefusal(" ", false, "10")).toBe("required");
    expect(issueQuantityRefusal("1.2345", true, "10")).toBe("tooManyDecimals");
  });
});

describe("overReturn (09 Other documents, Return: more than the department ever received; plan of 5.6, decided item 2)", () => {
  it("is false up to the amount received, that amount included", () => {
    expect(overReturn("3", "5")).toBe(false);
    expect(overReturn("5", "5.000")).toBe(false);
  });

  it("is true one past it, on decimals too, and on anything when nothing was received", () => {
    expect(overReturn("6", "5")).toBe(true);
    expect(overReturn("2.501", "2.5")).toBe(true);
    expect(overReturn("1", "0")).toBe(true);
  });

  it("is true on anything once the department returned more than it received (net below 0)", () => {
    expect(overReturn("1", "-2")).toBe(true);
  });
});

describe("departmentHolds (plan of 5.6: the items a department holds come first in the search)", () => {
  it("is true above 0 only", () => {
    expect(departmentHolds("0.001")).toBe(true);
    expect(departmentHolds("0.000")).toBe(false);
    expect(departmentHolds("-2.000")).toBe(false);
  });
});

describe("reverseAllows (09 Issue to a department 3; Decided ahead, question 19; plan of 5.7, decided item 1)", () => {
  const maker = "00000000-0000-4000-8000-000000000001";
  const colleague = "00000000-0000-4000-8000-000000000002";

  it("lets the Head and the creating Manager reverse an issue and a return", () => {
    for (const type of ["ISSUE", "RETURN"] as const) {
      expect(reverseAllows({ userId: colleague, role: "HEAD" }, { type, createdBy: maker })).toBe(
        true,
      );
      expect(reverseAllows({ userId: maker, role: "MANAGER" }, { type, createdBy: maker })).toBe(
        true,
      );
    }
  });

  it("refuses another Manager, a Principal and Finance, even as the recorded creator", () => {
    for (const type of ["ISSUE", "RETURN"] as const) {
      expect(
        reverseAllows({ userId: colleague, role: "MANAGER" }, { type, createdBy: maker }),
      ).toBe(false);
      expect(reverseAllows({ userId: maker, role: "PRINCIPAL" }, { type, createdBy: maker })).toBe(
        false,
      );
      expect(reverseAllows({ userId: maker, role: "FINANCE" }, { type, createdBy: maker })).toBe(
        false,
      );
    }
  });

  it("lets only the Head reverse a direct entry, never a Manager, even as its recorded creator (question 19)", () => {
    expect(
      reverseAllows(
        { userId: colleague, role: "HEAD" },
        { type: "DIRECT_ENTRY", createdBy: maker },
      ),
    ).toBe(true);
    for (const role of ["MANAGER", "PRINCIPAL", "FINANCE"] as const) {
      expect(
        reverseAllows({ userId: maker, role }, { type: "DIRECT_ENTRY", createdBy: maker }),
      ).toBe(false);
    }
  });

  it("lets only the Head reverse an approved write-off, never a Manager, even its asker (question 19; plan of 5.11)", () => {
    expect(
      reverseAllows({ userId: colleague, role: "HEAD" }, { type: "WRITE_OFF", createdBy: maker }),
    ).toBe(true);
    for (const role of ["MANAGER", "PRINCIPAL", "FINANCE"] as const) {
      expect(reverseAllows({ userId: maker, role }, { type: "WRITE_OFF", createdBy: maker })).toBe(
        false,
      );
    }
  });

  it("a received transfer: the Head only, never its sender (Decided ahead, question 19; plan of 7.2, decided item 5)", () => {
    expect(
      reverseAllows({ userId: colleague, role: "HEAD" }, { type: "TRANSFER", createdBy: maker }),
    ).toBe(true);
    for (const role of ["MANAGER", "PRINCIPAL", "FINANCE"] as const) {
      expect(reverseAllows({ userId: maker, role }, { type: "TRANSFER", createdBy: maker })).toBe(
        false,
      );
    }
  });

  it("refuses every other type, to the Head and its creator too, until its task adds it", () => {
    for (const type of DOCUMENT_TYPES.filter(
      (each) =>
        each !== "ISSUE" &&
        each !== "RETURN" &&
        each !== "DIRECT_ENTRY" &&
        each !== "WRITE_OFF" &&
        each !== "TRANSFER",
    )) {
      expect(reverseAllows({ userId: maker, role: "HEAD" }, { type, createdBy: maker })).toBe(
        false,
      );
      expect(reverseAllows({ userId: maker, role: "MANAGER" }, { type, createdBy: maker })).toBe(
        false,
      );
    }
  });
});

describe('directEntryCommentRefusal (09 Direct entry: Reason and Comment, "Other" needs a comment)', () => {
  it("asks a comment for Other only", () => {
    expect(directEntryCommentRefusal("OTHER", null)).toBe("required");
    expect(directEntryCommentRefusal("OTHER", "   ")).toBe("required");
    expect(directEntryCommentRefusal("OTHER", "Found in the old store room")).toBeNull();
    expect(directEntryCommentRefusal("EXISTING_STOCK", null)).toBeNull();
    expect(directEntryCommentRefusal("GIFT", null)).toBeNull();
    expect(directEntryCommentRefusal("GIFT", "From the parents' committee")).toBeNull();
  });
});

describe("directEntryLineRefusal: one rule for the form and the Excel import (09 Direct entry, Lines; A7; 04 rule 2; plan of 5.9)", () => {
  const goods = {
    isActive: true,
    productActive: true,
    type: "GOODS" as const,
    allowsDecimals: false,
  };

  it("an unknown subtype and a service are not allowed; an inactive subtype or product is inactive", () => {
    expect(directEntryLineRefusal(undefined, "1")).toEqual({
      field: "variantId",
      kind: "notAllowed",
    });
    expect(directEntryLineRefusal({ ...goods, type: "SERVICE" }, "1")).toEqual({
      field: "variantId",
      kind: "notAllowed",
    });
    expect(directEntryLineRefusal({ ...goods, isActive: false }, "1")).toEqual({
      field: "variantId",
      kind: "inactive",
    });
    expect(directEntryLineRefusal({ ...goods, productActive: false }, "1")).toEqual({
      field: "variantId",
      kind: "inactive",
    });
  });

  it('the quantity by the measure: whole units only where it allows no decimals (edge case "Half a piece")', () => {
    expect(directEntryLineRefusal(goods, "2.5")).toEqual({ field: "qty", kind: "wholeOnly" });
    expect(directEntryLineRefusal({ ...goods, allowsDecimals: true }, "2.5")).toBeNull();
    expect(directEntryLineRefusal(goods, "0")).toEqual({ field: "qty", kind: "tooSmall" });
    expect(directEntryLineRefusal(goods, "200")).toBeNull();
  });
});

describe("writeOffCommentRefusal (09 Other documents, Write-off: a reason plus a comment; Decided ahead, question 13)", () => {
  it("asks a comment for every write-off", () => {
    expect(writeOffCommentRefusal(null)).toBe("required");
    expect(writeOffCommentRefusal("")).toBe("required");
    expect(writeOffCommentRefusal("  \n ")).toBe("required");
    expect(writeOffCommentRefusal("Broken in the storeroom")).toBeNull();
  });
});

describe("writeOffDecisionMove (09 Other documents, Write-off; plan of 5.11, decided item 4; developer-rules rule 2)", () => {
  it("moves a waiting write-off to POSTED on approval and to REJECTED on refusal", () => {
    expect(writeOffDecisionMove("PENDING_APPROVAL", "APPROVE")).toBe("POSTED");
    expect(writeOffDecisionMove("PENDING_APPROVAL", "REFUSE")).toBe("REJECTED");
  });

  it("allows no decision from any other status, so a second decision is refused", () => {
    for (const status of DOCUMENT_STATUSES.filter((each) => each !== "PENDING_APPROVAL")) {
      for (const outcome of WRITE_OFF_OUTCOMES) {
        expect(writeOffDecisionMove(status, outcome)).toBeNull();
      }
    }
  });
});

describe("transferReceiveMove (09 Other documents, Transfer: In transit until received; plan of 7.2; developer-rules rule 2)", () => {
  it("moves an In-transit transfer to Received, and nothing else", () => {
    expect(transferReceiveMove("IN_TRANSIT")).toBe("RECEIVED");
    for (const status of DOCUMENT_STATUSES.filter((each) => each !== "IN_TRANSIT")) {
      expect(transferReceiveMove(status)).toBeNull();
    }
  });
});

describe('receivedQuantityRefusal (09 Transfer: "enters what really arrived"; edge case "Half a piece"; plan of 7.2, decided item 4)', () => {
  it("allows 0, a part and all of what was sent", () => {
    expect(receivedQuantityRefusal("0", false, "10")).toBeNull();
    expect(receivedQuantityRefusal("0.000", true, "10")).toBeNull();
    expect(receivedQuantityRefusal("8", false, "10")).toBeNull();
    expect(receivedQuantityRefusal(" 10 ", false, "10.000")).toBeNull();
    expect(receivedQuantityRefusal("2.5", true, "2.5")).toBeNull();
  });

  it("refuses more than was sent, by the smallest step", () => {
    expect(receivedQuantityRefusal("11", false, "10")).toBe("aboveSent");
    expect(receivedQuantityRefusal("2.501", true, "2.5")).toBe("aboveSent");
  });

  it("follows the measure and the quantity rules", () => {
    expect(receivedQuantityRefusal("1.5", false, "10")).toBe("wholeOnly");
    expect(receivedQuantityRefusal("", false, "10")).toBe("required");
    expect(receivedQuantityRefusal("-1", false, "10")).toBe("wrongFormat");
    expect(receivedQuantityRefusal("1.2345", true, "10")).toBe("tooManyDecimals");
  });
});

describe('transferReceipt (09 Stock value, second bullet; edge case "A transfer arrives short"; plan of 7.2, decided item 1)', () => {
  it("the phase 7 check: 10 sent, 8 received: 8 in at the sender's cost, 2 short, 2 back at the same cost", () => {
    expect(transferReceipt({ qty: "10.000", receivedQty: "8", sentCost: 5000n })).toEqual({
      received: { type: "TRANSFER_IN", qtyDelta: "8", unitCost: 5000n },
      short: "2",
      back: { type: "TRANSFER_IN", qtyDelta: "2", unitCost: 5000n },
    });
  });

  it("all received: nothing short and nothing back", () => {
    expect(transferReceipt({ qty: "10", receivedQty: "10.000", sentCost: 700n })).toEqual({
      received: { type: "TRANSFER_IN", qtyDelta: "10", unitCost: 700n },
      short: null,
      back: null,
    });
  });

  it("nothing received: no movement at the receiver, all of it back", () => {
    expect(transferReceipt({ qty: "2.5", receivedQty: "0", sentCost: 0n })).toEqual({
      received: null,
      short: "2.5",
      back: { type: "TRANSFER_IN", qtyDelta: "2.5", unitCost: 0n },
    });
  });

  it("a received quantity above the sent one is a mistake of the caller", () => {
    expect(() => transferReceipt({ qty: "10", receivedQty: "10.001", sentCost: 1n })).toThrow(
      RangeError,
    );
    expect(() => transferReceipt({ qty: "10", receivedQty: "-1", sentCost: 1n })).toThrow(
      RangeError,
    );
  });
});
