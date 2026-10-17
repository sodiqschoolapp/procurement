import { describe, expect, it } from "vitest";

import {
  type CashRecord,
  type MatchOrder,
  type MoneyRow,
  type MoneyRowKind,
  actionTotal,
  approvalCashRows,
  cashSpent,
  crossingRefusal,
  isExactMatch,
  managerCashBalance,
  orderCashCount,
  plannedCash,
  plannedCashOf,
  settlementNet,
  settlementRows,
} from "./money-ledger";
import type { OrderPlan } from "./order-totals";
import type { PaymentType } from "./payment-types";

// 08-money-and-settlement.md, Money ledger; Exact match; When Finance approves; Closing 2; Worked
// example; plan of 4.1, decided items 1 to 8 and 11.

const NOTEBOOK = "variant-notebook";

function record(
  qty: string,
  unitPrice: bigint,
  extras: { amount: bigint; paymentType: PaymentType }[] = [],
  options: { paymentType?: PaymentType; isCancelled?: boolean; variantId?: string } = {},
): CashRecord {
  return {
    variantId: options.variantId ?? NOTEBOOK,
    qty,
    unitPrice,
    paymentType: options.paymentType ?? "CASH",
    extras,
    isCancelled: options.isCancelled ?? false,
  };
}

const cash = (amount: bigint) => ({ amount, paymentType: "CASH" as const });

function row(kind: MoneyRowKind, amount: bigint, isCancelled = false): MoneyRow {
  return { kind, amount, isCancelled };
}

/** 08 Worked example: 100 notebooks × 5 000 in cash, plus 20 000 delivery; 520 000 given. */
const NOTEBOOKS: OrderPlan = {
  quantity: "100",
  price: 5_000n,
  extras: [20_000n],
  paymentType: "CASH",
};
const GIVEN = [row("CASH_GIVEN", 520_000n)];

describe("order's cash count (08 Money ledger; Worked example)", () => {
  it("the four worked-example counts: Exact 0, Cheaper +50 000, Dearer −30 000, Fewer +50 000", () => {
    expect(orderCashCount(GIVEN, [record("100", 5_000n, [cash(20_000n)])])).toBe(0n);
    expect(orderCashCount(GIVEN, [record("100", 4_500n, [cash(20_000n)])])).toBe(50_000n);
    expect(orderCashCount(GIVEN, [record("100", 5_200n, [cash(30_000n)])])).toBe(-30_000n);
    expect(orderCashCount(GIVEN, [record("90", 5_000n, [cash(20_000n)])])).toBe(50_000n);
  });

  it("Bank transfer, Card top-up and Card money returned never change a count (08 Money ledger table)", () => {
    const records = [record("100", 4_500n, [cash(20_000n)])];
    for (const kind of ["BANK_TRANSFER", "CARD_TOPUP", "CARD_RETURNED"] as const) {
      expect(orderCashCount([...GIVEN, row(kind, 300_000n)], records)).toBe(50_000n);
      expect(orderCashCount([row(kind, 300_000n)], [])).toBe(0n);
    }
  });

  it("Cash given and Paid back raise it, Cash returned lowers it", () => {
    expect(orderCashCount([row("CASH_GIVEN", 10_000n)], [])).toBe(10_000n);
    expect(orderCashCount([row("PAID_BACK", 10_000n)], [])).toBe(10_000n);
    expect(orderCashCount([row("CASH_RETURNED", 10_000n)], [])).toBe(-10_000n);
  });

  it("the rows of a cancelled action and cancelled records are left out (08 Order's cash count)", () => {
    const rows = [...GIVEN, row("CASH_GIVEN", 100_000n, true)];
    const records = [
      record("100", 5_000n, [cash(20_000n)]),
      record("10", 5_000n, [cash(5_000n)], { isCancelled: true }),
    ];
    expect(orderCashCount(rows, records)).toBe(0n);
  });

  it("cash spent counts Cash trips and Cash extras only (decided item 2, Look first)", () => {
    // A Transfer trip with a Cash delivery counts the delivery only.
    expect(cashSpent([record("100", 5_000n, [cash(20_000n)], { paymentType: "TRANSFER" })])).toBe(
      20_000n,
    );
    // A Cash trip with a card delivery counts the goods only.
    expect(cashSpent([record("100", 5_000n, [{ amount: 20_000n, paymentType: "CARD" }])])).toBe(
      500_000n,
    );
    // Goods are round(quantity × price) half up, per record (08 Numbers): 0.5 × 3 = 1.5 → 2.
    expect(cashSpent([record("0.5", 3n)])).toBe(2n);
  });

  it("a row of 0 so'm is refused, as the database refuses it (14 money_rows CHECK)", () => {
    expect(() => orderCashCount([row("CASH_GIVEN", 0n)], [])).toThrow(RangeError);
  });
});

describe("Manager's cash balance (08 Money ledger; decided item 7)", () => {
  it("held and owed apart, never netted; Closed orders are left out", () => {
    expect(
      managerCashBalance([
        { status: "PURCHASING", cashCount: 50_000n },
        { status: "SETTLEMENT", cashCount: -30_000n },
        { status: "PURCHASING", cashCount: 0n },
        { status: "SETTLEMENT", cashCount: 10_000n },
        { status: "CLOSED", cashCount: 70_000n },
        { status: "CLOSED", cashCount: -70_000n },
      ]),
    ).toEqual({ held: 60_000n, owed: 30_000n });
  });

  it("nothing is 0 and 0", () => {
    expect(managerCashBalance([])).toEqual({ held: 0n, owed: 0n });
  });
});

/** 08 Worked example, three orders of one Manager in branch CHL. */
const PENS: OrderPlan = { quantity: "50", price: 2_000n, extras: [], paymentType: "CASH" };
const FOLDERS: OrderPlan = { quantity: "10", price: 3_000n, extras: [], paymentType: "CASH" };
const THREE = [
  { id: "CHL-26-0142", ownerId: "manager-a", plan: NOTEBOOKS },
  { id: "CHL-26-0143", ownerId: "manager-a", plan: PENS },
  { id: "CHL-26-0144", ownerId: "manager-a", plan: FOLDERS },
];

/** Each order with its prefilled amount, as the dialog and the approval give them (plan of 4.2). */
function prefilled(orders: readonly { id: string; ownerId: string; plan: OrderPlan }[]) {
  return orders.map(({ id, ownerId, plan }) => ({ id, ownerId, amount: plannedCash(plan) }));
}

describe("When Finance approves: the prefilled cash rows (08; decided item 11; plan of 4.2, item 6)", () => {
  it("three orders, one action: 650 000 split 520 000, 100 000, 30 000 (08 Worked example)", () => {
    const blocks = approvalCashRows(prefilled(THREE));
    expect(blocks).toEqual([
      {
        managerId: "manager-a",
        rows: [
          { orderId: "CHL-26-0142", amount: 520_000n },
          { orderId: "CHL-26-0143", amount: 100_000n },
          { orderId: "CHL-26-0144", amount: 30_000n },
        ],
      },
    ]);
    expect(actionTotal(blocks[0]!.rows)).toBe(650_000n);
  });

  it("planned cash is the planned total for a Cash order, 0 otherwise", () => {
    expect(plannedCash(NOTEBOOKS)).toBe(520_000n);
    expect(plannedCash({ ...NOTEBOOKS, paymentType: "TRANSFER" })).toBe(0n);
    expect(plannedCash({ ...NOTEBOOKS, paymentType: "CARD" })).toBe(0n);
    expect(plannedCashOf("CASH", 520_000n)).toBe(520_000n);
    expect(plannedCashOf("TRANSFER", 520_000n)).toBe(0n);
    expect(plannedCashOf("CARD", 520_000n)).toBe(0n);
  });

  it("a non-cash order gets no row; orders of two Managers give two blocks (08 Money ledger 1)", () => {
    expect(
      approvalCashRows(
        prefilled([
          { id: "a1", ownerId: "manager-a", plan: NOTEBOOKS },
          { id: "b1", ownerId: "manager-b", plan: PENS },
          { id: "a2", ownerId: "manager-a", plan: { ...FOLDERS, paymentType: "TRANSFER" } },
          { id: "a3", ownerId: "manager-a", plan: FOLDERS },
        ]),
      ),
    ).toEqual([
      {
        managerId: "manager-a",
        rows: [
          { orderId: "a1", amount: 520_000n },
          { orderId: "a3", amount: 30_000n },
        ],
      },
      { managerId: "manager-b", rows: [{ orderId: "b1", amount: 100_000n }] },
    ]);
  });

  it("only non-cash orders give no block at all", () => {
    expect(
      approvalCashRows(
        prefilled([{ id: "t", ownerId: "m", plan: { ...PENS, paymentType: "CARD" } }]),
      ),
    ).toEqual([]);
  });

  it("rows of 0 write nothing: a row Finance set to 0 is dropped, and a block of only 0 rows too (08)", () => {
    expect(
      approvalCashRows([
        { id: "a1", ownerId: "manager-a", amount: 520_000n },
        { id: "a2", ownerId: "manager-a", amount: 0n },
        { id: "b1", ownerId: "manager-b", amount: 0n },
      ]),
    ).toEqual([{ managerId: "manager-a", rows: [{ orderId: "a1", amount: 520_000n }] }]);
  });

  it("Finance may type more than the planned cash: Cash given has no limit (08 Money ledger 3)", () => {
    expect(approvalCashRows([{ id: "a1", ownerId: "m", amount: 900_000n }])).toEqual([
      { managerId: "m", rows: [{ orderId: "a1", amount: 900_000n }] },
    ]);
  });

  it("a negative amount is refused, never written (14 money_rows CHECK amount > 0)", () => {
    expect(() => approvalCashRows([{ id: "a1", ownerId: "m", amount: -1n }])).toThrow(RangeError);
  });
});

describe("an action's total is the sum of its rows (08 Money ledger)", () => {
  it("650 000 for the three-order example; 0 for no rows", () => {
    expect(actionTotal([{ amount: 520_000n }, { amount: 100_000n }, { amount: 30_000n }])).toBe(
      650_000n,
    );
    expect(actionTotal([])).toBe(0n);
  });
});

describe("the three-order settlement (08 Worked example; Closing 2; Money ledger 2)", () => {
  const counts = [
    {
      id: "CHL-26-0142",
      cashCount: orderCashCount(
        [row("CASH_GIVEN", 520_000n)],
        [record("100", 4_500n, [cash(20_000n)])],
      ),
    },
    {
      id: "CHL-26-0143",
      cashCount: orderCashCount([row("CASH_GIVEN", 100_000n)], [record("50", 2_600n)]),
    },
    {
      id: "CHL-26-0144",
      cashCount: orderCashCount([row("CASH_GIVEN", 30_000n)], [record("10", 3_000n)]),
    },
  ];

  it("the counts are +50 000, −30 000 and 0", () => {
    expect(counts.map((each) => each.cashCount)).toEqual([50_000n, -30_000n, 0n]);
  });

  it("Receive 50 000 on 0142, Pay 30 000 on 0143, nothing on 0144; net: the Manager hands Finance 20 000", () => {
    const rows = settlementRows(counts);
    expect(rows).toEqual([
      { orderId: "CHL-26-0142", kind: "CASH_RETURNED", amount: 50_000n },
      { orderId: "CHL-26-0143", kind: "PAID_BACK", amount: 30_000n },
    ]);
    expect(settlementNet(rows)).toEqual({ direction: "TO_FINANCE", amount: 20_000n });
  });

  it("after the settlement action both counts are 0", () => {
    expect(
      orderCashCount(
        [row("CASH_GIVEN", 520_000n), row("CASH_RETURNED", 50_000n)],
        [record("100", 4_500n, [cash(20_000n)])],
      ),
    ).toBe(0n);
    expect(
      orderCashCount(
        [row("CASH_GIVEN", 100_000n), row("PAID_BACK", 30_000n)],
        [record("50", 2_600n)],
      ),
    ).toBe(0n);
  });

  it("the net the other way: Finance pays the Manager; equal sums: nothing changes hands", () => {
    expect(
      settlementNet([
        { orderId: "a", kind: "CASH_RETURNED", amount: 10_000n },
        { orderId: "b", kind: "PAID_BACK", amount: 25_000n },
      ]),
    ).toEqual({ direction: "TO_MANAGER", amount: 15_000n });
    expect(
      settlementNet([
        { orderId: "a", kind: "CASH_RETURNED", amount: 10_000n },
        { orderId: "b", kind: "PAID_BACK", amount: 10_000n },
      ]),
    ).toEqual({ direction: "NONE", amount: 0n });
  });
});

describe("no crossing over (08 Money ledger 3; decided item 6, Look first)", () => {
  it("a return row above an order's count is refused; at the count it passes", () => {
    expect(crossingRefusal(50_000n, { kind: "CASH_RETURNED", amount: 50_001n })).toBe(
      "ABOVE_COUNT",
    );
    expect(crossingRefusal(50_000n, { kind: "CASH_RETURNED", amount: 50_000n })).toBeNull();
    expect(crossingRefusal(50_000n, { kind: "CASH_RETURNED", amount: 1n })).toBeNull();
  });

  it("a Paid back row above what is owed is refused; at −count it passes", () => {
    expect(crossingRefusal(-30_000n, { kind: "PAID_BACK", amount: 30_001n })).toBe("ABOVE_OWED");
    expect(crossingRefusal(-30_000n, { kind: "PAID_BACK", amount: 30_000n })).toBeNull();
  });

  it("Cash returned on an order that is owed or at 0, Paid back on one that holds money or at 0, are refused", () => {
    expect(crossingRefusal(-30_000n, { kind: "CASH_RETURNED", amount: 1n })).toBe("ABOVE_COUNT");
    expect(crossingRefusal(0n, { kind: "CASH_RETURNED", amount: 1n })).toBe("ABOVE_COUNT");
    expect(crossingRefusal(50_000n, { kind: "PAID_BACK", amount: 1n })).toBe("ABOVE_OWED");
    expect(crossingRefusal(0n, { kind: "PAID_BACK", amount: 1n })).toBe("ABOVE_OWED");
  });

  it("Cash given and the three kinds that change no count have no limit", () => {
    for (const kind of ["CASH_GIVEN", "BANK_TRANSFER", "CARD_TOPUP", "CARD_RETURNED"] as const) {
      for (const count of [-30_000n, 0n, 50_000n]) {
        expect(crossingRefusal(count, { kind, amount: 1_000_000n })).toBeNull();
      }
    }
  });
});

describe("exact match (08 Exact match; decided item 1, Look first)", () => {
  function match(overrides: Partial<MatchOrder> = {}): MatchOrder {
    const records = overrides.records ?? [record("100", 5_000n, [cash(20_000n)])];
    return {
      status: "PURCHASING",
      progress: "DONE",
      variantId: NOTEBOOK,
      plan: NOTEBOOKS,
      records,
      cashCount: orderCashCount(GIVEN, records),
      ...overrides,
    };
  }

  it("Exact: 100 × 5 000 + 20 000 in cash, count 0, matches", () => {
    expect(isExactMatch(match())).toBe(true);
  });

  it("differences that cancel out do not match: price 10 000 lower, extras 10 000 higher (08)", () => {
    const records = [record("100", 4_900n, [cash(30_000n)])];
    expect(orderCashCount(GIVEN, records)).toBe(0n);
    expect(isExactMatch(match({ records }))).toBe(false);
  });

  it("extras that differ from the plan do not match, even at count 0", () => {
    expect(
      isExactMatch(match({ records: [record("100", 5_000n, [cash(10_000n)])], cashCount: 0n })),
    ).toBe(false);
  });

  it("a substituted subtype does not match", () => {
    const records = [record("100", 5_000n, [cash(20_000n)], { variantId: "variant-other" })];
    expect(isExactMatch(match({ records }))).toBe(false);
  });

  it("a record or an extra of another payment type does not match, even at count 0", () => {
    const byCard = [record("100", 5_000n, [cash(20_000n)], { paymentType: "CARD" })];
    expect(isExactMatch(match({ records: byCard, cashCount: 0n }))).toBe(false);
    const extraByCard = [record("100", 5_000n, [{ amount: 20_000n, paymentType: "CARD" }])];
    expect(isExactMatch(match({ records: extraByCard, cashCount: 0n }))).toBe(false);
  });

  it("a cash count not 0 does not match", () => {
    expect(isExactMatch(match({ cashCount: 1n }))).toBe(false);
    expect(isExactMatch(match({ cashCount: -1n }))).toBe(false);
  });

  it("an order whose buying is Open, or before Open, does not match", () => {
    expect(isExactMatch(match({ progress: "OPEN" }))).toBe(false);
    expect(isExactMatch(match({ status: "PENDING_FINANCE" }))).toBe(false);
  });

  it("fewer bought, or a different price, does not match", () => {
    expect(
      isExactMatch(match({ records: [record("90", 5_000n, [cash(20_000n)])], cashCount: 0n })),
    ).toBe(false);
    expect(
      isExactMatch(match({ records: [record("100", 5_200n, [cash(20_000n)])], cashCount: 0n })),
    ).toBe(false);
  });

  it("a cancelled record of another subtype or payment type does not stop a match", () => {
    const records = [
      record("100", 5_000n, [cash(20_000n)]),
      record("5", 9_000n, [{ amount: 1_000n, paymentType: "CARD" }], {
        variantId: "variant-other",
        paymentType: "CARD",
        isCancelled: true,
      }),
    ];
    expect(isExactMatch(match({ records }))).toBe(true);
  });

  it("a Transfer order bought by transfer at plan matches with count 0", () => {
    const plan: OrderPlan = { ...NOTEBOOKS, paymentType: "TRANSFER" };
    const records = [
      record("100", 5_000n, [{ amount: 20_000n, paymentType: "TRANSFER" }], {
        paymentType: "TRANSFER",
      }),
    ];
    expect(isExactMatch(match({ plan, records, cashCount: orderCashCount([], records) }))).toBe(
      true,
    );
  });
});
