import { describe, expect, it } from "vitest";

import {
  type GroupMember,
  LIST_STATUSES,
  groupPriceHint,
  groupSummary,
  pinsUrgent,
  sumQuantities,
  tickFits,
} from "./order-list";
import { ordersTotals } from "./order-totals";

// 05-order-request-form.md, Group rows 1 ("the total quantity, the total planned amount, how many
// orders it holds, the earliest needed-by date, 'Urgent' when any of its orders is urgent, and the
// price hint when any of them has one"); 08-money-and-settlement.md ("The totals of a group row …
// are the sums of the order values"); 05 field 14 (Urgent pinned for approvers); 06 rule 8 (at
// most 200); plan of 2.8, decided items 1, 3, 5, 14, 17 and the review's decisions 3 and 4.

function member(over: Partial<GroupMember> = {}): GroupMember {
  return {
    quantity: "10",
    price: 1_250n,
    extras: [],
    paymentType: "CASH",
    neededBy: "2026-11-01",
    priority: "NORMAL",
    priceHint: null,
    ...over,
  };
}

describe("groupSummary (05 Group rows 1; 08 the sums of the order values)", () => {
  it("S19: three orders of one subtype, 10 + 10 + 10.5, sum to 30.5 and 38 125 so'm", () => {
    const summary = groupSummary([
      member(),
      member({ quantity: "10.000" }),
      member({ quantity: "10.500" }),
    ]);
    expect(summary.quantity).toBe("30.5");
    expect(summary.totals.grand).toBe(38_125n);
    expect(summary.count).toBe(3);
  });

  it("sums each order's value, never the summed quantity × price: 3 × (0.001 × 400) is 0, not 1", () => {
    const members = [1, 2, 3].map(() => member({ quantity: "0.001", price: 400n }));
    const summary = groupSummary(members);
    expect(summary.quantity).toBe("0.003");
    expect(summary.totals.grand).toBe(0n);
    expect(summary.totals).toEqual(ordersTotals(members));
  });

  it("adds extra costs and splits by payment type as ordersTotals() does", () => {
    const members = [
      member({ extras: [20_000n] }),
      member({ paymentType: "TRANSFER", extras: [1_000n, 2_000n] }),
    ];
    const { totals } = groupSummary(members);
    expect(totals).toEqual(ordersTotals(members));
    expect(totals.byPaymentType.CASH).toBe(32_500n);
    expect(totals.byPaymentType.TRANSFER).toBe(15_500n);
  });

  it("the earliest needed-by date, Urgent when any order is urgent", () => {
    const summary = groupSummary([
      member({ neededBy: "2026-12-01" }),
      member({ neededBy: "2026-10-30", priority: "URGENT" }),
      member({ neededBy: "2026-11-15" }),
    ]);
    expect(summary.earliestNeededBy).toBe("2026-10-30");
    expect(summary.urgent).toBe(true);
    expect(groupSummary([member()]).urgent).toBe(false);
  });

  it("refuses a group without orders", () => {
    expect(() => groupSummary([])).toThrow(RangeError);
  });
});

describe("sumQuantities (review of the plan, Should fix 7)", () => {
  it("a sum past 11 whole digits does not throw", () => {
    expect(sumQuantities(["99999999999.999", "99999999999.999", "0.002"])).toBe("200000000000");
  });

  it("no trailing zeros, exact on thousandths", () => {
    expect(sumQuantities(["1.100", "2.200", "0.700"])).toBe("4");
    expect(sumQuantities(["0.001", "0.002"])).toBe("0.003");
  });

  it("refuses a quantity that is not one", () => {
    expect(() => sumQuantities(["1e3"])).toThrow(RangeError);
  });
});

describe("groupPriceHint (05 Group rows 1; decided item 5, Look first)", () => {
  it("none when no order has a hint", () => {
    expect(groupPriceHint([null, null])).toBeNull();
  });

  it("the hint farthest from the catalog price", () => {
    expect(groupPriceHint([25n, null, -40n, 35n])).toBe(-40n);
    expect(groupPriceHint([25n, 60n, -40n])).toBe(60n);
  });

  it("between +30 and −30 the positive one (review of the plan, decision 4)", () => {
    expect(groupPriceHint([-30n, 30n])).toBe(30n);
    expect(groupPriceHint([30n, -30n])).toBe(30n);
  });

  it("a group row passes its hint on", () => {
    expect(groupSummary([member(), member({ priceHint: 35n })]).priceHint).toBe(35n);
  });
});

describe("pinsUrgent (05 field 14: pinned on top for approvers; decided item 14)", () => {
  it("the Head, the Principal and Finance; not the Manager", () => {
    expect(pinsUrgent("HEAD")).toBe(true);
    expect(pinsUrgent("PRINCIPAL")).toBe(true);
    expect(pinsUrgent("FINANCE")).toBe(true);
    expect(pinsUrgent("MANAGER")).toBe(false);
  });
});

describe("tickFits (06 rule 8: at most 200; decided item 17)", () => {
  const ids = (from: number, count: number) =>
    Array.from({ length: count }, (_, index) => `order-${from + index}`);

  it("200 together fit, 201 do not", () => {
    expect(tickFits(ids(0, 150), ids(150, 50))).toBe(true);
    expect(tickFits(ids(0, 150), ids(150, 51))).toBe(false);
  });

  it("an order already ticked is counted once", () => {
    expect(tickFits(ids(0, 200), ids(190, 10))).toBe(true);
  });
});

describe("LIST_STATUSES (decided item 1, Look first)", () => {
  it("every status but Draft, in the table's order", () => {
    expect(LIST_STATUSES).not.toContain("DRAFT");
    expect(LIST_STATUSES[0]).toBe("PENDING_HEAD");
    expect(LIST_STATUSES).toHaveLength(9);
  });
});
