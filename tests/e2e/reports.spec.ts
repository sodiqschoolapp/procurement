import { type Page, expect, test } from "@playwright/test";
import ExcelJS from "exceljs";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { E2E_ROLES } from "./global-setup";
import { REPORT_MONTH, seedReportRecords } from "./report-records";

// Build plan 6.8 (Reports: orders and spending) in the browser, at 375 and 1440 px: the Head opens
// /reports, each of the four tabs, chooses the dates and a category, and downloads the Spending
// report; the file's amounts are number cells that add up to its total line (Done when: "export
// the spending report and sum a column in Excel"; 10-notifications-analytics-reports.md, Reports;
// 11-screens-and-ux.md, Screens: Reports). The Head reads Uzbek, as in the other specs.

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#username").fill(E2E_ROLES.HEAD.username);
  await page.locator("#password").fill(E2E_ROLES.HEAD.password);
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(/\/$/);
}

function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test("Done when: the Head opens each report, filters by dates and category, and the Spending file adds up (10 Reports)", async ({
  page,
}) => {
  const seeded = await seedReportRecords([
    { code: "EA", day: "2019-06-10", qty: "2.500", price: 3333 },
    { code: "EA", day: "2019-06-20", qty: "1.000", price: 20000 },
    { code: "EB", day: "2019-06-21", qty: "1.000", price: 5000 },
  ]);
  await signIn(page);
  await page.goto("/reports");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(uz.reports.title);
  await expect(page.locator("[data-report-tab]")).toHaveText([
    uz.reports.tabs.orders,
    uz.reports.tabs.purchases,
    uz.reports.tabs.plan,
    uz.reports.tabs.spending,
  ]);

  // At phone width the filters fold behind their button; it opens on a tap.
  await page.locator('[data-report-tab="spending"]').click();
  await expect(page).toHaveURL(/report=spending/);
  if (test.info().project.name === "phone-375") {
    await expect(page.locator("[data-filter-from]")).toBeHidden();
    await page.locator("[data-filter-toggle]").click();
  }
  await page.locator("[data-filter-from]").fill(REPORT_MONTH.from);
  await page.locator("[data-filter-to]").fill(REPORT_MONTH.to);
  await page.locator("[data-filter-category]").selectOption({ label: seeded.category });
  await page.getByRole("button", { name: uz.reports.apply }).click();
  await expect(page).toHaveURL(/category=/);

  // 8 333 (2.5 × 3 333, rounded half up) + 20 000 + 5 000 (08 Actual total).
  await expect(page.locator("[data-report-summary]")).toContainText(/33\s333/);
  await expect(page.locator('[data-table="spending-branches"] tbody tr')).toHaveCount(2);
  expect(await scrollsSideways(page)).toBe(false);

  // The Spending file: a sheet per table, every amount a number, adding up to the total line.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator('[data-excel="spending"]').click(),
  ]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile((await download.path())!);
  expect(workbook.worksheets).toHaveLength(5);
  const amounts: unknown[] = [];
  workbook.worksheets[1]!.eachRow((row) => amounts.push(row.getCell(3).value));
  const numbers = amounts.filter((value): value is number => typeof value === "number");
  expect(numbers.at(-1)).toBe(33_333);
  expect(numbers.slice(0, -1).reduce((sum, value) => sum + value, 0)).toBe(33_333);

  // The other three tabs keep the dates and the category.
  await page.locator('[data-report-tab="purchases"]').click();
  await expect(page.locator("[data-record-row]")).toHaveCount(3);
  await expect(page.locator("[data-report-summary]")).toContainText(/33\s333/);
  expect(await scrollsSideways(page)).toBe(false);
  await page.locator('[data-report-tab="plan"]').click();
  await expect(page.getByText(uz.reports.plan.empty)).toBeVisible();
  await page.locator('[data-report-tab="orders"]').click();
  await expect(page.locator("[data-order-list-link]")).toHaveAttribute("href", /dates=submitted/);
  await expect(page.locator('[data-excel="orders"]')).toHaveAttribute(
    "href",
    /^\/orders\/download\/excel\?dates=submitted/,
  );
  expect(await scrollsSideways(page)).toBe(false);
});
