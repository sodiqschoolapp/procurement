import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { E2E_ROLES } from "./global-setup";

// Build-plan 1.9: the Head adds a new reference price for a subtype with a short note; a
// price-history view per subtype; under Admin, a Prices list of every subtype with its current
// price. 04-catalogs.md rules 1 and 4; 03-roles-and-permissions.md ("Add a new price for a
// product": Head only); 11-screens-and-ux.md rules 6, 12, 13; plan of 1.9, decisions 5 and 6.
// Entries are never deleted and both projects share one database, so every name is new on every
// run.

type Person = (typeof E2E_ROLES)[keyof typeof E2E_ROLES];

async function signIn(page: Page, user: Person): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(uz.login.username).fill(user.username);
  await page.getByLabel(uz.login.password).fill(user.password);
  await page.getByRole("button", { name: uz.login.submit }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function noSideScroll(page: Page): Promise<void> {
  const sizes = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    screen: document.documentElement.clientWidth,
  }));
  expect(sizes.content).toBeLessThanOrEqual(sizes.screen);
}

const t = uz.catalog;
const p = uz.prices;

async function openNew(page: Page, address: string, title: string): Promise<void> {
  await page.goto(address);
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: t.save })).toBeEnabled();
}

async function saveNew(page: Page, pattern: RegExp): Promise<void> {
  await page.getByRole("button", { name: t.save }).click();
  await expect(page.getByText(t.created).first()).toBeVisible();
  await expect(page).toHaveURL(pattern);
}

for (const role of ["MANAGER", "PRINCIPAL", "FINANCE"] as const) {
  test(`${role} opening the price pages gets not found (decision 4)`, async ({ page }) => {
    await signIn(page, E2E_ROLES[role]);
    for (const address of ["/prices", "/prices/00000000-0000-4000-8000-000000000001"]) {
      const response = await page.goto(address);
      expect(response?.status(), address).toBe(404);
    }
  });
}

test("the Head adds a new price with a note to a product without subtypes and sees both prices (04 rule 4)", async ({
  page,
}, info) => {
  test.slow();
  const suffix = randomUUID().slice(0, 8);
  const category = `Bo'r ${suffix}`;
  const measure = `Quti ${suffix}`;
  const name = `Oq bo'r ${suffix}`;
  await signIn(page, E2E_ROLES.HEAD);

  await openNew(page, "/catalog/categories/new", t.kinds.categories.newTitle);
  await page.getByLabel(t.fields.name).fill(category);
  await saveNew(page, /\/catalog\/categories\/[0-9a-f-]{36}$/);
  await openNew(page, "/catalog/measures/new", t.kinds.measures.newTitle);
  await page.getByLabel(t.fields.name, { exact: true }).fill(measure);
  await page.getByLabel(t.fields.shortName).fill(`q${suffix}`);
  await saveNew(page, /\/catalog\/measures\/[0-9a-f-]{36}$/);
  await openNew(page, "/catalog/products/new", t.kinds.products.newTitle);
  await page.getByLabel(t.fields.name).fill(name);
  await page.getByLabel(t.fields.categoryId).selectOption({ label: category });
  await page.getByLabel(t.fields.unitId).selectOption({ label: measure });
  await page.getByLabel(t.fields.referencePrice).fill("50 000");
  await saveNew(page, /\/catalog\/products\/[0-9a-f-]{36}$/);
  const productUrl = page.url();

  // The product's page links to its hidden default's price page (decision 5).
  await page.getByRole("link", { name: p.historyLink }).click();
  await expect(page).toHaveURL(/\/prices\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  await expect(page.getByText(/50\s000/).first()).toBeVisible();
  const save = page.getByRole("button", { name: p.save });
  await expect(save).toBeEnabled();
  expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(
    info.project.name === "phone-375" ? 44 : 40,
  );
  await noSideScroll(page);

  // The note is required (decision 8).
  await page.getByLabel(p.price).fill("60 000");
  await save.click();
  await expect(page.getByText(uz.errors.field.required).first()).toBeVisible();
  await page.getByLabel(p.note).fill("Yetkazib beruvchi narxni oshirdi");
  await page.getByLabel(p.note).press("Enter");
  await expect(page.getByText(p.saved).first()).toBeVisible();

  // The new price is current; the old one stays in the history with who and when.
  await expect(page.getByText(p.currentLine.replace("{price}", "")).first()).toContainText(
    /60\s000/,
  );
  const history = page.locator("section", {
    has: page.getByRole("heading", { name: p.historyTitle }),
  });
  const rows = history.getByRole("row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(1)).toContainText(/60\s000/);
  await expect(rows.nth(1)).toContainText("Yetkazib beruvchi narxni oshirdi");
  await expect(rows.nth(1)).toContainText(E2E_ROLES.HEAD.fullName);
  await expect(rows.nth(2)).toContainText(/50\s000/);
  await noSideScroll(page);

  // The product's history shows the new price (04 rule 9); its form shows the new price.
  await page.goto(productUrl);
  await expect(page.getByText(uz.audit.actions.price.add).first()).toBeVisible();
  await expect(page.locator("form").getByText(/60\s000/)).toBeVisible();

  // The Prices list under Admin shows it with its current price (build-plan 1.9).
  await page
    .getByRole("navigation", { name: uz.admin.label })
    .getByRole("link", { name: uz.admin.prices })
    .click();
  await expect(page).toHaveURL(/\/prices$/);
  await expect(page.getByRole("heading", { name: p.title, level: 1 })).toBeVisible();
  await noSideScroll(page);
  await page.getByLabel(p.search).fill(suffix);
  await page.getByLabel(p.search).press("Enter");
  await expect(page).toHaveURL(new RegExp(`q=${suffix}`));
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText(/60\s000/);
  await expect(row).toContainText(E2E_ROLES.HEAD.fullName);
  await noSideScroll(page);
});
