import { describe, expect, it } from "vitest";

import { getSpending } from "@/features/analytics/queries/spending";

import { bought, refreshNow, spendingScene } from "../../../../tests/helpers/analytics";
import { insertCategory, insertCompany } from "../../../../tests/helpers/catalog";
import { setClock } from "../../../../tests/helpers/clock";
import { insertDepartment } from "../../../../tests/helpers/orders";
import { insertUser } from "../../../../tests/helpers/users";
import { NO_ANALYTICS_FILTERS } from "../../analytics/period-params";

import { getSpendingReport } from "./spending-report";

// The Spending report (10-notifications-analytics-reports.md, Reports: "Totals by branch,
// category, department, supplier and month"; plan of 6.8, decided items 1 and 9). Read from
// `analytics_spending`, so the summary is refreshed first.

const AT = "2031-05-15T05:00:00Z";

describe("totals by branch, category, department, supplier and month (10 Reports, Spending)", () => {
  it("adds every table up to the same total, the records with no supplier on a line of their own", async () => {
    setClock(AT);
    const a = await spendingScene();
    const b = await spendingScene();
    const finance = await insertUser("FINANCE", { branches: [a.branch.id, b.branch.id] });
    const second = await insertDepartment(a.branch.id);
    const category = await insertCategory();
    const supplier = await insertCompany();
    // 30 April is the last Tashkent day of April, 1 May the first of May.
    await bought(a, { purchasedOn: "2031-04-30", unitPrice: "10000" });
    await bought(a, {
      purchasedOn: "2031-05-01",
      unitPrice: "20000",
      departmentId: second.id,
      categoryId: category.id,
      supplierId: supplier.id,
    });
    await bought(a, { purchasedOn: "2031-05-02", unitPrice: "5000", supplierId: null });
    await bought(b, { purchasedOn: "2031-05-03", unitPrice: "7000", extras: [500n] });
    // Outside the dates: in no table.
    await bought(a, { purchasedOn: "2031-03-31", unitPrice: "99000" });
    await refreshNow();

    const range = { first: "2031-04-01", last: "2031-05-15" };
    const report = await getSpendingReport(finance.id, { range, filters: NO_ANALYTICS_FILTERS });
    expect(report.total).toBe(42_500n);
    expect(report.records).toBe(4);
    for (const table of [
      report.branches,
      report.categories,
      report.departments,
      report.suppliers,
      report.months,
    ]) {
      expect(table.reduce((sum, line) => sum + line.amount, 0n)).toBe(report.total);
      expect(table.reduce((sum, line) => sum + line.records, 0)).toBe(report.records);
    }
    expect(report.months.map((line) => [line.id, line.amount])).toEqual([
      ["2031-04", 10_000n],
      ["2031-05", 32_500n],
    ]);
    expect(report.branches.map((line) => [line.id, line.amount])).toEqual([
      [a.branch.id, 35_000n],
      [b.branch.id, 7_500n],
    ]);
    // The records with no supplier: one line, last, with no id.
    expect(report.suppliers.at(-1)).toMatchObject({ id: null, name: null, amount: 5_000n });
    expect(report.suppliers.find((line) => line.id === supplier.id)?.amount).toBe(20_000n);
    expect(report.categories.find((line) => line.id === category.id)?.amount).toBe(20_000n);
    expect(report.departments.find((line) => line.id === second.id)?.amount).toBe(20_000n);
  });

  it("equals Analytics' Spending total for the same dates and filters (decided item 1)", async () => {
    setClock(AT);
    const scene = await spendingScene();
    const head = await insertUser("HEAD");
    await bought(scene, { purchasedOn: "2031-05-02", unitPrice: "12345", qty: "3.000" });
    await bought(scene, { purchasedOn: "2031-05-09", unitPrice: "1000", extras: [250n] });
    await refreshNow();
    const filters = { ...NO_ANALYTICS_FILTERS, branch: scene.branch.id };
    const report = await getSpendingReport(head.id, {
      range: { first: "2031-05-01", last: "2031-05-15" },
      filters,
    });
    const analytics = await getSpending(
      head.id,
      { choice: "custom", from: "2031-05-01", to: "2031-05-15" },
      filters,
    );
    expect(report.total).toBe(analytics.total.amount);
    expect(report.total).toBe(37_035n + 1_250n);
  });
});
