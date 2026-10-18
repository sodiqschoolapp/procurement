import { describe, expect, it } from "vitest";

import { AuthorizationError } from "@/server/authorize";

import {
  type SpendingScene,
  bought,
  refreshNow,
  spendingScene,
} from "../../../../tests/helpers/analytics";
import { insertCategory, insertCompany } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertDepartment } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import {
  type AnalyticsFilters,
  type DrillKey,
  NO_ANALYTICS_FILTERS,
  type PeriodInput,
  RECORDS_PAGE_SIZE,
} from "../period-params";
import { PeriodRefusedError } from "../resolve-period";

import { getSpending } from "./spending";
import { getSpendingRecords } from "./spending-records";

// The Spending block and its drill-down (build-plan 6.3, Done when: "a number equals the sum of the
// rows in its drill-down list; no filter returns rows of another branch"; 10-notifications-
// analytics-reports.md, Analytics page per role, points 1 to 3; 03 rule 1; plan of 6.3, decided
// items 3, 5, 10 and 16 and the review's corrections 2 and 3). The tests of this file share one
// database and the summary holds every branch: each reads its own branches. 15 October 2031 in
// Tashkent: this month is October, the period before September.

const AT = "2031-10-15T05:00:00Z";
const THIS_MONTH: PeriodInput = { choice: "this_month", from: null, to: null };
const QUARTER: PeriodInput = { choice: "this_quarter", from: null, to: null };

/** Every row of every page of a drill-down, and its total and count. */
async function wholeList(
  userId: string,
  input: PeriodInput,
  filters: AnalyticsFilters,
  key: DrillKey,
) {
  const rows = [];
  for (let page = 1; ; page += 1) {
    const list = await getSpendingRecords(userId, input, filters, key, page);
    rows.push(...list.rows);
    if (list.rows.length < RECORDS_PAGE_SIZE) return { rows, total: list.total, count: list.count };
  }
}

const sumOf = (rows: readonly { amount: bigint }[]) =>
  rows.reduce((sum, row) => sum + row.amount, 0n);

describe("a number equals the sum of the rows of its drill-down list (Done when 1; 10 point 3)", () => {
  it("the period total, a month and a category, over every page of the list", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    const other = await insertCategory();
    // 55 records over two pages: 2.5 × 3 333 + 1 000 = 9 333 each, rounded each on its own (08).
    for (let at = 0; at < 55; at += 1) {
      await bought(scene, {
        purchasedOn: `2031-${at % 2 ? "10" : "11"}-0${(at % 9) + 1}`,
        qty: "2.500",
        unitPrice: "3333",
        extras: [1_000n],
        categoryId: at % 3 ? scene.category.id : other.id,
      });
    }
    await refreshNow();
    const filters = { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id };

    const block = await getSpending(head.id, QUARTER, filters);
    const all = await wholeList(head.id, QUARTER, filters, { kind: "period" });
    expect(all.rows).toHaveLength(55);
    expect(all.count).toBe(55);
    expect(sumOf(all.rows)).toBe(all.total);
    expect(block.total.amount).toBe(all.total);
    expect(block.total.amount).toBe(55n * 9_333n);
    // The rows are each one record, none twice across the pages.
    expect(new Set(all.rows.map((row) => row.purchaseId)).size).toBe(55);

    for (const point of block.months) {
      const list = await wholeList(head.id, QUARTER, filters, {
        kind: "month",
        month: point.month,
      });
      expect(sumOf(list.rows), point.month).toBe(point.amount);
    }
    expect(block.months.map((point) => point.month)).toEqual(["2031-10", "2031-11", "2031-12"]);
    expect(block.months[2]!.amount).toBe(0n);

    for (const category of block.categories) {
      const list = await wholeList(head.id, QUARTER, filters, {
        kind: "category",
        category: category.id,
      });
      expect(sumOf(list.rows), category.name).toBe(category.amount);
    }
    expect(sumOf(block.categories)).toBe(block.total.amount);
  });
});

describe("every number's change against the period before (10 point 1; decided item 16)", () => {
  it("the total, a category and a month each against their own number before", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const principal = await insertUser("PRINCIPAL", { branches: [scene.branch.id] });
    const other = await insertCategory();
    await bought(scene, { purchasedOn: "2031-10-01", unitPrice: "150000" });
    await bought(scene, { purchasedOn: "2031-10-31", unitPrice: "20000", categoryId: other.id });
    await bought(scene, { purchasedOn: "2031-09-30", unitPrice: "100000" });
    await bought(scene, { purchasedOn: "2031-09-01", unitPrice: "40000", categoryId: other.id });
    // Kept out of both periods: August, and November.
    await bought(scene, { purchasedOn: "2031-08-31", unitPrice: "7000" });
    await bought(scene, { purchasedOn: "2031-11-01", unitPrice: "9000" });
    await refreshNow();

    const block = await getSpending(principal.id, THIS_MONTH, NO_ANALYTICS_FILTERS);
    expect(block.period).toMatchObject({ first: "2031-10-01", last: "2031-10-31" });
    expect(block.before).toMatchObject({ first: "2031-09-01", last: "2031-09-30" });
    expect(block.total).toEqual({
      amount: 170_000n,
      change: { difference: 30_000n, percent: "21.4" },
    });
    const byId = new Map(block.categories.map((category) => [category.id, category]));
    expect(byId.get(scene.category.id)).toMatchObject({
      amount: 150_000n,
      change: { difference: 50_000n, percent: "50.0" },
    });
    expect(byId.get(other.id)).toMatchObject({
      amount: 20_000n,
      change: { difference: -20_000n, percent: "-50.0" },
    });
    // The one month's point against the whole month before it.
    expect(block.months).toEqual([
      { month: "2031-10", amount: 170_000n, change: { difference: 30_000n, percent: "21.4" } },
    ]);
  });

  it("a later month's point against the month before it inside the period", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    await bought(scene, { purchasedOn: "2031-09-10", unitPrice: "1000" });
    await bought(scene, { purchasedOn: "2031-10-10", unitPrice: "4000" });
    await bought(scene, { purchasedOn: "2031-11-10", unitPrice: "3000" });
    await refreshNow();
    const block = await getSpending(head.id, QUARTER, {
      ...NO_ANALYTICS_FILTERS,
      branch: scene.branch.id,
    });
    expect(block.months.map((point) => [point.month, point.amount, point.change])).toEqual([
      ["2031-10", 4_000n, { difference: 3_000n, percent: "300.0" }],
      ["2031-11", 3_000n, { difference: -1_000n, percent: "-25.0" }],
      ["2031-12", 0n, { difference: -3_000n, percent: "-100.0" }],
    ]);
    // The quarter against July to September, which holds September's 1 000.
    expect(block.total.change).toEqual({ difference: 6_000n, percent: "600.0" });
  });

  it("custom dates of n days against the n days just before; a month's days inside the period", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    await bought(scene, { purchasedOn: "2031-09-24", unitPrice: "5000" });
    await bought(scene, { purchasedOn: "2031-09-25", unitPrice: "2000" });
    await bought(scene, { purchasedOn: "2031-10-03", unitPrice: "6000" });
    const custom: PeriodInput = { choice: "custom", from: "2031-09-25", to: "2031-10-04" };
    await refreshNow();
    const filters = { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id };
    const block = await getSpending(head.id, custom, filters);
    expect(block.before).toMatchObject({ first: "2031-09-15", last: "2031-09-24" });
    expect(block.total).toEqual({
      amount: 8_000n,
      change: { difference: 3_000n, percent: "60.0" },
    });
    // September's point counts its days from the 25th; its change is against all of August.
    expect(block.months[0]).toMatchObject({ month: "2031-09", amount: 2_000n });
    const september = await wholeList(head.id, custom, filters, {
      kind: "month",
      month: "2031-09",
    });
    expect(september.total).toBe(2_000n);
  });
});

/** Two branches with a record each in October, the other one in the same category and supplier. */
async function twoBranches() {
  setClock(AT);
  const mine = await spendingScene();
  const theirs: SpendingScene = {
    ...(await spendingScene()),
    category: mine.category,
    supplier: mine.supplier,
  };
  const kept = await bought(mine, { purchasedOn: "2031-10-05", unitPrice: "11000" });
  const away = await bought(theirs, { purchasedOn: "2031-10-05", unitPrice: "77000" });
  await refreshNow();
  return { mine, theirs, kept, away };
}

describe("no filter returns rows of another branch (Done when 2; 03 rule 1; D40)", () => {
  it("a Principal and a Finance user of one branch, for every filter alone and all together", async () => {
    const { mine, theirs, kept } = await twoBranches();
    const principal = await insertUser("PRINCIPAL", { branches: [mine.branch.id] });
    const finance = await insertUser("FINANCE", { branches: [mine.branch.id] });
    // The category and the supplier are the other branch's too: only the wall keeps its record out.
    const filterSets: AnalyticsFilters[] = [
      NO_ANALYTICS_FILTERS,
      { ...NO_ANALYTICS_FILTERS, category: mine.category.id },
      { ...NO_ANALYTICS_FILTERS, supplier: mine.supplier.id },
      {
        branch: null,
        category: mine.category.id,
        department: mine.department.id,
        manager: mine.manager.id,
        supplier: mine.supplier.id,
      },
    ];
    for (const user of [principal, finance]) {
      for (const filters of filterSets) {
        const block = await getSpending(user.id, THIS_MONTH, filters);
        const list = await getSpendingRecords(user.id, THIS_MONTH, filters, { kind: "period" }, 1);
        const ids = list.rows.map((row) => row.purchaseId);
        expect(
          ids.every((id) => id === kept.purchaseId),
          JSON.stringify(filters),
        ).toBe(true);
        expect(block.total.amount).toBe(list.total);
        expect([0n, 11_000n]).toContain(block.total.amount);
        for (const category of block.categories) expect(category.amount).toBeLessThan(77_000n);
      }
    }
    // The filters of the own branch keep its record.
    const own = await getSpending(principal.id, THIS_MONTH, filterSets[3]!);
    expect(own.total.amount).toBe(11_000n);
  });

  it("the Head sees both; the branch filter keeps to its branch", async () => {
    const { mine, theirs, kept, away } = await twoBranches();
    const head = await insertUser("HEAD");
    const both = await getSpendingRecords(
      head.id,
      THIS_MONTH,
      { ...NO_ANALYTICS_FILTERS, category: mine.category.id },
      { kind: "period" },
      "all",
    );
    expect(both.rows.map((row) => row.purchaseId).sort()).toEqual(
      [kept.purchaseId, away.purchaseId].sort(),
    );
    const one = await getSpending(head.id, THIS_MONTH, {
      ...NO_ANALYTICS_FILTERS,
      branch: theirs.branch.id,
    });
    expect(one.total.amount).toBe(77_000n);
  });

  it("another branch's department or Manager as a filter is Not found (permission review, Must fix 1)", async () => {
    const { mine, theirs } = await twoBranches();
    const principal = await insertUser("PRINCIPAL", { branches: [mine.branch.id] });
    const finance = await insertUser("FINANCE", { branches: [mine.branch.id] });
    for (const user of [principal, finance]) {
      for (const filters of [
        { ...NO_ANALYTICS_FILTERS, department: theirs.department.id },
        { ...NO_ANALYTICS_FILTERS, manager: theirs.manager.id },
      ]) {
        await expect(getSpending(user.id, THIS_MONTH, filters)).rejects.toEqual(
          new AuthorizationError("not_found"),
        );
        await expect(
          getSpendingRecords(user.id, THIS_MONTH, filters, { kind: "period" }, 1),
        ).rejects.toEqual(new AuthorizationError("not_found"));
      }
      // The own branch's department and Manager pass (D40).
      const own = await getSpending(user.id, THIS_MONTH, {
        ...NO_ANALYTICS_FILTERS,
        department: mine.department.id,
        manager: mine.manager.id,
      });
      expect(own.total.amount).toBe(11_000n);
    }
    // A Head user is no Manager filter, nor is an unknown department.
    const head = await insertUser("HEAD");
    await expect(
      getSpending(head.id, THIS_MONTH, { ...NO_ANALYTICS_FILTERS, manager: head.id }),
    ).rejects.toEqual(new AuthorizationError("not_found"));
    await expect(
      getSpending(head.id, THIS_MONTH, {
        ...NO_ANALYTICS_FILTERS,
        department: "0b6f3c1e-2a4d-4e5f-8a9b-1c2d3e4f5a6b",
      }),
    ).rejects.toEqual(new AuthorizationError("not_found"));
  });

  it("another branch's branch filter is Not found, for the number and its list", async () => {
    const { mine, theirs } = await twoBranches();
    const principal = await insertUser("PRINCIPAL", { branches: [mine.branch.id] });
    const filters = { ...NO_ANALYTICS_FILTERS, branch: theirs.branch.id };
    await expect(getSpending(principal.id, THIS_MONTH, filters)).rejects.toEqual(
      new AuthorizationError("not_found"),
    );
    await expect(
      getSpendingRecords(principal.id, THIS_MONTH, filters, { kind: "period" }, 1),
    ).rejects.toEqual(new AuthorizationError("not_found"));
  });

  it("a Manager sees the records of the own branches, a colleague's included", async () => {
    const { mine, kept } = await twoBranches();
    const colleague = await insertUser("MANAGER", { branches: [mine.branch.id] });
    const list = await getSpendingRecords(
      colleague.id,
      THIS_MONTH,
      NO_ANALYTICS_FILTERS,
      { kind: "period" },
      "all",
    );
    expect(list.rows.map((row) => row.purchaseId)).toEqual([kept.purchaseId]);
  });
});

describe("a drill-down key the period cannot name is refused (review correction 2)", () => {
  it("a month outside the period, a category beside another category filter, the school year unset", async () => {
    setClock(AT);
    const head = await insertUser("HEAD");
    const supplier = await insertCompany();
    const filters = { ...NO_ANALYTICS_FILTERS, supplier: supplier.id };
    await expect(
      getSpendingRecords(head.id, THIS_MONTH, filters, { kind: "month", month: "2031-09" }, 1),
    ).rejects.toBeInstanceOf(PeriodRefusedError);
    const [a, b] = [await insertCategory(), await insertCategory()];
    await expect(
      getSpendingRecords(
        head.id,
        THIS_MONTH,
        { ...filters, category: a.id },
        { kind: "category", category: b.id },
        1,
      ),
    ).rejects.toBeInstanceOf(PeriodRefusedError);
    await expect(
      getSpending(head.id, { choice: "school_year", from: null, to: null }, filters),
    ).rejects.toBeInstanceOf(PeriodRefusedError);
    // Not refused: an own department of a branch with no records is a number of 0.
    const department = await insertDepartment((await spendingScene()).branch.id);
    const empty = await getSpending(head.id, THIS_MONTH, { ...filters, department: department.id });
    expect(empty.total.amount).toBe(0n);
  });
});
