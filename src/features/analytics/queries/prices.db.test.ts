import { describe, expect, it } from "vitest";

import { unitPriceOf } from "@/domain/purchases";

import {
  type SpendingScene,
  bought,
  recordOn,
  refreshNow,
  spendingScene,
} from "../../../../tests/helpers/analytics";
import { insertCompany } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertUser } from "../../../../tests/helpers/users";
import { type AnalyticsFilters, NO_ANALYTICS_FILTERS, type PeriodInput } from "../period-params";

import { getPriceChoices, getPrices } from "./prices";
import { getSpendingRecords } from "./spending-records";

// The Head's Prices block and its drill-down (build-plan 6.4b; 10-notifications-analytics-
// reports.md, Analytics page per role, Head, Prices: "Price trend of any product; biggest price
// rises in the last 90 days; the same product bought at different prices by different branches or
// suppliers", points 1 to 3; plan of 6.4b, decided items 1 to 5 and 12; review of the plan,
// correction 1 and decisions 3 and 4 worked through). 15 October 2031 in Tashkent: this month is
// October. Each test reads its own scene's category, as the summary holds every branch of the
// file's database.

const THIS_MONTH: PeriodInput = { choice: "this_month", from: null, to: null };

const only = (scene: SpendingScene): AnalyticsFilters => ({
  ...NO_ANALYTICS_FILTERS,
  category: scene.category.id,
});

/** A subtype bought once by the scene, then `more` records of it. */
async function subtype(
  scene: SpendingScene,
  first: { purchasedOn: string; qty?: string; unitPrice: string; supplierId?: string | null },
  more: { purchasedOn: string; qty?: string; unitPrice: string; supplierId?: string | null }[] = [],
) {
  const order = await bought(scene, first);
  const records = [order.purchaseId];
  for (const row of more) {
    records.push(
      (
        await recordOn(
          scene,
          { id: order.orderId, ownerId: order.ownerId, variantId: order.variantId },
          row,
        )
      ).purchaseId,
    );
  }
  return { ...order, records };
}

describe("the price trend (10 Head, Prices; decided items 1 and 3)", () => {
  it("the review's example: September 2 × 5 000, October 6 500 and 5 500 gives 6 000, +1 000, +20.0 %", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    const item = await subtype(scene, { purchasedOn: "2031-09-10", qty: "2", unitPrice: "5000" }, [
      { purchasedOn: "2031-10-02", unitPrice: "6500" },
      { purchasedOn: "2031-10-09", unitPrice: "5500" },
      // A gift is no price (3.10 decided item 4): it leaves the point as it is.
      { purchasedOn: "2031-10-09", qty: "5", unitPrice: "0" },
    ]);
    await refreshNow();

    const prices = await getPrices(head.id, THIS_MONTH, only(scene), item.variantId);
    expect(prices.trend).toMatchObject({ variantId: item.variantId });
    expect(prices.trend!.points).toEqual([
      {
        month: "2031-10",
        price: 6000n,
        count: 2,
        change: { difference: 1000n, percent: "20.0" },
      },
    ]);

    // The point equals unitPriceOf() of its drill-down rows (10 point 3).
    const list = await getSpendingRecords(
      head.id,
      THIS_MONTH,
      only(scene),
      { kind: "price", variant: item.variantId, month: "2031-10", noSupplier: false },
      "all",
    );
    expect(list.rows).toHaveLength(2);
    expect(list.price).toMatchObject({ qty: "2.000", price: 6000n });
    const goods = list.rows.reduce((sum, row) => sum + row.unitPrice, 0n);
    expect(unitPriceOf(goods, "2")).toBe(prices.trend!.points[0]!.price);
  });

  it("the point of the month holding today is against the same days of September (10 point 1; D55 item 10)", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    // 15 September is the last of the same days; 20 September is after them: left out.
    const item = await subtype(scene, { purchasedOn: "2031-09-15", unitPrice: "5000" }, [
      { purchasedOn: "2031-09-20", unitPrice: "9000" },
      { purchasedOn: "2031-10-02", unitPrice: "6000" },
    ]);
    await refreshNow();

    const prices = await getPrices(head.id, THIS_MONTH, only(scene), item.variantId);
    // 6 000 against 5 000, not against September's whole 7 000.
    expect(prices.trend!.points).toEqual([
      { month: "2031-10", price: 6000n, count: 1, change: { difference: 1000n, percent: "20.0" } },
    ]);
  });

  it("weighs each record by its quantity: 1 × 4 000 and 3 × 6 000 is 5 500, not 5 000", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    const item = await subtype(scene, { purchasedOn: "2031-10-02", qty: "1", unitPrice: "4000" }, [
      { purchasedOn: "2031-10-03", qty: "3", unitPrice: "6000" },
    ]);
    await refreshNow();
    const prices = await getPrices(head.id, THIS_MONTH, only(scene), item.variantId);
    expect(prices.trend!.points[0]).toMatchObject({ price: 5500n, change: null });
  });

  it("with no subtype chosen, shows the one with the most records in the period", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    await subtype(scene, { purchasedOn: "2031-10-02", unitPrice: "4000" });
    const most = await subtype(scene, { purchasedOn: "2031-10-02", unitPrice: "4000" }, [
      { purchasedOn: "2031-10-03", unitPrice: "4100" },
    ]);
    await refreshNow();
    const prices = await getPrices(head.id, THIS_MONTH, only(scene), null);
    expect(prices.trend?.variantId).toBe(most.variantId);
    // The choices hold every priced subtype of the user's branches.
    const choices = await getPriceChoices(head.id);
    expect(choices.map((choice) => choice.variantId)).toContain(most.variantId);
  });
});

describe("the biggest price rises of the last 90 days (decided item 4)", () => {
  it("the review's example: 5 000 before the window, 5 500 and 6 000 in it is +1 000, +20.0 %", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    // Day −120, day −60 and day −5 of 15 October.
    const item = await subtype(scene, { purchasedOn: "2031-06-17", unitPrice: "5000" }, [
      { purchasedOn: "2031-08-16", unitPrice: "5500" },
      { purchasedOn: "2031-10-10", unitPrice: "6000" },
    ]);
    await refreshNow();
    const { rises, riseWindow } = await getPrices(head.id, THIS_MONTH, only(scene), null);
    expect(riseWindow).toEqual({ first: "2031-07-18", last: "2031-10-15" });
    expect(rises).toEqual([
      expect.objectContaining({
        variantId: item.variantId,
        earlier: { price: 5000n, purchasedOn: "2031-06-17" },
        newest: { price: 6000n, purchasedOn: "2031-10-10" },
        rise: { difference: 1000n, percent: "20.0" },
      }),
    ]);
  });

  it("with no record before the window, rises from the oldest in it: 5 500 → 6 000 is +9.1 %", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    await subtype(scene, { purchasedOn: "2031-08-16", unitPrice: "5500" }, [
      { purchasedOn: "2031-10-10", unitPrice: "6000" },
    ]);
    // A single record in the window with none before: no rise.
    await subtype(scene, { purchasedOn: "2031-10-10", unitPrice: "9000" });
    // A fall is no rise.
    await subtype(scene, { purchasedOn: "2031-09-01", unitPrice: "7000" }, [
      { purchasedOn: "2031-10-01", unitPrice: "6000" },
    ]);
    // Bought only before the window: nothing in the last 90 days.
    await subtype(scene, { purchasedOn: "2031-05-01", unitPrice: "1000" }, [
      { purchasedOn: "2031-06-01", unitPrice: "2000" },
    ]);
    await refreshNow();
    const { rises } = await getPrices(head.id, THIS_MONTH, only(scene), null);
    expect(rises.map((rise) => rise.rise)).toEqual([{ difference: 500n, percent: "9.1" }]);
  });

  it("ranks by percent, ties by so'm", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    const small = await subtype(scene, { purchasedOn: "2031-09-01", unitPrice: "1000" }, [
      { purchasedOn: "2031-10-01", unitPrice: "1100" },
    ]);
    const big = await subtype(scene, { purchasedOn: "2031-09-01", unitPrice: "10000" }, [
      { purchasedOn: "2031-10-01", unitPrice: "11000" },
    ]);
    const steep = await subtype(scene, { purchasedOn: "2031-09-01", unitPrice: "1000" }, [
      { purchasedOn: "2031-10-01", unitPrice: "1500" },
    ]);
    await refreshNow();
    const { rises } = await getPrices(head.id, THIS_MONTH, only(scene), null);
    expect(rises.map((rise) => rise.variantId)).toEqual([
      steep.variantId,
      big.variantId,
      small.variantId,
    ]);
  });
});

describe("a rise is between two trip dates (D61, a change to decided item 4; live test, issue 6)", () => {
  /** Two records of one subtype, the second entered an hour later, as in the live test. */
  async function twoRecords(scene: SpendingScene, firstOn: string, secondOn: string) {
    const order = await bought(scene, { purchasedOn: firstOn, unitPrice: "3500" });
    // The helpers enter every record at one moment; the live 4 000 was entered after the 3 500.
    await recordOn(
      scene,
      { id: order.orderId, ownerId: order.ownerId, variantId: order.variantId },
      { purchasedOn: secondOn, unitPrice: "4000", createdAt: "2031-05-02T06:00:00Z" },
    );
    return order;
  }

  it("two purchases of one subtype on the same date at 3 500 and 4 000 are no rise; on two dates they are +500, +14.3 %", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    // One shop visit, two prices: those differences show under "different prices", not as a rise.
    await twoRecords(scene, "2031-10-10", "2031-10-10");
    // The same two prices on two trip dates: a rise.
    const twoDates = await twoRecords(scene, "2031-10-01", "2031-10-10");
    await refreshNow();
    const { rises } = await getPrices(head.id, THIS_MONTH, only(scene), null);
    expect(rises).toEqual([
      expect.objectContaining({
        variantId: twoDates.variantId,
        earlier: { price: 3500n, purchasedOn: "2031-10-01" },
        newest: { price: 4000n, purchasedOn: "2031-10-10" },
        rise: { difference: 500n, percent: "14.3" },
      }),
    ]);
  });
});

describe("the same product at different prices (decided item 5)", () => {
  it("names the cheapest and dearest branch-and-supplier pairs; one price leaves it out", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const second = await spendingScene();
    const head = await insertUser("HEAD");
    const other = await insertCompany();
    const item = await subtype(scene, { purchasedOn: "2031-10-02", unitPrice: "5000" }, [
      { purchasedOn: "2031-10-03", unitPrice: "6000", supplierId: other.id },
      { purchasedOn: "2031-10-03", unitPrice: "5500", supplierId: null },
    ]);
    // The same subtype bought by another branch, in the scene's category.
    await recordOn(
      second,
      {
        id: (await bought(second, { purchasedOn: "2031-10-01", categoryId: scene.category.id }))
          .orderId,
        ownerId: second.manager.id,
        variantId: item.variantId,
      },
      { purchasedOn: "2031-10-04", unitPrice: "4500" },
    );
    // One price everywhere: no spread.
    await subtype(scene, { purchasedOn: "2031-10-02", unitPrice: "5000" }, [
      { purchasedOn: "2031-10-03", unitPrice: "5000", supplierId: other.id },
    ]);
    await refreshNow();
    const { spreads } = await getPrices(head.id, THIS_MONTH, only(scene), null);
    const spread = spreads.find((row) => row.variantId === item.variantId)!;
    expect(spread.cheapest).toMatchObject({ branchId: second.branch.id, price: 4500n });
    expect(spread.dearest).toMatchObject({
      branchId: scene.branch.id,
      supplierId: other.id,
      price: 6000n,
    });
    expect(spread.spread).toEqual({ difference: 1500n, percent: "33.3" });
    // The 10 000 record of `second`'s own order is another subtype: one row each.
    expect(spreads.filter((row) => row.variantId === item.variantId)).toHaveLength(1);
    expect(spreads.every((row) => row.cheapest.price !== row.dearest.price)).toBe(true);

    // The records with no supplier are a pair of their own and have their own drill-down.
    const none = await getSpendingRecords(
      head.id,
      THIS_MONTH,
      { ...only(scene), branch: scene.branch.id },
      { kind: "price", variant: item.variantId, month: null, noSupplier: true },
      "all",
    );
    expect(none.rows.map((row) => row.unitPrice)).toEqual([5500n]);
  });
});

describe("the branch wall (03 rule 1; D40)", () => {
  it("a Manager's trend, rises and spread never count another branch's records beside his", async () => {
    setClock("2031-10-15T05:00:00Z");
    const scene = await spendingScene();
    const second = await spendingScene();
    const item = await subtype(scene, { purchasedOn: "2031-09-01", unitPrice: "5000" }, [
      { purchasedOn: "2031-10-02", unitPrice: "5000" },
    ]);
    // Another branch's records of the same subtype and category: a rise and a spread if counted.
    const theirs = await bought(second, {
      purchasedOn: "2031-10-01",
      categoryId: scene.category.id,
    });
    await recordOn(
      second,
      { id: theirs.orderId, ownerId: second.manager.id, variantId: item.variantId },
      { purchasedOn: "2031-10-03", unitPrice: "9000" },
    );
    await refreshNow();
    const prices = await getPrices(scene.manager.id, THIS_MONTH, only(scene), item.variantId);
    expect(prices.trend!.points[0]).toMatchObject({ price: 5000n, count: 1 });
    expect(prices.rises).toEqual([]);
    expect(prices.spreads).toEqual([]);
    const choices = await getPriceChoices(scene.manager.id);
    expect(choices.map((choice) => choice.variantId)).not.toContain(theirs.variantId);
  });
});
