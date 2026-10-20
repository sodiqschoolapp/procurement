import { describe, expect, it } from "vitest";

import {
  countComplete,
  countCorrection,
  countDecisionMove,
  countLineMoved,
  countSeenMatches,
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
  countDifference,
  countTypingAllowed,
  countedQuantityRefusal,
  receivedQuantityRefusal,
  reverseAllows,
  transferReceipt,
  transferShort,
  transferCancelMove,
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

  it("an approved count: the Head only, never its starter (Decided ahead, question 19; plan of 7.4, decided item 7)", () => {
    expect(
      reverseAllows({ userId: colleague, role: "HEAD" }, { type: "COUNT", createdBy: maker }),
    ).toBe(true);
    for (const role of ["MANAGER", "PRINCIPAL", "FINANCE"] as const) {
      expect(reverseAllows({ userId: maker, role }, { type: "COUNT", createdBy: maker })).toBe(
        false,
      );
    }
  });

  it("covers every type: each one has its answer (Decided ahead, question 19)", () => {
    for (const type of DOCUMENT_TYPES) {
      expect(reverseAllows({ userId: colleague, role: "HEAD" }, { type, createdBy: maker })).toBe(
        true,
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

describe('transferCancelMove (09 Other documents, Transfer: "Until then the sender or the Head can cancel the transfer"; plan of 7.4c, decided item 2; developer-rules rule 2)', () => {
  it("moves an In-transit transfer to Cancelled, and nothing else", () => {
    expect(transferCancelMove("IN_TRANSIT")).toBe("CANCELLED");
    for (const status of DOCUMENT_STATUSES.filter((each) => each !== "IN_TRANSIT")) {
      expect(transferCancelMove(status)).toBeNull();
    }
  });

  it("leaves a cancelled transfer nothing to receive", () => {
    expect(transferReceiveMove("CANCELLED")).toBeNull();
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

describe("transferShort (09 Other documents, Transfer: any shortage)", () => {
  it("is what was sent less what arrived, exactly", () => {
    expect(transferShort("10.000", "8")).toBe("2");
    expect(transferShort("10", "10.000")).toBe("0");
    expect(transferShort("2.5", "0")).toBe("2.5");
    expect(transferShort("0.003", "0.001")).toBe("0.002");
  });

  it("more received than sent is a mistake of the caller", () => {
    expect(() => transferShort("1", "1.001")).toThrow(RangeError);
    expect(() => transferShort("1", "x")).toThrow(RangeError);
  });
});

describe('countDifference (09 Other documents, Stock count: "The system shows the differences"; plan of 7.3, decided item 2)', () => {
  it("is the counted quantity minus the stock at the start, signed and exact", () => {
    expect(countDifference("10.000", "8")).toBe("-2");
    expect(countDifference("10", "12")).toBe("2");
    expect(countDifference("4.000", "4")).toBe("0");
    expect(countDifference("3", "2.5")).toBe("-0.5");
    expect(countDifference("0", "1.001")).toBe("1.001");
  });

  it("is empty while the line is not counted", () => {
    expect(countDifference("10", null)).toBeNull();
  });
});

describe('countedQuantityRefusal (09 Stock count: "types the counted quantities"; edge case "Half a piece"; plan of 7.3)', () => {
  it("allows 0 by either measure: an item that is not there", () => {
    expect(countedQuantityRefusal("0", false)).toBeNull();
    expect(countedQuantityRefusal("0", true)).toBeNull();
    expect(countedQuantityRefusal("0.000", true)).toBeNull();
  });

  it("follows the measure and the quantity rules", () => {
    expect(countedQuantityRefusal("7", false)).toBeNull();
    expect(countedQuantityRefusal("1.5", true)).toBeNull();
    expect(countedQuantityRefusal("1.5", false)).toBe("wholeOnly");
    expect(countedQuantityRefusal("", false)).toBe("required");
    expect(countedQuantityRefusal("-1", false)).toBe("wrongFormat");
    expect(countedQuantityRefusal("1.2345", true)).toBe("tooManyDecimals");
  });
});

describe("countTypingAllowed (plan of 7.3, decided item 1, Look first)", () => {
  it("is yes only while the count waits", () => {
    for (const status of DOCUMENT_STATUSES) {
      expect(countTypingAllowed(status)).toBe(status === "PENDING_APPROVAL");
    }
  });
});

describe('countComplete (09 Stock count: "the Head approves them"; plan of 7.4, decided item 1, Look first)', () => {
  it("is yes only when every line is counted, 0 included", () => {
    expect(countComplete(["0", "3.5"])).toBe(true);
    expect(countComplete(["0", null])).toBe(false);
    expect(countComplete([null])).toBe(false);
    expect(countComplete([])).toBe(false);
  });
});

describe("countDecisionMove (09 Stock count; plan of 7.4, decided items 1 and 6; developer-rules rule 2)", () => {
  it("approves a complete waiting count to POSTED, never an incomplete one", () => {
    expect(countDecisionMove("PENDING_APPROVAL", "APPROVE", true)).toBe("POSTED");
    expect(countDecisionMove("PENDING_APPROVAL", "APPROVE", false)).toBeNull();
  });

  it("refuses a waiting count to REJECTED, complete or not", () => {
    expect(countDecisionMove("PENDING_APPROVAL", "REFUSE", true)).toBe("REJECTED");
    expect(countDecisionMove("PENDING_APPROVAL", "REFUSE", false)).toBe("REJECTED");
  });

  it("moves nothing from any other status, so a second decision is refused", () => {
    for (const status of DOCUMENT_STATUSES.filter((each) => each !== "PENDING_APPROVAL")) {
      for (const outcome of WRITE_OFF_OUTCOMES) {
        expect(countDecisionMove(status, outcome, true)).toBeNull();
      }
    }
  });
});

describe('countLineMoved (09 Stock count: "If an item moved between the start of the count and the approval")', () => {
  it("is yes for a movement after the start, by seq", () => {
    expect(countLineMoved(100n, 105n)).toBe(true);
    expect(countLineMoved(null, 1n)).toBe(true);
  });

  it("is no for the start's own newest movement and for an item that never moved", () => {
    expect(countLineMoved(100n, 100n)).toBe(false);
    expect(countLineMoved(null, null)).toBe(false);
  });
});

describe('countCorrection (09 Movement types: "Correction after a stock count | Up or down"; plan of 7.4, decided items 3 and 8)', () => {
  it("writes the difference at the average, down and up", () => {
    expect(countCorrection("10", "8")).toEqual({
      type: "CORRECTION",
      qtyDelta: "-2",
      unitCost: null,
    });
    expect(countCorrection("1.5", "2.25")).toEqual({
      type: "CORRECTION",
      qtyDelta: "0.75",
      unitCost: null,
    });
  });

  it("writes nothing for a difference of 0", () => {
    expect(countCorrection("4", "4.000")).toBeNull();
  });

  it("refuses a line that is not counted", () => {
    expect(() => countCorrection("4", null)).toThrow(RangeError);
  });
  it("a line found where the stock at start was 0 carries the last cost as its empty-stock cost (09 Stock value, the count bullet; plan of 7.4b, decided item 2)", () => {
    expect(countCorrection("0", "20", 3000n)).toEqual({
      type: "CORRECTION",
      qtyDelta: "20",
      unitCost: null,
      emptyCost: 3000n,
    });
  });

  it("a line of a stock above 0, a line down and a caller without a last cost carry none", () => {
    expect(countCorrection("5", "25", 3000n)).toEqual({
      type: "CORRECTION",
      qtyDelta: "20",
      unitCost: null,
    });
    expect(countCorrection("5", "0", 3000n)).not.toHaveProperty("emptyCost");
    expect(countCorrection("0", "20")).not.toHaveProperty("emptyCost");
  });
});

describe("countSeenMatches (plan of 7.4, decided item 2, Look first: the Head approves the differences shown)", () => {
  const held = [
    { id: "a", countedQty: "8.000" },
    { id: "b", countedQty: "0" },
  ];

  it("is yes when every line is named once with the same quantity", () => {
    expect(
      countSeenMatches(held, [
        { lineId: "b", countedQty: "0.0" },
        { lineId: "a", countedQty: "8" },
      ]),
    ).toBe(true);
  });

  it("is no for a changed quantity, a missing, extra or repeated line, or an uncounted line", () => {
    expect(
      countSeenMatches(held, [
        { lineId: "a", countedQty: "7" },
        { lineId: "b", countedQty: "0" },
      ]),
    ).toBe(false);
    expect(countSeenMatches(held, [{ lineId: "a", countedQty: "8" }])).toBe(false);
    expect(
      countSeenMatches(held, [
        { lineId: "a", countedQty: "8" },
        { lineId: "a", countedQty: "8" },
      ]),
    ).toBe(false);
    expect(
      countSeenMatches(held, [
        { lineId: "a", countedQty: "8" },
        { lineId: "c", countedQty: "0" },
      ]),
    ).toBe(false);
    expect(
      countSeenMatches([{ id: "a", countedQty: null }], [{ lineId: "a", countedQty: "0" }]),
    ).toBe(false);
  });
});
