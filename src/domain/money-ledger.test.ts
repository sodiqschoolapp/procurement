import { describe, expect, it } from "vitest";

import {
  type CashRecord,
  type MatchOrder,
  type MoneyRow,
  type MoneyRowKind,
  type SettlementConfirmations,
  actionTotal,
  approvalCashRows,
  blockConfirmed,
  cashHanded,
  cashNeeded,
  cashSince,
  cashSpent,
  crossingRefusal,
  isExactMatch,
  managerBalances,
  managerCashBalance,
  moneyCancelAllows,
  moneyPrefill,
  moneyRecordAllows,
  orderCashCount,
  paidBy,
  plannedCash,
  plannedCashOf,
  orderOverspend,
  overspendNeedsAck,
  readyToClose,
  settlementAllows,
  settlementBlocks,
  settlementCashRows,
  settlementNet,
  settlementRows,
  transferNeedsNote,
} from "./money-ledger";
import type { OrderPlan, PricedPlan } from "./order-totals";
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
const NOTEBOOKS: PricedPlan = {
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

describe("the date since when (08 Money with managers; plan of 4.9, decided item 2, Look first)", () => {
  const dated = (kind: MoneyRowKind, occurredOn: string, isCancelled = false) => ({
    row: row(kind, 10_000n, isCancelled),
    occurredOn,
  });
  const bought = (purchasedOn: string, value: CashRecord) => ({ record: value, purchasedOn });

  it("the oldest live row that changes the count: Cash given, Cash returned, Paid back", () => {
    expect(
      cashSince(
        [
          dated("CASH_GIVEN", "2031-05-10"),
          dated("CASH_RETURNED", "2031-05-07"),
          dated("PAID_BACK", "2031-05-12"),
        ],
        [],
      ),
    ).toBe("2031-05-07");
  });

  it("a cancelled action and a Bank transfer, Card top-up or Card money returned row give no date", () => {
    expect(
      cashSince(
        [
          dated("CASH_GIVEN", "2031-05-01", true),
          dated("BANK_TRANSFER", "2031-05-02"),
          dated("CARD_TOPUP", "2031-05-03"),
          dated("CARD_RETURNED", "2031-05-04"),
          dated("CASH_GIVEN", "2031-05-09"),
        ],
        [],
      ),
    ).toBe("2031-05-09");
  });

  it("a live record with cash spent counts by its trip's date; bought before cash was given", () => {
    expect(
      cashSince([dated("CASH_GIVEN", "2031-05-09")], [bought("2031-05-02", record("1", 100n))]),
    ).toBe("2031-05-02");
  });

  it("a cancelled record and a Transfer trip without a Cash extra give no date", () => {
    expect(
      cashSince(
        [dated("CASH_GIVEN", "2031-05-09")],
        [
          bought("2031-05-01", record("1", 100n, [], { isCancelled: true })),
          bought("2031-05-02", record("1", 100n, [], { paymentType: "TRANSFER" })),
        ],
      ),
    ).toBe("2031-05-09");
  });

  it("a Transfer trip with a Cash delivery changes the count, so its date counts (08 Cash spent)", () => {
    expect(
      cashSince(
        [dated("CASH_GIVEN", "2031-05-09")],
        [bought("2031-05-03", record("1", 100n, [cash(5_000n)], { paymentType: "TRANSFER" }))],
      ),
    ).toBe("2031-05-03");
  });

  it("nothing that changes the count gives null", () => {
    expect(cashSince([dated("BANK_TRANSFER", "2031-05-02")], [])).toBeNull();
    expect(cashSince([], [])).toBeNull();
  });
});

describe("money with managers (08 Money with managers; Manager's cash balance)", () => {
  const order = (
    id: string,
    ownerId: string,
    ownerName: string,
    cashCount: bigint,
    since: string,
    number = id,
  ) => ({ id, number, ownerId, ownerName, status: "PURCHASING" as const, cashCount, since });

  it("one block per owner with held and owed apart, never netted", () => {
    const blocks = managerBalances([
      order("a", "m1", "Zarina", 50_000n, "2031-05-01"),
      order("b", "m1", "Zarina", -30_000n, "2031-05-02"),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ ownerId: "m1", held: 50_000n, owed: 30_000n });
    expect(blocks[0]!.orders.map((each) => each.id)).toEqual(["a", "b"]);
  });

  it("an order whose count is 0 is not behind any balance, and an owner with only such orders is not listed", () => {
    const blocks = managerBalances([
      order("a", "m1", "Zarina", 0n, "2031-05-01"),
      order("b", "m2", "Bahrom", 10_000n, "2031-05-05"),
      order("c", "m2", "Bahrom", 0n, "2031-04-01"),
    ]);
    expect(blocks.map((each) => each.ownerId)).toEqual(["m2"]);
    expect(blocks[0]!.orders.map((each) => each.id)).toEqual(["b"]);
    // The since date is of the orders behind the balance only: c's older date is not taken.
    expect(blocks[0]!.since).toBe("2031-05-05");
  });

  it("oldest first: by the oldest since of each owner's orders, ties by name, then id", () => {
    const blocks = managerBalances([
      order("a", "m1", "Zarina", 10_000n, "2031-05-09"),
      order("b", "m1", "Zarina", 10_000n, "2031-05-03"),
      order("c", "m2", "Bahrom", 10_000n, "2031-05-04"),
      order("d", "m3", "Aziz", 10_000n, "2031-05-04"),
      order("e", "m4", "Aziz", -10_000n, "2031-05-04"),
    ]);
    expect(blocks.map((each) => [each.ownerId, each.since])).toEqual([
      ["m1", "2031-05-03"],
      ["m3", "2031-05-04"],
      ["m4", "2031-05-04"],
      ["m2", "2031-05-04"],
    ]);
  });

  it("the orders inside a block: oldest first, then by number", () => {
    const blocks = managerBalances([
      order("a", "m1", "Zarina", 10_000n, "2031-05-09", "CHL-31-0003"),
      order("b", "m1", "Zarina", 10_000n, "2031-05-03", "CHL-31-0009"),
      order("c", "m1", "Zarina", 10_000n, "2031-05-09", "CHL-31-0001"),
    ]);
    expect(blocks[0]!.orders.map((each) => each.id)).toEqual(["b", "c", "a"]);
  });
});

/** 08 Worked example, three orders of one Manager in branch CHL. */
const PENS: PricedPlan = { quantity: "50", price: 2_000n, extras: [], paymentType: "CASH" };
const FOLDERS: PricedPlan = { quantity: "10", price: 3_000n, extras: [], paymentType: "CASH" };
const THREE = [
  { id: "CHL-26-0142", ownerId: "manager-a", plan: NOTEBOOKS },
  { id: "CHL-26-0143", ownerId: "manager-a", plan: PENS },
  { id: "CHL-26-0144", ownerId: "manager-a", plan: FOLDERS },
];

/** Each order with its prefilled amount, as the dialog and the approval give them (plan of 4.2). */
function prefilled(orders: readonly { id: string; ownerId: string; plan: PricedPlan }[]) {
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

describe("the Money tab: when money can be recorded or cancelled (08 Money ledger; plan of 4.3, decided item 1, Look first)", () => {
  it("recorded on Open and Waiting for settlement only", () => {
    expect(moneyRecordAllows("PURCHASING", false)).toBe(true);
    expect(moneyRecordAllows("SETTLEMENT", false)).toBe(true);
    for (const status of [
      "DRAFT",
      "PENDING_HEAD",
      "PENDING_PRINCIPAL",
      "PENDING_FINANCE",
      "RETURNED",
      "CLOSED",
      "REJECTED",
      "CANCELLED",
    ] as const) {
      expect(moneyRecordAllows(status, false)).toBe(false);
    }
  });

  it("never on an order that skipped Finance, Open or reopened (06 Finance step switched off 2: 'no money action has a row on it'; plan of 4.10c)", () => {
    for (const status of ["PURCHASING", "CLOSED"] as const) {
      expect(moneyRecordAllows(status, true)).toBe(false);
    }
  });

  it("cancelled while none of its orders is Closed, and only once (08 Money ledger; Decided ahead, question 3)", () => {
    expect(moneyCancelAllows({ isCancelled: false }, ["PURCHASING", "SETTLEMENT"])).toBe(true);
    expect(moneyCancelAllows({ isCancelled: false }, ["PURCHASING", "CLOSED"])).toBe(false);
    expect(moneyCancelAllows({ isCancelled: true }, ["PURCHASING"])).toBe(false);
  });
});

describe('the Money tab\'s prefilled rows (08 When Finance approves: "a later Cash given row is prefilled with the order\'s planned cash not yet given, never below 0"; edge cases "Finance gives cash for several orders"; D55 (1); plan of 4.10b, decided items 1 and 2, Look first)', () => {
  // `handed` is cashHanded(): given + paid back − returned, rows not cancelled.
  const given = (plannedCash: bigint, handed: bigint) =>
    moneyPrefill("CASH_GIVEN", { plannedCash, cashCount: 0n, handed });

  it("Cash given is the planned cash not yet given: 520 000 given at approval prefills 0, 500 000 given prefills 20 000", () => {
    expect(given(520_000n, 520_000n)).toBe(0n);
    expect(given(520_000n, 500_000n)).toBe(20_000n);
    expect(given(520_000n, 0n)).toBe(520_000n);
  });

  it("never below 0: 600 000 given against 520 000 planned prefills 0", () => {
    expect(given(520_000n, 600_000n)).toBe(0n);
  });

  it("after a Cash returned and after a Paid back (review correction 2)", () => {
    const rows = (...each: [MoneyRowKind, bigint][]): MoneyRow[] =>
      each.map(([kind, amount]) => ({ kind, amount, isCancelled: false }));
    // 520 000 given, 100 000 returned: 100 000 is no longer in the Manager's hands.
    expect(
      given(520_000n, cashHanded(rows(["CASH_GIVEN", 520_000n], ["CASH_RETURNED", 100_000n]))),
    ).toBe(100_000n);
    // 500 000 given, 520 000 spent, 20 000 paid back: all 520 000 handed.
    expect(
      given(520_000n, cashHanded(rows(["CASH_GIVEN", 500_000n], ["PAID_BACK", 20_000n]))),
    ).toBe(0n);
  });

  it("a non-cash order (no planned cash) stays an empty row, whatever was handed", () => {
    expect(given(0n, 0n)).toBeNull();
    expect(given(0n, 50_000n)).toBeNull();
  });

  it("Cash returned is the count above 0 (worked example, Cheaper: +50 000); empty at 0 and below", () => {
    expect(
      moneyPrefill("CASH_RETURNED", { plannedCash: 520_000n, cashCount: 50_000n, handed: 0n }),
    ).toBe(50_000n);
    expect(
      moneyPrefill("CASH_RETURNED", { plannedCash: 520_000n, cashCount: 0n, handed: 0n }),
    ).toBeNull();
    expect(
      moneyPrefill("CASH_RETURNED", { plannedCash: 520_000n, cashCount: -30_000n, handed: 0n }),
    ).toBeNull();
  });

  it("Paid back is the count without its minus below 0 (worked example, Dearer: −30 000); empty at 0 and above", () => {
    expect(
      moneyPrefill("PAID_BACK", { plannedCash: 520_000n, cashCount: -30_000n, handed: 0n }),
    ).toBe(30_000n);
    expect(
      moneyPrefill("PAID_BACK", { plannedCash: 520_000n, cashCount: 0n, handed: 0n }),
    ).toBeNull();
    expect(
      moneyPrefill("PAID_BACK", { plannedCash: 520_000n, cashCount: 50_000n, handed: 0n }),
    ).toBeNull();
  });

  it("Bank transfer, Card top-up and Card money returned are never prefilled (08 names no amount)", () => {
    for (const kind of ["BANK_TRANSFER", "CARD_TOPUP", "CARD_RETURNED"] as const) {
      expect(
        moneyPrefill(kind, { plannedCash: 520_000n, cashCount: -30_000n, handed: 0n }),
      ).toBeNull();
    }
  });
});

describe("paid by one payment type (08 Money ledger, Cash spent; Closing 2; plan of 4.5)", () => {
  const transfer = (amount: bigint) => ({ amount, paymentType: "TRANSFER" as const });
  it("counts the goods of records of that trip type and the extras of that type, live only", () => {
    const records = [
      record("10", 3_000n, [cash(5_000n)], { paymentType: "TRANSFER" }),
      record("2", 1_000n, [transfer(4_000n)]),
      record("5", 9_000n, [], { paymentType: "TRANSFER", isCancelled: true }),
    ];
    expect(paidBy(records, "TRANSFER")).toBe(30_000n + 4_000n);
    expect(paidBy(records, "CASH")).toBe(2_000n + 5_000n);
    expect(paidBy(records, "CARD")).toBe(0n);
    expect(cashSpent(records)).toBe(paidBy(records, "CASH"));
  });
});

describe("settlement blocks per payment type used (08 Closing 2; plan of 4.5, decided item 5, Look first)", () => {
  it("a cash order of the worked example has only the Cash block, with its five figures", () => {
    const blocks = settlementBlocks({
      plan: NOTEBOOKS,
      records: [record("100", 4_500n, [cash(20_000n)])],
      rows: GIVEN,
    });
    expect(blocks.cash).toEqual({
      given: 520_000n,
      spent: 470_000n,
      returned: 0n,
      paidBack: 0n,
      count: 50_000n,
    });
    expect(blocks.transfer).toBeNull();
    expect(blocks.card).toBeNull();
  });

  it("a transfer order with a cash delivery has the Transfer and the Cash blocks", () => {
    const plan: OrderPlan = { ...NOTEBOOKS, paymentType: "TRANSFER" };
    const blocks = settlementBlocks({
      plan,
      records: [record("100", 5_000n, [cash(20_000n)], { paymentType: "TRANSFER" })],
      rows: [row("BANK_TRANSFER", 500_000n), row("BANK_TRANSFER", 9_000n, true)],
    });
    expect(blocks.transfer).toEqual({
      planned: 520_000n,
      transferred: 500_000n,
      received: 500_000n,
    });
    expect(blocks.cash?.spent).toBe(20_000n);
    expect(blocks.cash?.count).toBe(-20_000n);
    expect(blocks.card).toBeNull();
  });

  it("S9: a card order 40 000 under shows Left 40 000; charged above planned is a negative difference (Over)", () => {
    const plan: OrderPlan = { quantity: "100", price: 4_000n, extras: [], paymentType: "CARD" };
    const under = settlementBlocks({
      plan,
      records: [record("100", 3_600n, [], { paymentType: "CARD" })],
      rows: [],
    });
    expect(under.card).toEqual({
      planned: 400_000n,
      charged: 360_000n,
      difference: 40_000n,
      returned: 0n,
    });
    const over = settlementBlocks({
      plan,
      records: [record("100", 4_100n, [], { paymentType: "CARD" })],
      rows: [row("CARD_RETURNED", 1_000n)],
    });
    expect(over.card?.difference).toBe(-10_000n);
    expect(over.card?.returned).toBe(1_000n);
  });

  it('S13: a Not bought cash order given 520 000 asks for 520 000 back (edge case "Cash was given but nothing was bought")', () => {
    const blocks = settlementBlocks({ plan: NOTEBOOKS, records: [], rows: GIVEN });
    expect(blocks.cash?.count).toBe(520_000n);
    expect(settlementRows([{ id: "o", cashCount: blocks.cash!.count }])).toEqual([
      { orderId: "o", kind: "CASH_RETURNED", amount: 520_000n },
    ]);
  });

  it("a type only planned and never used has no block", () => {
    const plan: OrderPlan = { ...NOTEBOOKS, paymentType: "CARD" };
    const blocks = settlementBlocks({ plan, records: [record("100", 5_000n)], rows: [] });
    expect(blocks.card).toBeNull();
    expect(blocks.transfer).toBeNull();
    expect(blocks.cash?.count).toBe(-500_000n);
  });

  it("cancelled rows and records use no type", () => {
    const blocks = settlementBlocks({
      plan: NOTEBOOKS,
      records: [record("1", 1_000n, [], { paymentType: "CARD", isCancelled: true })],
      rows: [row("BANK_TRANSFER", 1_000n, true), row("CASH_GIVEN", 5n, true)],
    });
    expect(blocks).toEqual({ cash: null, transfer: null, card: null });
  });
});

describe("the transfer note and the confirmations (08 Closing 2; plan of 4.5, decided item 9, Look first)", () => {
  const transferBlocks = (transferred: bigint, received: bigint) => ({
    cash: null,
    transfer: { planned: 0n, transferred, received },
    card: null,
  });
  it("a note is needed when transferred and received differ, either way", () => {
    expect(transferNeedsNote({ planned: 0n, transferred: 5n, received: 5n })).toBe(false);
    expect(transferNeedsNote({ planned: 0n, transferred: 6n, received: 5n })).toBe(true);
    expect(transferNeedsNote({ planned: 0n, transferred: 5n, received: 6n })).toBe(true);
  });

  it("a transfer ticked while it matched is not confirmed once it differs without a note", () => {
    const stored = {
      transferConfirmed: true,
      transferNote: null,
      cardConfirmed: false,
      overspendAcknowledged: false,
    };
    expect(blockConfirmed("TRANSFER", transferBlocks(500n, 500n), stored)).toBe(true);
    expect(blockConfirmed("TRANSFER", transferBlocks(600n, 500n), stored)).toBe(false);
    expect(
      blockConfirmed("TRANSFER", transferBlocks(600n, 500n), {
        ...stored,
        transferNote: "Refund owed",
      }),
    ).toBe(true);
    expect(
      blockConfirmed("TRANSFER", transferBlocks(600n, 500n), { ...stored, transferNote: "  " }),
    ).toBe(false);
  });

  it("nothing stored, or not ticked, or no such block, is not confirmed", () => {
    expect(blockConfirmed("TRANSFER", transferBlocks(1n, 1n), null)).toBe(false);
    expect(
      blockConfirmed("CARD", transferBlocks(1n, 1n), {
        transferConfirmed: true,
        transferNote: null,
        cardConfirmed: true,
        overspendAcknowledged: false,
      }),
    ).toBe(false);
    const card = {
      cash: null,
      transfer: null,
      card: { planned: 0n, charged: 0n, difference: 0n, returned: 0n },
    };
    expect(
      blockConfirmed("CARD", card, {
        transferConfirmed: false,
        transferNote: null,
        cardConfirmed: true,
        overspendAcknowledged: false,
      }),
    ).toBe(true);
    expect(
      blockConfirmed("CARD", card, {
        transferConfirmed: true,
        transferNote: null,
        cardConfirmed: false,
        overspendAcknowledged: false,
      }),
    ).toBe(false);
  });
});

describe("the settlement action's rows (08 Closing 2; Money ledger 1; plan of 4.5)", () => {
  it("drops rows of 0 and a Manager with nothing left; keeps both kinds in one block", () => {
    expect(
      settlementCashRows([
        { id: "0142", ownerId: "m1", kind: "CASH_RETURNED", amount: 50_000n },
        { id: "0143", ownerId: "m1", kind: "PAID_BACK", amount: 30_000n },
        { id: "0200", ownerId: "m2", kind: "CASH_RETURNED", amount: 0n },
      ]),
    ).toEqual([
      {
        managerId: "m1",
        rows: [
          { orderId: "0142", kind: "CASH_RETURNED", amount: 50_000n },
          { orderId: "0143", kind: "PAID_BACK", amount: 30_000n },
        ],
      },
    ]);
  });

  it("refuses a negative amount", () => {
    expect(() =>
      settlementCashRows([{ id: "o", ownerId: "m", kind: "PAID_BACK", amount: -1n }]),
    ).toThrow(RangeError);
  });

  it("works on orders Waiting for settlement only (06 Allowed moves)", () => {
    expect(settlementAllows("SETTLEMENT")).toBe(true);
    for (const status of ["PURCHASING", "CLOSED", "PENDING_FINANCE", "DRAFT"] as const) {
      expect(settlementAllows(status)).toBe(false);
    }
  });
});

describe("readyToClose() (08 Closing 3; Overspend guard; plan of 4.6, decided items 1 and 2, Look first)", () => {
  const GUARD = { overspend_guard_percent: 10, overspend_guard_min_amount: 100_000n } as const;
  const NONE: SettlementConfirmations = {
    transferConfirmed: false,
    transferNote: null,
    cardConfirmed: false,
    overspendAcknowledged: false,
  };
  const ready = (
    plan: OrderPlan,
    records: CashRecord[],
    rows: MoneyRow[],
    stored: SettlementConfirmations | null = null,
    guard: Parameters<typeof readyToClose>[1] = GUARD,
  ) =>
    readyToClose(
      { plan, records, blocks: settlementBlocks({ plan, records, rows }), stored },
      guard,
    );
  const EXACT = [record("100", 5_000n, [cash(20_000n)])];

  it("a cash count of 0 with no other block is ready", () => {
    expect(ready(NOTEBOOKS, EXACT, GIVEN)).toBe(true);
  });

  it("a count above or below 0 is not ready (Worked example, Cheaper and Dearer before settlement)", () => {
    expect(ready(NOTEBOOKS, [record("100", 4_500n, [cash(20_000n)])], GIVEN)).toBe(false);
    expect(ready(NOTEBOOKS, [record("100", 5_200n, [cash(30_000n)])], GIVEN)).toBe(false);
  });

  it("Cheaper after Receive 50 000 and Dearer after Pay 30 000 are ready: under the guard, no Head step", () => {
    expect(
      ready(
        NOTEBOOKS,
        [record("100", 4_500n, [cash(20_000n)])],
        [...GIVEN, row("CASH_RETURNED", 50_000n)],
      ),
    ).toBe(true);
    expect(
      ready(
        NOTEBOOKS,
        [record("100", 5_200n, [cash(30_000n)])],
        [...GIVEN, row("PAID_BACK", 30_000n)],
      ),
    ).toBe(true);
  });

  it("a cancelled settlement row does not count: the count is back above 0", () => {
    expect(
      ready(
        NOTEBOOKS,
        [record("100", 4_500n, [cash(20_000n)])],
        [...GIVEN, row("CASH_RETURNED", 50_000n, true)],
      ),
    ).toBe(false);
  });

  const TRANSFER: OrderPlan = { ...NOTEBOOKS, extras: [], paymentType: "TRANSFER" };
  const BY_TRANSFER = [record("100", 5_000n, [], { paymentType: "TRANSFER" })];
  it("a used transfer block must be confirmed, with a note while the amounts differ", () => {
    const matched = [row("BANK_TRANSFER", 500_000n)];
    expect(ready(TRANSFER, BY_TRANSFER, matched)).toBe(false);
    expect(ready(TRANSFER, BY_TRANSFER, matched, { ...NONE, transferConfirmed: true })).toBe(true);
    const differs = [row("BANK_TRANSFER", 520_000n)];
    expect(ready(TRANSFER, BY_TRANSFER, differs, { ...NONE, transferConfirmed: true })).toBe(false);
    expect(
      ready(TRANSFER, BY_TRANSFER, differs, {
        ...NONE,
        transferConfirmed: true,
        transferNote: "Invented refund owed",
      }),
    ).toBe(true);
  });

  const CARD: OrderPlan = { ...NOTEBOOKS, extras: [], paymentType: "CARD" };
  it("S9: a card order 40 000 under is ready once Confirmed; the leftover stays on the card", () => {
    const records = [record("100", 4_600n, [], { paymentType: "CARD" })];
    expect(settlementBlocks({ plan: CARD, records, rows: [] }).card?.difference).toBe(40_000n);
    expect(ready(CARD, records, [])).toBe(false);
    expect(ready(CARD, records, [], { ...NONE, transferConfirmed: true })).toBe(false);
    expect(ready(CARD, records, [], { ...NONE, cardConfirmed: true })).toBe(true);
  });

  it("an unused block needs nothing: a card confirmation does not stand in for a cash count", () => {
    expect(ready(NOTEBOOKS, [], GIVEN, { ...NONE, cardConfirmed: true })).toBe(false);
  });

  // S12: planned 520 000, actual 600 000: 80 000 and about 15% over.
  const S12 = [record("100", 5_800n, [cash(20_000n)])];
  const S12_ROWS = [...GIVEN, row("PAID_BACK", 80_000n)];
  it("S12: above the guard (amount 50 000) the Head's acknowledgment is needed; at 100 000 it is not", () => {
    const tight = { ...GUARD, overspend_guard_min_amount: 50_000n };
    expect(ready(NOTEBOOKS, S12, S12_ROWS, null, GUARD)).toBe(true);
    expect(ready(NOTEBOOKS, S12, S12_ROWS, null, tight)).toBe(false);
    expect(ready(NOTEBOOKS, S12, S12_ROWS, NONE, tight)).toBe(false);
    expect(ready(NOTEBOOKS, S12, S12_ROWS, { ...NONE, overspendAcknowledged: true }, tight)).toBe(
      true,
    );
  });

  it("with the guard off no overspend needs the Head", () => {
    const off = { overspend_guard_percent: "off", overspend_guard_min_amount: 0n } as const;
    expect(ready(NOTEBOOKS, S12, S12_ROWS, null, off)).toBe(true);
  });

  it("the worked example's 0142 and 0143 after the one settlement action are ready", () => {
    const pens: OrderPlan = { quantity: "50", price: 2_000n, extras: [], paymentType: "CASH" };
    expect(
      ready(
        NOTEBOOKS,
        [record("100", 4_500n, [cash(20_000n)])],
        [...GIVEN, row("CASH_RETURNED", 50_000n)],
      ),
    ).toBe(true);
    expect(
      ready(pens, [record("50", 2_600n)], [row("CASH_GIVEN", 100_000n), row("PAID_BACK", 30_000n)]),
    ).toBe(true);
  });
});

describe("overspendNeedsAck() (08 Overspend guard: \"must click 'Acknowledge overspend' … before Finance can close\"; plan of 4.7, decided item 3, Look first)", () => {
  const TIGHT = { overspend_guard_percent: 10, overspend_guard_min_amount: 50_000n } as const;
  const NONE: SettlementConfirmations = {
    transferConfirmed: false,
    transferNote: null,
    cardConfirmed: false,
    overspendAcknowledged: false,
  };
  // S12: planned 520 000, actual 600 000. The guard's own cases (0, both 0, off) are overspend.test.ts's.
  const S12 = [record("100", 5_800n, [cash(20_000n)])];

  it("above the guard and not acknowledged: the Head is needed", () => {
    expect(overspendNeedsAck({ plan: NOTEBOOKS, records: S12, stored: null }, TIGHT)).toBe(true);
    expect(overspendNeedsAck({ plan: NOTEBOOKS, records: S12, stored: NONE }, TIGHT)).toBe(true);
  });

  it("once acknowledged: no longer needed", () => {
    const stored = { ...NONE, overspendAcknowledged: true };
    expect(overspendNeedsAck({ plan: NOTEBOOKS, records: S12, stored }, TIGHT)).toBe(false);
  });

  it("under the guard (S12 at the amount 100 000): not needed", () => {
    const guard = { ...TIGHT, overspend_guard_min_amount: 100_000n };
    expect(overspendNeedsAck({ plan: NOTEBOOKS, records: S12, stored: null }, guard)).toBe(false);
  });

  it("a cancelled record does not count toward the actual total", () => {
    const records = [record("100", 5_800n, [cash(20_000n)], { isCancelled: true })];
    expect(overspendNeedsAck({ plan: NOTEBOOKS, records, stored: null }, TIGHT)).toBe(false);
  });
});

describe("Cash needed soon (10 Finance; 08 When Finance approves, Money ledger table; plan of 6.6a, decided items 4 and 5, Look first)", () => {
  const PLANNED = plannedCash(NOTEBOOKS); // 520 000, 08 Worked example
  const open = (handed: bigint) =>
    cashNeeded({ status: "PURCHASING", progress: "OPEN", plannedCash: PLANNED, handed });

  it("hands given and paid back, takes returned back, and leaves out a cancelled action and the information rows", () => {
    expect(
      cashHanded([
        row("CASH_GIVEN", 300_000n),
        row("PAID_BACK", 20_000n),
        row("CASH_RETURNED", 50_000n),
        row("CASH_GIVEN", 999_000n, true),
        row("BANK_TRANSFER", 70_000n),
        row("CARD_TOPUP", 10_000n),
        row("CARD_RETURNED", 5_000n),
      ]),
    ).toBe(270_000n);
  });

  it("is the whole planned cash of an order waiting at Head, Principal or Finance", () => {
    for (const status of ["PENDING_HEAD", "PENDING_PRINCIPAL", "PENDING_FINANCE"] as const) {
      expect(cashNeeded({ status, progress: "OPEN", plannedCash: PLANNED, handed: 0n })).toBe(
        520_000n,
      );
    }
  });

  it("is 0 for a bank-transfer order: its planned cash is 0", () => {
    const plannedCashOfTransfer = plannedCash({ ...NOTEBOOKS, paymentType: "TRANSFER" });
    expect(
      cashNeeded({
        status: "PENDING_FINANCE",
        progress: "OPEN",
        plannedCash: plannedCashOfTransfer,
        handed: 0n,
      }),
    ).toBe(0n);
  });

  it("is the rest of an Open order: planned 520 000, given 300 000 needs 220 000", () => {
    expect(open(cashHanded([row("CASH_GIVEN", 300_000n)]))).toBe(220_000n);
  });

  it("is 0 once the worked example's 520 000 is given, and never below 0", () => {
    expect(open(cashHanded(GIVEN))).toBe(0n);
    expect(open(cashHanded([row("CASH_GIVEN", 600_000n)]))).toBe(0n);
  });

  it("needs 520 000 again when 520 000 was given and returned (review of the plan, Should fix 2)", () => {
    expect(open(cashHanded([row("CASH_GIVEN", 520_000n), row("CASH_RETURNED", 520_000n)]))).toBe(
      520_000n,
    );
  });

  it("counts paid back as handed: 200 000 bought with own money and paid back needs 320 000 (review correction 2)", () => {
    expect(open(cashHanded([row("PAID_BACK", 200_000n)]))).toBe(320_000n);
  });

  it("does not count a cancelled action", () => {
    expect(open(cashHanded([row("CASH_GIVEN", 520_000n, true)]))).toBe(520_000n);
  });

  it("is 0 for an Open order that skipped Finance: it has no cash count (06 Finance step switched off 2; plan of 4.10c, decided item 5, Look first)", () => {
    expect(
      cashNeeded({
        status: "PURCHASING",
        progress: "OPEN",
        plannedCash: PLANNED,
        handed: 0n,
        skippedFinance: true,
      }),
    ).toBe(0n);
    // The same order that went through Finance needs its planned cash (D40).
    expect(open(0n)).toBe(520_000n);
  });

  it("is 0 for a Returned order, a Settlement order and an Open order whose buying is finished", () => {
    for (const status of ["RETURNED", "SETTLEMENT", "CLOSED", "REJECTED", "CANCELLED"] as const) {
      expect(cashNeeded({ status, progress: "OPEN", plannedCash: PLANNED, handed: 0n })).toBe(0n);
    }
    for (const progress of ["DONE", "DONE_SHORT", "NOT_BOUGHT"] as const) {
      expect(cashNeeded({ status: "PURCHASING", progress, plannedCash: PLANNED, handed: 0n })).toBe(
        0n,
      );
    }
  });
});

// 08 Numbers: "An order without a planned price has no planned total [...] it is left out of the
// overspend guard"; plan of 2.5d-b, decided items 5 and 9, Look first.
describe("an order without a planned price (08 Numbers; Overspend guard)", () => {
  const unpriced: OrderPlan = { quantity: "10", price: null, extras: [], paymentType: "CASH" };

  // 08 Numbers: "a sum that leaves orders out says how many": Cash needed soon has no amount for
  // it (null), so the sum leaves it out and counts it (review of 2.5d-c at bad1f3f, finding 1).
  it("has no planned cash; Cash needed soon has no amount for it in approval or Open buying", () => {
    expect(plannedCash(unpriced)).toBeNull();
    expect(plannedCashOf("CASH", null)).toBeNull();
    for (const status of ["PENDING_HEAD", "PENDING_PRINCIPAL", "PENDING_FINANCE"] as const) {
      expect(cashNeeded({ status, progress: "OPEN", plannedCash: null, handed: 0n })).toBeNull();
    }
    expect(
      cashNeeded({ status: "PURCHASING", progress: "OPEN", plannedCash: null, handed: 0n }),
    ).toBeNull();
  });

  // 06 Finance step switched off 2: an order that skipped Finance has no cash count and needs
  // nothing, so the sum does not leave it out for lack of a price (review of 2.5d-c at bad1f3f,
  // finding 1, Look first).
  it("that skipped Finance needs nothing (0), not an unknown amount; the same order through Finance has none", () => {
    const open = { status: "PURCHASING", progress: "OPEN", plannedCash: null, handed: 0n } as const;
    expect(cashNeeded({ ...open, skippedFinance: true })).toBe(0n);
    expect(cashNeeded({ ...open, skippedFinance: false })).toBeNull();
  });

  it("whose buying ended, or that was returned, needs nothing (0)", () => {
    for (const progress of ["DONE", "DONE_SHORT", "NOT_BOUGHT"] as const) {
      expect(cashNeeded({ status: "PURCHASING", progress, plannedCash: null, handed: 0n })).toBe(
        0n,
      );
    }
    expect(
      cashNeeded({ status: "RETURNED", progress: "OPEN", plannedCash: null, handed: 0n }),
    ).toBe(0n);
  });

  // 08 When Finance approves: planned cash is "its planned total when its payment type is Cash,
  // else 0", so only a Cash order without a price is left out of the cash sums and counted
  // (review of 2.5d-c, finding 2, Look first).
  it("of Bank transfer or Card has planned cash 0, not null; only a Cash one has none", () => {
    expect(plannedCashOf("TRANSFER", null)).toBe(0n);
    expect(plannedCashOf("CARD", null)).toBe(0n);
    expect(plannedCash({ ...unpriced, paymentType: "TRANSFER" })).toBe(0n);
    expect(plannedCash({ ...unpriced, paymentType: "CARD" })).toBe(0n);
    expect(plannedCashOf("CASH", null)).toBeNull();
  });

  it("is never over the guard, whatever it cost, even with the guard at 0 and 0", () => {
    const guard = { overspend_guard_percent: 0, overspend_guard_min_amount: 0n };
    const records: CashRecord[] = [
      {
        qty: "10",
        unitPrice: 900_000n,
        extras: [],
        isCancelled: false,
        paymentType: "CASH",
        variantId: "v",
      },
    ];
    expect(orderOverspend({ plan: unpriced, records }, guard)).toEqual({
      over: 0n,
      percent: null,
      needsHead: false,
    });
  });

  it("never reaches settlement: its blocks are refused (06 Finance step switched off 8)", () => {
    expect(() => settlementBlocks({ plan: unpriced, records: [], rows: [] })).toThrow(RangeError);
  });
});
