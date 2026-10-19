import { type Page, expect, test } from "@playwright/test";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { E2E_USER } from "./global-setup";
import { seedReportRecords } from "./report-records";

// Build plan 6.10 (Search) in the browser, at 375 and 1440 px: "By hand: find an order by its
// number" as a test, and the branch wall (03 rule 1): a Manager of EA presses Ctrl+K, types the
// number of an EA order and opens it with Enter; the number of an EB order gives "Nothing found"
// (11-screens-and-ux.md rule 9; plan of 6.10). The Manager reads Uzbek, as in the other specs.

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#username").fill(E2E_USER.username);
  await page.locator("#password").fill(E2E_USER.password);
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(/\/$/);
}

function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test("Done when: a Manager finds an order of the own branch by its number, and not one of another branch (6.10)", async ({
  page,
}) => {
  const seeded = await seedReportRecords([
    { code: "EA", day: "2019-06-11", qty: "1.000", price: 1000 },
    { code: "EB", day: "2019-06-12", qty: "1.000", price: 1000 },
  ]);
  const [own, other] = seeded.numbers as [string, string];
  await signIn(page);

  // Ctrl+K opens the search from any page.
  await page.keyboard.press("Control+k");
  const input = page.getByRole("combobox", { name: uz.search.title });
  await expect(input).toBeFocused();

  // Another branch's number: nothing, once the answer for this text has come.
  await input.fill(other);
  await expect(page.getByText(uz.search.empty)).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(0);

  // The own branch's number: one order, opened with Enter.
  await input.fill(own);
  const option = page.getByRole("option");
  await expect(option).toHaveCount(1);
  await expect(option).toContainText(own);
  expect(await scrollsSideways(page)).toBe(false);
  await input.press("Enter");
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(own);
});

test("the search button opens the same search; a product opens Stock on hand; no answer shows during the pause (6.10)", async ({
  page,
}) => {
  const seeded = await seedReportRecords([
    { code: "EA", day: "2019-06-13", qty: "1.000", price: 1000 },
  ]);
  const tag = seeded.category.replace("Hisobot ", "");
  await page.clock.install();
  await signIn(page);

  await page.getByTestId("search-open").click();
  const input = page.getByRole("combobox", { name: uz.search.title });
  await expect(input).toBeFocused();
  await input.fill(`zz${tag}`);
  // During the 250 ms pause: placeholders, never "Nothing found" (.claude/rules/ui.md).
  await expect(page.getByText(uz.search.loading)).toBeVisible();
  await expect(page.getByText(uz.search.empty)).toHaveCount(0);
  await page.clock.runFor(300);
  await expect(page.getByText(uz.search.empty)).toBeVisible();

  await input.fill(`Qog'oz ${tag}`);
  await page.clock.runFor(300);
  const option = page.getByRole("option");
  await expect(option).toHaveCount(1);
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(page).toHaveURL(/\/warehouse\/stock\?q=/);
  expect(await scrollsSideways(page)).toBe(false);

  // Escape closes the search.
  await page.keyboard.press("Control+k");
  await expect(input).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(input).toBeHidden();
});
