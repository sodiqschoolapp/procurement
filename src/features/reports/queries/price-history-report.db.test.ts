import { describe, expect, it } from "vitest";

import { AuthorizationError } from "@/server/authorize";

import {
  type SpendingScene,
  bought,
  recordOn,
  refreshNow,
  spendingScene,
} from "../../../../tests/helpers/analytics";
import { setClock } from "../../../../tests/helpers/clock";
import { insertOrder } from "../../../../tests/helpers/orders";
import { headPrice } from "../../../../tests/helpers/reports";
import { insertUser } from "../../../../tests/helpers/users";
import { NO_ANALYTICS_FILTERS } from "../../analytics/period-params";

import { getPriceHistoryReport } from "./price-history-report";

// The Price history report (build-plan 6.9b, Done when: "the branch wall on each of the three
// reports"; 10-notifications-analytics-reports.md, Reports: "How the price of one product changed
// over time, as a chart"; 04-catalogs.md rule 4, Price memory; plan of 6.9b, decided items 5 to
// 8; review of the plan, correction 2). Each scene is two branches sharing one category, read
// with that category, so no other test's records come in.

const OCTOBER = { first: "2031-10-01", last: "2031-10-15" };

async function twoBranches() {
  setClock("2031-10-15T05:00:00Z");
  const a = await spendingScene();
  const b = await spendingScene();
  const principal = await insertUser("PRINCIPAL", { branches: [a.branch.id] });
  const head = await insertUser("HEAD");
  const params = (variant: string | null, branch: string | null = null) => ({
    range: OCTOBER,
    filters: { ...NO_ANALYTICS_FILTERS, branch, category: a.category.id },
    variant,
  });
  return { a, b, principal, head, params };
}

/** A record of the subtype in the scene's branch, on an order of its own. */
async function boughtAgain(
  scene: SpendingScene,
  variantId: string,
  purchasedOn: string,
  unitPrice: string,
) {
  const order = await insertOrder({
    branchId: scene.branch.id,
    ownerId: scene.manager.id,
    departmentId: scene.department.id,
    variantId,
    status: "PURCHASING",
  });
  await recordOn(
    scene,
    { id: order.id, ownerId: scene.manager.id, variantId },
    { purchasedOn, unitPrice },
  );
  return order.id;
}

describe("Price history: the branch wall (03 rule 1; 10 Reports: respects the user's branches)", () => {
  it("shows a Principal only the records of their branch, and refuses another branch's filter", async () => {
    const { a, b, principal, head, params } = await twoBranches();
    const first = await bought(a, { purchasedOn: "2031-10-03", unitPrice: "1000" });
    await boughtAgain(a, first.variantId, "2031-10-08", "1200");
    // The same subtype bought in the other branch, in the dates and the category.
    await boughtAgain(b, first.variantId, "2031-10-05", "9000");
    await refreshNow();

    const report = await getPriceHistoryReport(principal.id, params(first.variantId), "all");
    expect(report.subtype?.variantId).toBe(first.variantId);
    expect(report.points.map((row) => [row.purchasedOn, row.unitPrice])).toEqual([
      ["2031-10-03", 1_000n],
      ["2031-10-08", 1_200n],
    ]);
    expect(report.recordCount).toBe(2);

    // The Head sees every branch, oldest first.
    const all = await getPriceHistoryReport(head.id, params(first.variantId), "all");
    expect(all.points.map((row) => row.unitPrice)).toEqual([1_000n, 9_000n, 1_200n]);

    await expect(
      getPriceHistoryReport(principal.id, params(first.variantId, b.branch.id), "all"),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("picks the default subtype inside the wall: the most bought in the user's branches (review, correction 2)", async () => {
    const { a, b, principal, head, params } = await twoBranches();
    // X: two records in A. Y: one in A and three in B, so four in all.
    const x = await bought(a, { purchasedOn: "2031-10-02", unitPrice: "500" });
    await boughtAgain(a, x.variantId, "2031-10-04", "520");
    const y = await bought(a, { purchasedOn: "2031-10-03", unitPrice: "700" });
    for (const day of ["2031-10-05", "2031-10-06", "2031-10-07"]) {
      await boughtAgain(b, y.variantId, day, "750");
    }
    await refreshNow();

    expect((await getPriceHistoryReport(principal.id, params(null), 1)).subtype?.variantId).toBe(
      x.variantId,
    );
    expect((await getPriceHistoryReport(head.id, params(null), 1)).subtype?.variantId).toBe(
      y.variantId,
    );
  });
});

describe("Price history: the records and the reference prices (04 rule 4; decided items 5 to 8)", () => {
  it("leaves out a gift and the records outside the dates, and pages the records but not the chart", async () => {
    const { a, principal, params } = await twoBranches();
    const first = await bought(a, { purchasedOn: "2031-10-02", unitPrice: "1000" });
    // A gift at 0 is no price (6.4b decided item 1).
    await boughtAgain(a, first.variantId, "2031-10-03", "0");
    // Before the dates.
    await boughtAgain(a, first.variantId, "2031-09-30", "800");
    for (let day = 4; day <= 14; day += 1) {
      for (const price of ["1100", "1150", "1175"]) {
        await boughtAgain(a, first.variantId, `2031-10-${String(day).padStart(2, "0")}`, price);
      }
    }
    await refreshNow();

    const page = await getPriceHistoryReport(principal.id, params(first.variantId), 2);
    // 1 + 33 records in the dates: two pages of 25.
    expect([page.recordCount, page.pages, page.page, page.records.length]).toEqual([34, 2, 2, 9]);
    expect(page.points).toHaveLength(34);
    expect(page.points.some((row) => row.unitPrice === 0n || row.unitPrice === 800n)).toBe(false);
  });

  it("lists the reference price in force on the first day and those set in the dates, by created_at then seq", async () => {
    const { a, principal, head, params } = await twoBranches();
    const first = await bought(a, { purchasedOn: "2031-10-02", unitPrice: "1000" });
    await refreshNow();
    // Two prices before the dates: the later one is in force on 1 October (00:00 in Tashkent is
    // 30 September 19:00 UTC).
    await headPrice(first.variantId, head.id, { price: 900n, at: "2031-09-10T05:00:00Z" });
    const inForce = await headPrice(first.variantId, head.id, {
      price: 950n,
      at: "2031-09-30T18:59:00Z",
    });
    // Set in the dates, the second on the same moment as the first: seq decides.
    const set = await headPrice(first.variantId, head.id, {
      price: 1_050n,
      at: "2031-09-30T19:00:00Z",
      note: "Yangi narx",
    });
    const same = await headPrice(first.variantId, head.id, {
      price: 1_100n,
      at: "2031-09-30T19:00:00Z",
    });
    // After the dates.
    await headPrice(first.variantId, head.id, { price: 1_200n, at: "2031-10-16T05:00:00Z" });

    const report = await getPriceHistoryReport(principal.id, params(first.variantId), 1);
    expect(report.references.map((row) => [row.id, row.price, row.setOn, row.inForce])).toEqual([
      [inForce, 950n, "2031-09-30", true],
      [set, 1_050n, "2031-10-01", false],
      [same, 1_100n, "2031-10-01", false],
    ]);
    expect(report.references[1]!.note).toBe("Yangi narx");
  });

  it("shows a subtype with no record in the dates by its reference prices alone", async () => {
    const { a, principal, head, params } = await twoBranches();
    const first = await bought(a, { purchasedOn: "2031-09-02", unitPrice: "1000" });
    await refreshNow();
    await headPrice(first.variantId, head.id, { price: 990n, at: "2031-10-05T05:00:00Z" });
    const report = await getPriceHistoryReport(principal.id, params(first.variantId), 1);
    expect(report.subtype?.variantId).toBe(first.variantId);
    expect(report.points).toEqual([]);
    expect(report.references.map((row) => row.price)).toEqual([990n]);
  });
});
