import { describe, expect, it } from "vitest";

import {
  type ColourOrder,
  type PlanVsActual,
  orderColours,
  orderOutcome,
  planVsActual,
  setColours,
} from "./colours";
import type { OrderPlan } from "./order-totals";
import { type OrderProgress, type PurchaseRecord, actualGoods } from "./purchases";
import type { RequestStatus } from "./request-status";

// 08-money-and-settlement.md, The three colours and Worked example; 07-purchasing.md, Order
// progress; edge case "More was bought than approved"; plan of 3.8, decided items 1 to 5.

function record(
  qty: string,
  unitPrice: bigint,
  extras: bigint[] = [],
  isCancelled = false,
): PurchaseRecord {
  return { qty, unitPrice, extras, isCancelled };
}

/** 08 Worked example: 100 notebooks × 5 000 in cash, plus 20 000 delivery. */
const NOTEBOOKS: OrderPlan = {
  quantity: "100",
  price: 5_000n,
  extras: [20_000n],
  paymentType: "CASH",
};

function order(
  records: PurchaseRecord[],
  progress: OrderProgress = "DONE",
  plan: OrderPlan = NOTEBOOKS,
  status: RequestStatus = "PURCHASING",
): ColourOrder {
  return { status, progress, plan, records };
}

describe("one order (08 The three colours; Worked example)", () => {
  it("Exact: 100 × 5 000 + 20 000, all green", () => {
    expect(orderColours(order([record("100", 5_000n, [20_000n])]))).toEqual({
      number: { colour: "green", difference: "0" },
      price: { colour: "green", difference: 0n },
      total: { colour: "green", difference: 0n },
    });
  });

  it("Cheaper: 100 × 4 500 + 20 000: Number green, Price orange, Total orange Left 50 000", () => {
    expect(orderColours(order([record("100", 4_500n, [20_000n])]))).toEqual({
      number: { colour: "green", difference: "0" },
      price: { colour: "amber", difference: 50_000n },
      total: { colour: "amber", difference: 50_000n },
    });
  });

  it("Dearer: 100 × 5 200 + 30 000: Number green, Price red, Total red Over 30 000", () => {
    expect(orderColours(order([record("100", 5_200n, [30_000n])]))).toEqual({
      number: { colour: "green", difference: "0" },
      price: { colour: "red", difference: -20_000n },
      total: { colour: "red", difference: -30_000n },
    });
  });

  it("Fewer: 90 × 5 000 + 20 000: Number orange, Price green, Total orange Left 50 000", () => {
    expect(orderColours(order([record("90", 5_000n, [20_000n])], "DONE_SHORT"))).toEqual({
      number: { colour: "amber", difference: "10" },
      price: { colour: "green", difference: 0n },
      total: { colour: "amber", difference: 50_000n },
    });
  });

  it("two records of 0.25 at the planned 1 001: Price green with 0, by the unit-price rule", () => {
    const plan: OrderPlan = { quantity: "0.5", price: 1_001n, extras: [], paymentType: "CASH" };
    const records = [record("0.25", 1_001n), record("0.25", 1_001n)];
    // The goods comparison alone would give 1: 250 + 250 = 500 against round(500.5) = 501.
    expect(actualGoods(records)).toBe(500n);
    expect(orderColours(order(records, "DONE", plan))?.price).toEqual({
      colour: "green",
      difference: 0n,
    });
  });

  it("two prices that cancel out (900 and 1 100 at 1 000): Price orange with 0, not green", () => {
    const plan: OrderPlan = { quantity: "2", price: 1_000n, extras: [], paymentType: "CASH" };
    const records = [record("1", 900n), record("1", 1_100n)];
    expect(orderColours(order(records, "DONE", plan))?.price).toEqual({
      colour: "amber",
      difference: 0n,
    });
  });

  it("cancelled records are left out: a cancelled dearer record leaves Price green", () => {
    const records = [record("100", 9_000n, [], true), record("100", 5_000n, [20_000n])];
    expect(orderColours(order(records))).toEqual({
      number: { colour: "green", difference: "0" },
      price: { colour: "green", difference: 0n },
      total: { colour: "green", difference: 0n },
    });
  });

  it("more bought than planned: Number red (edge case 'More was bought than approved')", () => {
    expect(orderColours(order([record("110", 5_000n, [20_000n])]))?.number).toEqual({
      colour: "red",
      difference: "-10",
    });
  });
});

describe("grey (08 The three colours, bullet 1; decided item 1)", () => {
  it("buying Open with nothing bought: all three grey", () => {
    expect(orderColours(order([], "OPEN"))).toEqual({
      number: { colour: "grey" },
      price: { colour: "grey" },
      total: { colour: "grey" },
    });
  });

  it("buying Open after a record: Number and Total grey, Price coloured", () => {
    expect(orderColours(order([record("60", 4_500n)], "OPEN"))).toEqual({
      number: { colour: "grey" },
      price: { colour: "amber", difference: 30_000n },
      total: { colour: "grey" },
    });
  });

  it("every record cancelled while Open: Price grey, not green", () => {
    expect(orderColours(order([record("60", 5_000n, [], true)], "OPEN"))?.price).toEqual({
      colour: "grey",
    });
  });

  it("a reopened Done order bought over plan: Number grey, Price coloured", () => {
    expect(orderColours(order([record("110", 5_000n)], "OPEN"))).toEqual({
      number: { colour: "grey" },
      price: { colour: "green", difference: 0n },
      total: { colour: "grey" },
    });
  });

  it("Not bought: Number orange 100, Price grey, Total orange Left 520 000 (decided item 5)", () => {
    expect(orderColours(order([], "NOT_BOUGHT"))).toEqual({
      number: { colour: "amber", difference: "100" },
      price: { colour: "grey" },
      total: { colour: "amber", difference: 520_000n },
    });
  });
});

describe("which orders have colours (decided item 5)", () => {
  it.each<RequestStatus>([
    "DRAFT",
    "PENDING_HEAD",
    "PENDING_PRINCIPAL",
    "PENDING_FINANCE",
    "RETURNED",
    "REJECTED",
    "CANCELLED",
  ])("%s has none", (status) => {
    expect(orderColours(order([], "OPEN", NOTEBOOKS, status))).toBeNull();
  });

  it.each<RequestStatus>(["PURCHASING", "SETTLEMENT", "CLOSED"])("%s has them", (status) => {
    expect(
      orderColours(order([record("100", 5_000n, [20_000n])], "DONE", NOTEBOOKS, status)),
    ).not.toBeNull();
  });

  it("a broken record throws, from the functions of purchases.ts", () => {
    expect(() => orderColours(order([record("1e2", 5_000n)]))).toThrow(RangeError);
  });
});

describe("a set of orders (08 The three colours, bullet 2; decided items 2 and 4)", () => {
  const exact = order([record("100", 5_000n, [20_000n])]);
  const cheaper = order([record("100", 4_500n, [20_000n])]);
  const dearer = order([record("100", 5_200n, [30_000n])]);
  const fewer = order([record("90", 5_000n, [20_000n])], "DONE_SHORT");
  const over = order([record("110", 5_000n, [20_000n])]);
  const buying = order([record("50", 5_000n)], "OPEN");

  it("orange beats green, for Number and for Price", () => {
    expect(setColours([exact, fewer])?.number).toEqual({ colour: "amber", orders: 1 });
    expect(setColours([exact, cheaper])?.price).toEqual({ colour: "amber", orders: 1 });
  });

  it("red beats orange and green, for Number and for Price", () => {
    expect(setColours([exact, fewer, over])?.number).toEqual({ colour: "red", orders: 1 });
    expect(setColours([exact, cheaper, dearer])?.price).toEqual({ colour: "red", orders: 1 });
  });

  it("all green counts every order", () => {
    expect(setColours([exact, exact])).toEqual({
      number: { colour: "green", orders: 2 },
      price: { colour: "green", orders: 2 },
      total: { colour: "green", difference: 0n },
    });
  });

  it("Total from the summed difference: +50 000 and −30 000 give orange 20 000", () => {
    expect(setColours([cheaper, dearer])?.total).toEqual({ colour: "amber", difference: 20_000n });
  });

  it("over plan beside an order still buying: Number red, Total grey", () => {
    expect(setColours([over, buying])).toEqual({
      number: { colour: "red", orders: 1 },
      price: { colour: "green", orders: 2 },
      total: { colour: "grey" },
    });
  });

  it("only orders still buying with nothing bought: all grey", () => {
    expect(setColours([order([], "OPEN"), order([], "OPEN")])).toEqual({
      number: { colour: "grey" },
      price: { colour: "grey" },
      total: { colour: "grey" },
    });
  });

  it("an order before Open is left out of the set and of its summed difference", () => {
    const sentBack = order([], "OPEN", NOTEBOOKS, "RETURNED");
    expect(setColours([cheaper, sentBack])).toEqual({
      number: { colour: "green", orders: 1 },
      price: { colour: "amber", orders: 1 },
      total: { colour: "amber", difference: 50_000n },
    });
  });

  it("no order from Open on: no colours", () => {
    expect(setColours([order([], "OPEN", NOTEBOOKS, "PENDING_HEAD")])).toBeNull();
    expect(setColours([])).toBeNull();
  });
});

describe("how an order ended against its plan (10 Analytics, Head, Plan vs actual; plan of 6.4, items 3 and 4)", () => {
  it("is the Total colour with the planned and actual totals (08 Worked example: Dearer)", () => {
    // 100 × 5 200 + 30 000 = 550 000 against 520 000: −30 000, red.
    expect(orderOutcome(order([record("100", 5_200n, [30_000n])]))).toEqual({
      colour: "red",
      planned: 520_000n,
      actual: 550_000n,
      difference: -30_000n,
    });
  });

  it("is orange with the money left (08 Worked example: Cheaper) and green at an exact total", () => {
    expect(orderOutcome(order([record("100", 4_500n, [20_000n])]))).toMatchObject({
      colour: "amber",
      difference: 50_000n,
    });
    expect(orderOutcome(order([record("100", 5_000n, [20_000n])]))).toMatchObject({
      colour: "green",
      difference: 0n,
    });
  });

  it("counts Done short as ended (08 Worked example: Fewer)", () => {
    expect(orderOutcome(order([record("90", 5_000n, [20_000n])], "DONE_SHORT"))).toMatchObject({
      colour: "amber",
      actual: 470_000n,
      difference: 50_000n,
    });
  });

  it("is none while buying is Open, though the records would give a colour", () => {
    expect(orderOutcome(order([record("100", 5_200n, [30_000n])], "OPEN"))).toBeNull();
  });

  it("leaves a Not bought order out, where orderColours() gives orange (decided item 4)", () => {
    const notBought = order([], "NOT_BOUGHT");
    expect(orderColours(notBought)?.total).toMatchObject({ colour: "amber" });
    expect(orderOutcome(notBought)).toBeNull();
  });

  it("is none before Open, though buying reads Done", () => {
    expect(
      orderOutcome(order([record("100", 5_200n)], "DONE", NOTEBOOKS, "PENDING_FINANCE")),
    ).toBeNull();
  });
});

describe("plan beside actual, and the three effects (08 Numbers the system calculates; The three colours; redesign of 22.10.2026)", () => {
  /** The effects split 08's Difference exactly: planned total − actual total. */
  function addsUp(table: PlanVsActual | null): PlanVsActual {
    expect(table).not.toBeNull();
    const { effects, total } = table!;
    expect(total.difference).toBe(total.planned - total.actual);
    expect(effects.quantity + effects.price + effects.extras).toBe(total.difference);
    return table!;
  }

  it("the owner's row: 20 × 2 500 planned, 30 bought for 60 000: quantity −25 000, price +15 000, total −10 000", () => {
    const plan: OrderPlan = { quantity: "20", price: 2_500n, extras: [], paymentType: "CASH" };
    const table = addsUp(planVsActual(order([record("30", 2_000n)], "DONE", plan)));
    expect(table).toEqual({
      quantity: { planned: "20", actual: "30" },
      unitPrice: { planned: 2_500n, actual: 2_000n, difference: 500n, oneUnitPrice: true },
      extras: { planned: 0n, actual: 0n },
      total: { planned: 50_000n, actual: 60_000n, difference: -10_000n },
      effects: { quantity: -25_000n, price: 15_000n, extras: 0n },
    });
    // The price effect is the Price label's amount, and the sum the Total label's.
    const colours = orderColours(order([record("30", 2_000n)], "DONE", plan))!;
    expect(colours.price).toEqual({ colour: "amber", difference: table.effects.price });
    expect(colours.total).toEqual({ colour: "red", difference: -10_000n });
  });

  it("08 Worked example, Dearer: 100 × 5 200 + 30 000: price −20 000, extras −10 000", () => {
    const table = addsUp(planVsActual(order([record("100", 5_200n, [30_000n])])));
    expect(table.effects).toEqual({ quantity: 0n, price: -20_000n, extras: -10_000n });
    // 200 dearer per unit: below 0.
    expect(table.unitPrice.difference).toBe(-200n);
    expect(table.extras).toEqual({ planned: 20_000n, actual: 30_000n });
  });

  it("08 Worked example, Fewer: 90 × 5 000: quantity +50 000, price 0", () => {
    const table = addsUp(planVsActual(order([record("90", 5_000n, [20_000n])], "DONE_SHORT")));
    expect(table.effects).toEqual({ quantity: 50_000n, price: 0n, extras: 0n });
  });

  it("two prices: the actual price is the average, half up, and not one price", () => {
    const plan: OrderPlan = { quantity: "3", price: 1_000n, extras: [], paymentType: "CASH" };
    const table = addsUp(
      planVsActual(order([record("1", 900n), record("2", 1_001n)], "DONE", plan)),
    );
    // (900 + 2 002) ÷ 3 = 967.33 → 967.
    expect(table.unitPrice).toEqual({
      planned: 1_000n,
      actual: 967n,
      difference: 33n,
      oneUnitPrice: false,
    });
    expect(table.effects.price).toBe(98n);
  });

  it("a quantity with decimals rounds at the planned price half up, and still adds up", () => {
    const plan: OrderPlan = { quantity: "1.5", price: 3n, extras: [], paymentType: "CASH" };
    // Planned goods round(4.5) = 5; 2.5 at the planned 3 is round(7.5) = 8; bought for 5.
    const table = addsUp(planVsActual(order([record("2.5", 2n)], "DONE", plan)));
    expect(table.effects).toEqual({ quantity: -3n, price: 3n, extras: 0n });
  });

  it("a cancelled record is left out of every column", () => {
    const records = [record("50", 9_000n, [5_000n], true), record("100", 5_000n, [20_000n])];
    const table = addsUp(planVsActual(order(records)));
    expect(table.quantity.actual).toBe("100");
    expect(table.effects).toEqual({ quantity: 0n, price: 0n, extras: 0n });
  });

  it("while buying is Open it shows what is bought so far", () => {
    const table = addsUp(planVsActual(order([record("40", 5_000n)], "OPEN")));
    expect(table.quantity).toEqual({ planned: "100", actual: "40" });
  });

  it("two prices that cancel out: the same price per unit on average, 0 apart", () => {
    const plan: OrderPlan = { quantity: "2", price: 1_000n, extras: [], paymentType: "CASH" };
    const table = addsUp(
      planVsActual(order([record("1", 900n), record("1", 1_100n)], "DONE", plan)),
    );
    expect(table.unitPrice).toMatchObject({ actual: 1_000n, difference: 0n, oneUnitPrice: false });
  });

  it("nothing bought, or before Open: no table", () => {
    expect(planVsActual(order([], "OPEN"))).toBeNull();
    expect(planVsActual(order([record("100", 5_000n, [], true)], "OPEN"))).toBeNull();
    expect(
      planVsActual(order([record("100", 5_000n)], "DONE", NOTEBOOKS, "PENDING_FINANCE")),
    ).toBeNull();
  });
});
