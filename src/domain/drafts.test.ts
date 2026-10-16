import { describe, expect, it } from "vitest";

import {
  DRAFT_COMMENT_MAX,
  DRAFT_EXTRAS_MAX,
  URGENT_REASON_MAX,
  addQuantities,
  draftComment,
  draftTotal,
  isDraftComment,
  isDraftEditable,
  isNeverSubmitted,
  isRequesterName,
  inStock,
  isUrgentReason,
  plainQuantity,
  quantityRefusal,
  requesterName,
  seesDraftsGrid,
  suggestedPrice,
  urgentReason,
} from "./drafts";
import { REQUEST_STATUSES } from "./request-status";

// The draft rules of 05-order-request-form.md (Order fields 7, 10, 11, 12, 14, 15, 16; Drafts 2
// and 3), edge-cases/warehouse.md ("Half a piece is typed for an item counted in pieces") and
// developer-rules.md rule 6; plan of 2.5a, decided items 4, 5, 13, 15, 18 and 19.

describe("quantityRefusal (05 field 10: more than 0, up to 3 decimals, only when the measure allows)", () => {
  it("edge-cases/warehouse.md, Half a piece: 0.5 is refused for a whole-number measure, taken for kg", () => {
    expect(quantityRefusal("0.5", false)).toBe("wholeOnly");
    expect(quantityRefusal("0.5", true)).toBeNull();
  });

  it("whole numbers pass for both kinds of measure; a stored 10.000 is whole", () => {
    expect(quantityRefusal("100", false)).toBeNull();
    expect(quantityRefusal("100", true)).toBeNull();
    expect(quantityRefusal("10.000", false)).toBeNull();
    expect(quantityRefusal(" 7 ", false)).toBeNull();
  });

  it("up to 3 decimals: 2.125 is taken, 1.2345 is too many", () => {
    expect(quantityRefusal("2.125", true)).toBeNull();
    expect(quantityRefusal("1.2345", true)).toBe("tooManyDecimals");
    expect(quantityRefusal("1.2345", false)).toBe("tooManyDecimals");
  });

  it("more than 0: 0 and 0.000 are too small", () => {
    expect(quantityRefusal("0", true)).toBe("tooSmall");
    expect(quantityRefusal("0.000", false)).toBe("tooSmall");
  });

  it("an empty quantity is required", () => {
    expect(quantityRefusal("", true)).toBe("required");
    expect(quantityRefusal("   ", true)).toBe("required");
    expect(quantityRefusal(null, true)).toBe("required");
    expect(quantityRefusal(undefined, true)).toBe("required");
  });

  it("no sign, exponent, hexadecimal, comma or letters (numeric(14,3) text only)", () => {
    for (const text of ["1e2", "0x10", "-1", "+1", "1,5", "abc", "1.", ".5", "Infinity", "1 000"]) {
      expect(quantityRefusal(text, true), text).toBe("wrongFormat");
    }
  });

  it("numeric(14,3): at most 11 whole digits", () => {
    expect(quantityRefusal("99999999999.999", true)).toBeNull();
    expect(quantityRefusal("100000000000", true)).toBe("tooLarge");
  });
});

describe("addQuantities (05 Drafts 2: the existing draft's quantity rises by the new quantity)", () => {
  it("10 + 10 is 20", () => {
    expect(addQuantities("10", "10")).toBe("20");
    expect(addQuantities("10.000", "10")).toBe("20");
  });

  it("exact decimals: 0.125 + 0.875 is 1, 2.5 + 0.25 is 2.75", () => {
    expect(addQuantities("0.125", "0.875")).toBe("1");
    expect(addQuantities("2.5", "0.25")).toBe("2.75");
  });

  it("a sum past numeric(14,3) is null (too large), never a cut number", () => {
    expect(addQuantities("99999999999.999", "0.001")).toBeNull();
    expect(addQuantities("99999999999.998", "0.001")).toBe("99999999999.999");
  });

  it("refuses text that is not a quantity", () => {
    expect(() => addQuantities("1e2", "1")).toThrow(RangeError);
    expect(() => addQuantities("1", "0")).toThrow(RangeError);
  });
});

describe('plainQuantity (05 Drafts 2: "now 20", the same text at the first answer and at a repeat)', () => {
  it("drops the trailing zeros numeric(14,3) keeps", () => {
    expect(plainQuantity("20.000")).toBe("20");
    expect(plainQuantity("2.500")).toBe("2.5");
    expect(plainQuantity("0.125")).toBe("0.125");
  });
});

describe("suggestedPrice (05 field 11: the reference price, else the last purchase price, else empty)", () => {
  it("the reference price when both prices exist", () => {
    expect(suggestedPrice(5_000n, 6_000n)).toBe(5_000n);
  });

  it("the last purchase price when there is no reference price", () => {
    expect(suggestedPrice(null, 6_000n)).toBe(6_000n);
  });

  it("empty when neither exists", () => {
    expect(suggestedPrice(null, null)).toBeNull();
  });
});

describe("urgentReason (05 field 14: Urgent needs a short reason)", () => {
  it("is stored trimmed; a blank reason is refused", () => {
    expect(urgentReason("  Dars ertaga  ")).toBe("Dars ertaga");
    expect(isUrgentReason("Dars ertaga")).toBe(true);
    expect(isUrgentReason("")).toBe(false);
    expect(isUrgentReason("   ")).toBe(false);
    expect(isUrgentReason(null)).toBe(false);
  });

  it("200 code points are taken, 201 refused; an emoji counts as one", () => {
    expect(URGENT_REASON_MAX).toBe(200);
    expect(isUrgentReason("a".repeat(200))).toBe(true);
    expect(isUrgentReason("a".repeat(201))).toBe(false);
    expect(isUrgentReason("😀".repeat(200))).toBe(true);
  });
});

describe("draftComment (05 field 15: optional, up to 1000 characters)", () => {
  it("is stored trimmed", () => {
    expect(draftComment("  Ko'k rangda  ")).toBe("Ko'k rangda");
  });

  it("1000 code points are taken, 1001 refused; an emoji counts as one", () => {
    expect(DRAFT_COMMENT_MAX).toBe(1000);
    expect(isDraftComment("a".repeat(1000))).toBe(true);
    expect(isDraftComment("a".repeat(1001))).toBe(false);
    expect(isDraftComment("😀".repeat(1000))).toBe(true);
    expect(isDraftComment("😀".repeat(1001))).toBe(false);
  });
});

describe("requesterName (05 field 7: an optional text names a specific person)", () => {
  it("is trimmed with inner spaces collapsed; 120 code points are taken, 121 refused", () => {
    expect(requesterName("  Aziza   Karimova ")).toBe("Aziza Karimova");
    expect(isRequesterName("a".repeat(120))).toBe(true);
    expect(isRequesterName("a".repeat(121))).toBe(false);
    expect(isRequesterName("")).toBe(false);
  });
});

describe("draftTotal (05 field 16; 08 Planned total)", () => {
  it("is orderTotal once quantity and price are there: 100 × 5 000 + 20 000 = 520 000", () => {
    expect(
      draftTotal({ quantity: "100", price: 5_000n, extras: [20_000n], paymentType: "CASH" }),
    ).toBe(520_000n);
    expect(draftTotal({ quantity: "2.125", price: 1_002n, extras: [], paymentType: "CARD" })).toBe(
      2_129n,
    );
  });

  it("is null without a quantity or without a price", () => {
    expect(
      draftTotal({ quantity: null, price: 5_000n, extras: [], paymentType: "CASH" }),
    ).toBeNull();
    expect(
      draftTotal({ quantity: "10", price: null, extras: [1n], paymentType: "CASH" }),
    ).toBeNull();
  });
});

describe("the draft's limits and states (05 field 12; Drafts 3 and 5)", () => {
  it("at most 20 extra-cost rows (plan of 2.5a, decided item 13)", () => {
    expect(DRAFT_EXTRAS_MAX).toBe(20);
  });

  it("a draft is edited while DRAFT or RETURNED only", () => {
    const editable = REQUEST_STATUSES.filter((status) => isDraftEditable(status));
    expect(editable).toEqual(["DRAFT", "RETURNED"]);
  });

  it("never submitted: a DRAFT without a number; a taken-back DRAFT keeps its number", () => {
    expect(isNeverSubmitted({ status: "DRAFT", number: null })).toBe(true);
    expect(isNeverSubmitted({ status: "DRAFT", number: "TST-26-0001" })).toBe(false);
    expect(isNeverSubmitted({ status: "RETURNED", number: "TST-26-0001" })).toBe(false);
  });
});

describe("seesDraftsGrid (11-screens-and-ux.md, Screens: Order list, drafts for Manager and Head)", () => {
  it("the Head and a Manager have drafts; the Principal and Finance do not", () => {
    expect(seesDraftsGrid("HEAD")).toBe(true);
    expect(seesDraftsGrid("MANAGER")).toBe(true);
    expect(seesDraftsGrid("PRINCIPAL")).toBe(false);
    expect(seesDraftsGrid("FINANCE")).toBe(false);
  });
});

describe("inStock (05 field 4: current stock of this branch; services show a dash)", () => {
  it("a product's stock without trailing zeros; no stock row is 0; a service has none", () => {
    expect(inStock("GOODS", "12.500")).toBe("12.5");
    expect(inStock("GOODS", "0.000")).toBe("0");
    expect(inStock("GOODS", null)).toBe("0");
    expect(inStock("SERVICE", "3.000")).toBeNull();
    expect(inStock("SERVICE", null)).toBeNull();
  });
});
