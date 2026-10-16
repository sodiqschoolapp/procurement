import { describe, expect, it } from "vitest";

import type { Actor } from "./permissions";
import {
  DRAFT_COMMENT_MAX,
  DRAFT_EXTRAS_MAX,
  URGENT_REASON_MAX,
  addQuantities,
  addsDraftsIn,
  draftComment,
  draftRowRights,
  draftSubmittable,
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
  tickedDraftsTotals,
  totalFits,
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

describe("totalFits (05 field 16; developer-rules rule 6: whole so'm up to MONEY_MAX; review of 2.5a, S3)", () => {
  it("a total of 0 to 999 999 999 999 999 so'm fits, and so does none; one more does not", () => {
    expect(totalFits(null)).toBe(true);
    expect(totalFits(0n)).toBe(true);
    expect(totalFits(999_999_999_999_999n)).toBe(true);
    expect(totalFits(1_000_000_000_000_000n)).toBe(false);
  });

  it("the largest quantity at the largest price does not fit", () => {
    const total = draftTotal({
      quantity: "99999999999.999",
      price: 999_999_999_999_999n,
      extras: [],
      paymentType: "CASH",
    });
    expect(totalFits(total)).toBe(false);
  });
});

describe("tickedDraftsTotals (05 the totals of the ticked orders; 08 sums of the order values)", () => {
  const a = { quantity: "10", price: "6750", extras: ["1000"], paymentType: "CASH" } as const;
  const b = { quantity: "2.5", price: "3333", extras: [], paymentType: "TRANSFER" } as const;
  // Extra costs but no price: no order value, so the whole draft is left out (correction 2).
  const c = { quantity: "4", price: null, extras: ["700"], paymentType: "CARD" } as const;

  it("sums the order values and counts the draft without a price (plan of 2.5b, item 1)", () => {
    const result = tickedDraftsTotals([a, b, c]);
    expect(result.count).toBe(3);
    expect(result.withoutPrice).toBe(1);
    // 10 × 6 750 = 67 500; 2.5 × 3 333 = 8 332.5, half up 8 333.
    expect(result.totals).toEqual({
      goods: 75_833n,
      extras: 1_000n,
      grand: 76_833n,
      byPaymentType: { CASH: 68_500n, TRANSFER: 8_333n, CARD: 0n },
    });
  });

  it("gives each draft's grand total equal to its own draftTotal(), the row's total", () => {
    for (const draft of [a, b]) {
      const row = draftTotal({
        quantity: draft.quantity,
        price: BigInt(draft.price),
        extras: draft.extras.map(BigInt),
        paymentType: draft.paymentType,
      });
      expect(tickedDraftsTotals([draft]).totals.grand).toBe(row);
    }
  });

  it("counts a draft without a quantity as without a price", () => {
    const result = tickedDraftsTotals([{ ...a, quantity: null }]);
    expect(result).toMatchObject({ count: 1, withoutPrice: 1 });
    expect(result.totals.grand).toBe(0n);
  });

  it("refuses money text that is not plain whole so'm (CLAUDE.md rule 6)", () => {
    for (const price of ["", " 12", "1e3", "0x10", "12.5", "-5"]) {
      expect(() => tickedDraftsTotals([{ ...a, price }])).toThrow(RangeError);
    }
    expect(() => tickedDraftsTotals([{ ...a, extras: [""] }])).toThrow(RangeError);
  });

  it("gives zero sums for nothing ticked", () => {
    expect(tickedDraftsTotals([])).toEqual({
      count: 0,
      withoutPrice: 0,
      totals: {
        goods: 0n,
        extras: 0n,
        grand: 0n,
        byPaymentType: { CASH: 0n, TRANSFER: 0n, CARD: 0n },
      },
    });
  });
});

describe("draftRowRights and addsDraftsIn (03 Manager rights: CREATE_REQUESTS; 05 Drafts 3; 06 Statuses: Draft)", () => {
  const OWN = "11111111-1111-4111-8111-111111111111";
  const OTHER = "22222222-2222-4222-8222-222222222222";
  const ME = "33333333-3333-4333-8333-333333333333";
  const COLLEAGUE = "44444444-4444-4444-8444-444444444444";
  const manager: Actor = { userId: ME, role: "MANAGER", branchIds: [OWN], disabledRights: [] };
  const viewOnly: Actor = { ...manager, disabledRights: ["CREATE_REQUESTS"] };
  const head: Actor = { userId: COLLEAGUE, role: "HEAD", branchIds: [], disabledRights: [] };
  const draft = { branchId: OWN, ownerId: ME, status: "DRAFT", number: null } as const;

  it("the owner edits and deletes a never-submitted draft; a numbered or RETURNED one is edited only", () => {
    expect(draftRowRights(manager, draft)).toEqual({ editable: true, deletable: true });
    expect(draftRowRights(manager, { ...draft, number: "EA-26-0001" })).toEqual({
      editable: true,
      deletable: false,
    });
    expect(draftRowRights(manager, { ...draft, status: "RETURNED", number: "EA-26-0002" })).toEqual(
      { editable: true, deletable: false },
    );
    expect(
      draftRowRights(manager, { ...draft, status: "PENDING_HEAD", number: "EA-26-0003" }),
    ).toEqual({ editable: false, deletable: false });
  });

  it("a Manager with CREATE_REQUESTS off sees his rows read-only and adds nowhere", () => {
    expect(draftRowRights(viewOnly, draft)).toEqual({ editable: false, deletable: false });
    expect(addsDraftsIn(viewOnly, { id: OWN, isActive: true })).toBe(false);
    expect(addsDraftsIn(manager, { id: OWN, isActive: true })).toBe(true);
  });

  it("the Head edits a Manager's draft but never deletes it (2.5a decided item 7)", () => {
    expect(draftRowRights(head, draft)).toEqual({ editable: true, deletable: false });
    expect(draftRowRights(head, { ...draft, ownerId: COLLEAGUE })).toEqual({
      editable: true,
      deletable: true,
    });
  });

  it("another branch and an inactive branch add nothing; a colleague's row is not editable", () => {
    expect(addsDraftsIn(manager, { id: OTHER, isActive: true })).toBe(false);
    expect(addsDraftsIn(head, { id: OTHER, isActive: false })).toBe(false);
    expect(addsDraftsIn(head, { id: OTHER, isActive: true })).toBe(true);
    expect(
      draftRowRights(manager, {
        ...draft,
        ownerId: COLLEAGUE,
        status: "RETURNED",
        number: "EA-26-0004",
      }),
    ).toEqual({
      editable: false,
      deletable: false,
    });
  });
});

describe("draftSubmittable (05 Drafts 4; 06 Allowed moves: Draft; plan of 2.7, decided item 3)", () => {
  const OWN = "11111111-1111-4111-8111-111111111111";
  const OTHER = "22222222-2222-4222-8222-222222222222";
  const ME = "33333333-3333-4333-8333-333333333333";
  const COLLEAGUE = "44444444-4444-4444-8444-444444444444";
  const manager: Actor = { userId: ME, role: "MANAGER", branchIds: [OWN], disabledRights: [] };
  const viewOnly: Actor = { ...manager, disabledRights: ["CREATE_REQUESTS"] };
  const head: Actor = { userId: COLLEAGUE, role: "HEAD", branchIds: [], disabledRights: [] };
  const principal: Actor = {
    userId: COLLEAGUE,
    role: "PRINCIPAL",
    branchIds: [OWN],
    disabledRights: [],
  };
  const draft = {
    id: "55555555-5555-4555-8555-555555555555",
    branchId: OWN,
    ownerId: ME,
    status: "DRAFT" as const,
    number: null,
  };

  it("the owner and the Head may submit a numberless draft; nobody else", () => {
    expect(draftSubmittable(manager, draft)).toBe(true);
    expect(draftSubmittable(head, draft)).toBe(true);
    expect(draftSubmittable(viewOnly, draft)).toBe(false);
    expect(draftSubmittable(principal, draft)).toBe(false);
    expect(draftSubmittable(manager, { ...draft, branchId: OTHER })).toBe(false);
    expect(draftSubmittable(manager, { ...draft, ownerId: COLLEAGUE })).toBe(false);
  });

  it("a sent-back order is Submit again (2.11), a taken-back draft waits for 2.11", () => {
    expect(draftSubmittable(manager, { ...draft, status: "RETURNED", number: "EA-26-0001" })).toBe(
      false,
    );
    expect(draftSubmittable(manager, { ...draft, number: "EA-26-0002" })).toBe(false);
  });
});
