import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  type SpendingScene,
  bought,
  recordOn,
  refreshNow,
  spendingScene,
} from "../../../../tests/helpers/analytics";
import { insertProduct, insertSubtypes } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertUser } from "../../../../tests/helpers/users";
import {
  type AnalyticsFilters,
  NO_ANALYTICS_FILTERS,
  type PeriodInput,
  TOP_PRODUCTS,
} from "../period-params";

import { getSpendingRecords } from "./spending-records";
import { getTopProducts } from "./top-products";

// The Principal's "top 10 products" and its list (build-plan 6.5a; 10-notifications-analytics-
// reports.md, Analytics page per role, Principal, Spending, points 1 and 3; 08 Actual total; 07
// Substitution; plan of 6.5a, decided item 7, Look first). 15 October 2031 in Tashkent: this month
// is October, the period before September.

const THIS_MONTH: PeriodInput = { choice: "this_month", from: null, to: null };
const TODAY = "2031-10-15T05:00:00Z";

let scene: SpendingScene;
let principal: string;
let filters: AnalyticsFilters;

beforeEach(() => setClock(TODAY));

beforeAll(async () => {
  setClock(TODAY);
  scene = await spendingScene();
  principal = (await insertUser("PRINCIPAL", { branches: [scene.branch.id] })).id;
  filters = { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id };
});

describe("getTopProducts (10 Principal, Spending: 'top 10 products')", () => {
  it("adds every subtype of a product, keeps the 10 largest by amount then name, each against the period before", async () => {
    // Product P: 30 000 of its default subtype and 5 000 of a second subtype in October, 7 000 in
    // September; the second subtype is a substitution on P's own order (07 Substitution).
    const p = await bought(scene, { purchasedOn: "2031-10-03", unitPrice: "30000" });
    const [, second] = await insertSubtypes(p.productId, [{}, {}]);
    await recordOn(
      scene,
      { id: p.orderId, ownerId: p.ownerId, variantId: second! },
      { purchasedOn: "2031-10-04", unitPrice: "5000" },
    );
    await recordOn(
      scene,
      { id: p.orderId, ownerId: p.ownerId, variantId: p.variantId },
      {
        // Inside 1 to 15 September, the same days of this running month (D55 item 10).
        purchasedOn: "2031-09-10",
        unitPrice: "7000",
      },
    );
    // Ten more products of 10 000 each, the last of them by name dropping out of the ten.
    for (let index = 0; index < TOP_PRODUCTS; index += 1) {
      await bought(scene, { purchasedOn: "2031-10-05", unitPrice: "10000" });
    }
    // A product bought only in September is no top product of October.
    const september = await bought(scene, { purchasedOn: "2031-09-05", unitPrice: "90000" });
    // A cancelled record does not count (08 Actual total).
    await bought(scene, { purchasedOn: "2031-10-05", unitPrice: "80000", cancelled: true });
    await refreshNow();

    const top = await getTopProducts(principal, THIS_MONTH, filters);
    expect(top.products).toHaveLength(TOP_PRODUCTS);
    expect(top.products[0]).toMatchObject({
      id: p.productId,
      amount: 35_000n,
      change: { difference: 28_000n, percent: "400.0" },
    });
    expect(top.products.slice(1).every((row) => row.amount === 10_000n)).toBe(true);
    const names = top.products.slice(1).map((row) => row.name);
    expect(names).toEqual([...names].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0)));
    expect(top.products.map((row) => row.id)).not.toContain(september.productId);
    expect(top.total.amount).toBe(35_000n + 10n * 10_000n);
  });

  it("a product's list holds the records of all its subtypes in the period, its total the bar clicked (10 point 3)", async () => {
    const top = await getTopProducts(principal, THIS_MONTH, filters);
    const first = top.products[0]!;
    const list = await getSpendingRecords(
      principal,
      THIS_MONTH,
      filters,
      { kind: "product", product: first.id },
      "all",
    );
    expect(list.productName).toBe(first.name);
    expect(list.count).toBe(2);
    expect(list.total).toBe(first.amount);
  });

  it("a product that does not exist is refused", async () => {
    const lone = await insertProduct();
    await expect(
      getSpendingRecords(principal, THIS_MONTH, filters, { kind: "product", product: lone.id }, 1),
    ).resolves.toMatchObject({ count: 0 });
    await expect(
      getSpendingRecords(
        principal,
        THIS_MONTH,
        filters,
        { kind: "product", product: "00000000-0000-4000-8000-000000000000" },
        1,
      ),
    ).rejects.toThrow("Refused");
  });
});
