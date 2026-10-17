import { describe, expect, it } from "vitest";

import { orderTotal } from "./order-totals";
import type { Actor, ManagerRight, Role } from "./permissions";
import {
  type GroupOrder,
  type PurchaseRecord,
  actualExtra,
  actualGoods,
  actualQuantity,
  actualTotal,
  actualUnitPrice,
  buyingActions,
  buyingRefusal,
  type BuyingOrder,
  difference,
  finishedProgress,
  overPlan,
  progressAfterBuying,
  purchaseCommentNeeds,
  purchaseDateRefusal,
  isSubstituted,
  sameAsPlanned,
  splitGroupQuantity,
} from "./purchases";

// 08-money-and-settlement.md, Numbers the system calculates and Worked example; 07-purchasing.md,
// Purchase record, Order progress and One trip, many orders: 2; developer-rules.md rules 1 and 6.

function record(
  qty: string,
  unitPrice: bigint,
  extras: bigint[] = [],
  isCancelled = false,
): PurchaseRecord {
  return { qty, unitPrice, extras, isCancelled };
}

/** 08 Worked example: 100 notebooks × 5 000 in cash, plus 20 000 delivery. */
const PLANNED = orderTotal({
  quantity: "100",
  price: 5_000n,
  extras: [20_000n],
  paymentType: "CASH",
});

describe("the actual numbers (08 Numbers the system calculates; Worked example)", () => {
  it("the plan of the worked example is 520 000", () => {
    expect(PLANNED).toBe(520_000n);
  });

  it("Exact: 100 × 5 000 + 20 000 = 520 000, difference 0", () => {
    const records = [record("100", 5_000n, [20_000n])];
    expect(actualQuantity(records)).toBe("100");
    expect(actualGoods(records)).toBe(500_000n);
    expect(actualExtra(records)).toBe(20_000n);
    expect(actualTotal(records)).toBe(520_000n);
    expect(difference(PLANNED, actualTotal(records))).toBe(0n);
  });

  it("Cheaper: 100 × 4 500 + 20 000 = 470 000, left 50 000", () => {
    const records = [record("100", 4_500n, [20_000n])];
    expect(actualQuantity(records)).toBe("100");
    expect(actualGoods(records)).toBe(450_000n);
    expect(actualTotal(records)).toBe(470_000n);
    expect(difference(PLANNED, actualTotal(records))).toBe(50_000n);
  });

  it("Dearer: 100 × 5 200 + 30 000 = 550 000, over 30 000", () => {
    const records = [record("100", 5_200n, [30_000n])];
    expect(actualGoods(records)).toBe(520_000n);
    expect(actualExtra(records)).toBe(30_000n);
    expect(actualTotal(records)).toBe(550_000n);
    expect(difference(PLANNED, actualTotal(records))).toBe(-30_000n);
  });

  it("Fewer: 90 × 5 000 + 20 000 = 470 000, left 50 000", () => {
    const records = [record("90", 5_000n, [20_000n])];
    expect(actualQuantity(records)).toBe("90");
    expect(actualTotal(records)).toBe(470_000n);
    expect(difference(PLANNED, actualTotal(records))).toBe(50_000n);
  });

  it("07 Purchase record: 60 notebooks on Monday and 40 on Friday are 100", () => {
    const records = [record("60", 5_000n), record("40", 5_000n, [20_000n])];
    expect(actualQuantity(records)).toBe("100");
    expect(actualTotal(records)).toBe(520_000n);
  });

  it("cancelled records are left out of every sum (08: records that are not cancelled)", () => {
    const records = [
      record("60", 5_000n, [10_000n]),
      record("40", 7_000n, [20_000n], true),
      record("5", 1n, [3n], true),
    ];
    expect(actualQuantity(records)).toBe("60");
    expect(actualGoods(records)).toBe(300_000n);
    expect(actualExtra(records)).toBe(10_000n);
    expect(actualTotal(records)).toBe(310_000n);
    expect(difference(PLANNED, actualTotal(records))).toBe(210_000n);
  });

  it("only cancelled records, or none, give 0 everywhere", () => {
    for (const records of [[], [record("100", 5_000n, [20_000n], true)]]) {
      expect(actualQuantity(records)).toBe("0");
      expect(actualGoods(records)).toBe(0n);
      expect(actualExtra(records)).toBe(0n);
      expect(actualTotal(records)).toBe(0n);
      expect(difference(PLANNED, actualTotal(records))).toBe(PLANNED);
    }
  });

  it("08 rounding: each record is rounded half up on its own, then summed", () => {
    // Two records of 0.5 × 3 = 1.5 each round to 2 + 2 = 4, never round(1 × 3) = 3.
    expect(actualGoods([record("0.5", 3n), record("0.5", 3n)])).toBe(4n);
    expect(actualGoods([record("2.5", 3n)])).toBe(8n); // 7.5, exactly half: up
    expect(actualGoods([record("1.333", 1_500n)])).toBe(2_000n); // 1 999.5
    expect(actualQuantity([record("0.5", 3n), record("0.25", 3n)])).toBe("0.75");
  });

  it("07 Purchase record: a gift at price 0 counts its quantity and no goods", () => {
    const records = [record("3", 0n), record("2", 1_000n)];
    expect(actualQuantity(records)).toBe("5");
    expect(actualGoods(records)).toBe(2_000n);
  });

  it("a record that is not well formed is a RangeError", () => {
    expect(() => actualQuantity([record("0", 1n)])).toThrow(RangeError);
    expect(() => actualQuantity([record("1e2", 1n)])).toThrow(RangeError);
    expect(() => actualGoods([record("1", -1n)])).toThrow(RangeError);
    expect(() => actualExtra([record("1", 1n, [0n])])).toThrow(RangeError);
    // A cancelled record is checked too: a broken row is never hidden by its cancel.
    expect(() => actualTotal([record("-1", 1n, [], true)])).toThrow(RangeError);
  });
});

describe("progressAfterBuying (07 Order progress), after a record is saved or cancelled", () => {
  it("Open and Done: Done at the planned quantity or more, Open below", () => {
    for (const current of ["OPEN", "DONE"] as const) {
      expect(progressAfterBuying(current, "100", "100")).toBe("DONE");
      expect(progressAfterBuying(current, "100", "120")).toBe("DONE");
      expect(progressAfterBuying(current, "100", "99.999")).toBe("OPEN");
      expect(progressAfterBuying(current, "100", "0")).toBe("OPEN");
    }
  });

  it("the review's walk: 60 and 40 Done; cancel the 40, Open; finish at 60; cancel the 60, Open", () => {
    expect(progressAfterBuying("OPEN", "100", "60")).toBe("OPEN");
    expect(progressAfterBuying("OPEN", "100", "100")).toBe("DONE");
    expect(progressAfterBuying("DONE", "100", "60")).toBe("OPEN");
    expect(finishedProgress("FINISH", "100", "60")).toEqual({ progress: "DONE_SHORT" });
    expect(progressAfterBuying("DONE_SHORT", "100", "0")).toBe("OPEN");
  });

  it("Done short stays while 0 < received < planned: one of two records cancelled", () => {
    // Finished by hand at 50 of 100 (30 + 20); the 20 is cancelled: still finished by hand.
    expect(progressAfterBuying("DONE_SHORT", "100", "30")).toBe("DONE_SHORT");
    expect(progressAfterBuying("DONE_SHORT", "100", "99.999")).toBe("DONE_SHORT");
    expect(progressAfterBuying("DONE_SHORT", "100", "100")).toBe("DONE");
    // Decided item 4, Look first: nothing received any more, the Manager decides again.
    expect(progressAfterBuying("DONE_SHORT", "100", "0")).toBe("OPEN");
  });

  it("Not bought stays while nothing is received; once something is, Done or Open", () => {
    expect(progressAfterBuying("NOT_BOUGHT", "100", "0")).toBe("NOT_BOUGHT");
    expect(progressAfterBuying("NOT_BOUGHT", "100", "40")).toBe("OPEN");
    expect(progressAfterBuying("NOT_BOUGHT", "100", "100")).toBe("DONE");
  });

  it("a quantity that is not numeric(14,3) text is a RangeError", () => {
    expect(() => progressAfterBuying("OPEN", "0", "1")).toThrow(RangeError);
    expect(() => progressAfterBuying("OPEN", "100", "-1")).toThrow(RangeError);
    expect(() => progressAfterBuying("OPEN", "100", "1e2")).toThrow(RangeError);
  });
});

describe("finishedProgress (07 Order progress: Finish order and Not bought)", () => {
  it("Finish order gives Done short with something received and less than planned", () => {
    expect(finishedProgress("FINISH", "100", "60")).toEqual({ progress: "DONE_SHORT" });
    expect(finishedProgress("FINISH", "100", "0.001")).toEqual({ progress: "DONE_SHORT" });
    expect(finishedProgress("FINISH", "100", "99.999")).toEqual({ progress: "DONE_SHORT" });
  });

  it("Finish order with nothing received is refused: it is Not bought", () => {
    expect(finishedProgress("FINISH", "100", "0")).toEqual({ refusal: "NOTHING_RECEIVED" });
  });

  // Plan of 3.5, decided item 1, Look first: this changes decisions 3.2 item 4, whose
  // finishRefusal() refused these two as NOT_SHORT. A reopened Done order with no further record
  // is finished back to Done, or nothing could ever finish it.
  it("Finish order at the plan or more gives Done (a reopened Done order)", () => {
    expect(finishedProgress("FINISH", "100", "100")).toEqual({ progress: "DONE" });
    expect(finishedProgress("FINISH", "100", "120")).toEqual({ progress: "DONE" });
  });

  it("Not bought needs nothing received", () => {
    expect(finishedProgress("NOT_BOUGHT", "100", "0")).toEqual({ progress: "NOT_BOUGHT" });
    expect(finishedProgress("NOT_BOUGHT", "100", "0.001")).toEqual({
      refusal: "SOMETHING_RECEIVED",
    });
    expect(finishedProgress("NOT_BOUGHT", "100", "100")).toEqual({
      refusal: "SOMETHING_RECEIVED",
    });
  });
});

describe("buyingRefusal and buyingActions (07 Order progress; 03 Permission matrix, Record purchases)", () => {
  const ME = "user-me";
  const OWN = "branch-own";
  const OTHER = "branch-other";

  function actor(role: Role, off: ManagerRight | null = null): Actor {
    return {
      userId: ME,
      role,
      branchIds: role === "HEAD" ? [] : [OWN],
      disabledRights: off ? [off] : [],
    };
  }

  function order(overrides: Partial<BuyingOrder> = {}): BuyingOrder {
    return {
      status: "PURCHASING",
      progress: "OPEN",
      branchId: OWN,
      ownerId: ME,
      plannedQty: "100",
      received: "60",
      ...overrides,
    };
  }

  it("Finish order and Not bought need an Open order whose buying is open", () => {
    for (const status of ["PENDING_FINANCE", "SETTLEMENT", "CLOSED"] as const) {
      expect(buyingRefusal("FINISH_ORDER", order({ status }))).toBe("wrong_status");
      expect(buyingRefusal("MARK_NOT_BOUGHT", order({ status, received: "0" }))).toBe(
        "wrong_status",
      );
    }
    for (const progress of ["DONE", "DONE_SHORT", "NOT_BOUGHT"] as const) {
      expect(buyingRefusal("FINISH_ORDER", order({ progress }))).toBe("wrong_status");
      expect(buyingRefusal("MARK_NOT_BOUGHT", order({ progress, received: "0" }))).toBe(
        "wrong_status",
      );
    }
    expect(buyingRefusal("FINISH_ORDER", order())).toBeNull();
    expect(buyingRefusal("MARK_NOT_BOUGHT", order({ received: "0" }))).toBeNull();
  });

  it("the received rule is finishedProgress(): not_ready", () => {
    expect(buyingRefusal("FINISH_ORDER", order({ received: "0" }))).toBe("not_ready");
    expect(buyingRefusal("MARK_NOT_BOUGHT", order({ received: "60" }))).toBe("not_ready");
  });

  it("Reopen buying needs an Open order whose buying is finished (decided item 3)", () => {
    for (const progress of ["DONE", "DONE_SHORT", "NOT_BOUGHT"] as const) {
      expect(buyingRefusal("REOPEN_BUYING", order({ progress }))).toBeNull();
      expect(buyingRefusal("REOPEN_BUYING", order({ progress, status: "SETTLEMENT" }))).toBe(
        "wrong_status",
      );
    }
    expect(buyingRefusal("REOPEN_BUYING", order())).toBe("wrong_status");
  });

  it("the Head and the owner with RECORD_PURCHASES on; nobody else (decided item 2)", () => {
    const open = order();
    expect(buyingActions(actor("HEAD"), [open])).toEqual(["FINISH_ORDER"]);
    expect(buyingActions(actor("HEAD"), [order({ branchId: OTHER, ownerId: "other" })])).toEqual([
      "FINISH_ORDER",
    ]);
    expect(buyingActions(actor("MANAGER"), [open])).toEqual(["FINISH_ORDER"]);
    expect(buyingActions(actor("MANAGER"), [order({ ownerId: "colleague" })])).toEqual([]);
    expect(buyingActions(actor("MANAGER"), [order({ branchId: OTHER })])).toEqual([]);
    expect(buyingActions(actor("MANAGER", "RECORD_PURCHASES"), [open])).toEqual([]);
    expect(buyingActions(actor("PRINCIPAL"), [open])).toEqual([]);
    expect(buyingActions(actor("FINANCE"), [open])).toEqual([]);
  });

  it("an action is offered only when every ticked order allows it", () => {
    const short = order();
    const empty = order({ received: "0" });
    const done = order({ progress: "DONE", received: "100" });
    expect(buyingActions(actor("MANAGER"), [empty])).toEqual(["MARK_NOT_BOUGHT"]);
    expect(buyingActions(actor("MANAGER"), [short, empty])).toEqual([]);
    expect(buyingActions(actor("MANAGER"), [done])).toEqual(["REOPEN_BUYING"]);
    expect(buyingActions(actor("MANAGER"), [done, short])).toEqual([]);
    expect(buyingActions(actor("MANAGER"), [])).toEqual([]);
  });
});

describe("actualUnitPrice (05 Download 1, actual price; plan of 3.5, decided item 4)", () => {
  it("the Cheaper case: 100 at 4 500 is 4 500", () => {
    expect(actualUnitPrice([record("100", 4_500n, [20_000n])])).toBe(4_500n);
  });

  it("two prices: actual goods ÷ actual quantity, 60 × 4 500 + 40 × 4 600 = 4 540", () => {
    expect(actualUnitPrice([record("60", 4_500n), record("40", 4_600n)])).toBe(4_540n);
  });

  it("a quotient ending in exactly .5 rounds half up: 4 501 and 4 500 give 4 501", () => {
    expect(actualUnitPrice([record("1", 4_501n), record("1", 4_500n)])).toBe(4_501n);
  });

  it("only live records count; nothing received is null", () => {
    expect(actualUnitPrice([record("1", 4_501n), record("1", 9_999n, [], true)])).toBe(4_501n);
    expect(actualUnitPrice([])).toBeNull();
    expect(actualUnitPrice([record("10", 5_000n, [], true)])).toBeNull();
  });
});

describe("overPlan (07 Order progress: buying more than planned shows red)", () => {
  it("is true only above the plan", () => {
    expect(overPlan("100", "100.001")).toBe(true);
    expect(overPlan("100", "110")).toBe(true);
    expect(overPlan("100", "100")).toBe(false);
    expect(overPlan("100", "60")).toBe(false);
    expect(overPlan("100", "0")).toBe(false);
  });
});

describe("splitGroupQuantity (07 One trip, many orders: 2)", () => {
  const AT = new Date("2031-04-11T05:00:00Z");
  const LATER = new Date("2031-04-11T06:00:00Z");

  function order(
    id: string,
    number: string,
    submittedAt: Date,
    plannedQty: string,
    received = "0",
  ): GroupOrder {
    return { id, number, submittedAt, plannedQty, received };
  }

  const LACKS_20 = order("a", "CHL-31-0001", AT, "20");
  const LACKS_10 = order("b", "CHL-31-0002", LATER, "10");

  function split(total: string, orders: GroupOrder[]) {
    return splitGroupQuantity(total, orders).map((part) => [part.id, part.qty]);
  }

  it("30 Tata pens over orders lacking 20 and 10: 20 and 10", () => {
    expect(split("30", [LACKS_20, LACKS_10])).toEqual([
      ["a", "20"],
      ["b", "10"],
    ]);
  });

  it("35 over the same: 20 and 15, the rest to the newest", () => {
    expect(split("35", [LACKS_20, LACKS_10])).toEqual([
      ["a", "20"],
      ["b", "15"],
    ]);
  });

  it("25 over the same: 20 and 5, the oldest filled first", () => {
    expect(split("25", [LACKS_20, LACKS_10])).toEqual([
      ["a", "20"],
      ["b", "5"],
    ]);
  });

  it("the oldest submit first, whatever order the orders come in", () => {
    expect(split("25", [LACKS_10, LACKS_20])).toEqual([
      ["a", "20"],
      ["b", "5"],
    ]);
  });

  it("at the same moment the lower number first, compared as numbers: 0999 before 10000", () => {
    const high = order("high", "CHL-31-10000", AT, "10");
    const low = order("low", "CHL-31-0999", AT, "10");
    expect(split("15", [high, low])).toEqual([
      ["low", "10"],
      ["high", "5"],
    ]);
    // The year before the counter: CHL-30-9999 is lower than CHL-31-0001.
    const lastYear = order("y30", "CHL-30-9999", AT, "10");
    const thisYear = order("y31", "CHL-31-0001", AT, "10");
    expect(split("15", [thisYear, lastYear])).toEqual([
      ["y30", "10"],
      ["y31", "5"],
    ]);
  });

  it("what an order lacks is planned − received, never below 0", () => {
    const halfBought = order("a", "CHL-31-0001", AT, "20", "15");
    const overBought = order("b", "CHL-31-0002", LATER, "10", "12");
    const newest = order("c", "CHL-31-0003", new Date("2031-04-12T05:00:00Z"), "10");
    expect(split("12", [halfBought, overBought, newest])).toEqual([
      ["a", "5"],
      ["b", "0"],
      ["c", "7"],
    ]);
  });

  it("the rest goes to the newest even when it lacked nothing", () => {
    const full = order("b", "CHL-31-0002", LATER, "10", "10");
    expect(split("25", [LACKS_20, full])).toEqual([
      ["a", "20"],
      ["b", "5"],
    ]);
  });

  it("decimal quantities split exactly", () => {
    const a = order("a", "CHL-31-0001", AT, "2.5");
    const b = order("b", "CHL-31-0002", LATER, "1.25");
    expect(split("3.6", [a, b])).toEqual([
      ["a", "2.5"],
      ["b", "1.1"],
    ]);
  });

  it("an empty group, a total of 0 and text that is not numeric(14,3) are RangeErrors", () => {
    expect(() => splitGroupQuantity("30", [])).toThrow(RangeError);
    expect(() => splitGroupQuantity("0", [LACKS_20])).toThrow(RangeError);
    expect(() => splitGroupQuantity("3,5", [LACKS_20])).toThrow(RangeError);
    expect(() => splitGroupQuantity("30", [{ ...LACKS_20, number: "CHL-0001" }])).toThrow(
      RangeError,
    );
  });
});

describe("purchaseCommentNeeds (07 Purchase record, Comment; plan of 3.3, decided item 1)", () => {
  const plan = {
    plannedQty: "100",
    plannedPrice: 5_000n,
    plannedPaymentType: "CARD",
    plannedVariantId: "blue",
  };
  const typed = (
    qty: string,
    unitPrice: bigint,
    paymentType: string,
    received = "0",
    variantId = "blue",
  ) => ({
    ...plan,
    qty,
    unitPrice,
    paymentType,
    received,
    variantId,
  });

  it("a part record at the plan needs none: 60 of 100, then 40 (07, 60 on Monday and 40 on Friday)", () => {
    expect(purchaseCommentNeeds(typed("60", 5_000n, "CARD"))).toEqual([]);
    expect(purchaseCommentNeeds(typed("40", 5_000n, "CARD", "60"))).toEqual([]);
    expect(purchaseCommentNeeds(typed("100", 5_000n, "CARD"))).toEqual([]);
  });

  it("above the plan after the record needs one (edge case 'More was bought than approved')", () => {
    expect(purchaseCommentNeeds(typed("10", 5_000n, "CARD", "100"))).toEqual(["OVER_PLAN"]);
    expect(purchaseCommentNeeds(typed("100.001", 5_000n, "CARD"))).toEqual(["OVER_PLAN"]);
  });

  it("another price needs one", () => {
    expect(purchaseCommentNeeds(typed("60", 5_500n, "CARD"))).toEqual(["PRICE_CHANGED"]);
  });

  it("a price of 0 needs one (edge case 'The item was free')", () => {
    expect(purchaseCommentNeeds(typed("60", 0n, "CARD"))).toEqual(["PRICE_CHANGED", "GIFT"]);
  });

  it("another payment type needs one (edge case 'Planned by card, paid in cash')", () => {
    expect(purchaseCommentNeeds(typed("60", 5_000n, "CASH"))).toEqual(["PAYMENT_CHANGED"]);
  });

  it("another subtype of the product needs one, the ordered one none (07 Comment: on a substitution; plan of 3.6, decided item 2)", () => {
    expect(purchaseCommentNeeds(typed("100", 5_000n, "CARD", "0", "black"))).toEqual([
      "SUBSTITUTED",
    ]);
    expect(purchaseCommentNeeds(typed("100", 5_000n, "CARD", "0", "blue"))).toEqual([]);
    expect(purchaseCommentNeeds(typed("100", 5_500n, "CARD", "0", "black"))).toEqual([
      "PRICE_CHANGED",
      "SUBSTITUTED",
    ]);
  });
});

describe("purchaseDateRefusal (07 Purchase record, Date bought; plan of 3.3, decided item 7)", () => {
  it("a date after today is refused", () => {
    expect(purchaseDateRefusal("2026-10-18", "2026-10-17", "2026-10-01")).toBe("inFuture");
  });

  it("a date before the Finance approval is refused", () => {
    expect(purchaseDateRefusal("2026-09-30", "2026-10-17", "2026-10-01")).toBe("beforeApproval");
  });

  it("the approval day and today are allowed", () => {
    expect(purchaseDateRefusal("2026-10-01", "2026-10-17", "2026-10-01")).toBeNull();
    expect(purchaseDateRefusal("2026-10-17", "2026-10-17", "2026-10-01")).toBeNull();
  });

  it("an order without an approval date is refused", () => {
    expect(purchaseDateRefusal("2026-10-17", "2026-10-17", null)).toBe("beforeApproval");
  });
});

describe("sameAsPlanned (07 Purchase record, 'Same as planned'; plan of 3.3, decided item 5)", () => {
  it("nothing received: the plan", () => {
    expect(sameAsPlanned("100", 5_000n, [20_000n], "0")).toEqual({
      qty: "100",
      unitPrice: 5_000n,
      extras: [20_000n],
    });
  });

  it("60 received: the 40 lacking, the planned price, no extras", () => {
    expect(sameAsPlanned("100", 5_000n, [20_000n], "60")).toEqual({
      qty: "40",
      unitPrice: 5_000n,
      extras: [],
    });
  });

  it("nothing lacking: the planned quantity", () => {
    expect(sameAsPlanned("100.000", 5_000n, [], "100")).toEqual({
      qty: "100",
      unitPrice: 5_000n,
      extras: [],
    });
  });
});

describe("isSubstituted (07 Substitution; 08 Exact match; plan of 3.6, decided item 3)", () => {
  const bought = (variantId: string, isCancelled = false) => ({ variantId, isCancelled });

  it("nothing bought, or only the ordered subtype: not substituted", () => {
    expect(isSubstituted("blue", [])).toBe(false);
    expect(isSubstituted("blue", [bought("blue"), bought("blue")])).toBe(false);
  });

  it("one record of another subtype makes the order substituted", () => {
    expect(isSubstituted("blue", [bought("blue"), bought("black")])).toBe(true);
  });

  it("a cancelled record of another subtype does not count (08: cancelled records are left out)", () => {
    expect(isSubstituted("blue", [bought("blue"), bought("black", true)])).toBe(false);
  });
});
