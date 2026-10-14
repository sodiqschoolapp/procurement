import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import sharp from "sharp";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { E2E_ROLES } from "./global-setup";

// Build-plan 1.7, Done when (by hand, automated too): "add a product with a photo and see the
// small version in the list"; a new item is a product unless service is chosen; a duplicate name
// is refused (04-catalogs.md, Catalogs table: Products and services; rules 2, 3, 6, 9; A7;
// 11-screens-and-ux.md rules 6, 8, 12, 13; plan of 1.7). Entries are never deleted and both
// projects share one database, so every name is new on every run.

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

/** Opens a new-entry page and waits for its form to run in the browser. */
async function openNew(page: Page, address: string, title: string): Promise<void> {
  await page.goto(address);
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: t.save })).toBeEnabled();
}

/** Saves a new entry and waits for its page. */
async function saveNew(page: Page, pattern: RegExp): Promise<void> {
  await page.getByRole("button", { name: t.save }).click();
  await expect(page.getByText(t.created).first()).toBeVisible();
  await expect(page).toHaveURL(pattern);
}

for (const role of ["MANAGER", "PRINCIPAL", "FINANCE"] as const) {
  test(`${role} opening the product pages gets not found (03, "Manage catalogs …")`, async ({
    page,
  }) => {
    await signIn(page, E2E_ROLES[role]);
    for (const address of [
      "/catalog/products",
      "/catalog/products/new",
      "/catalog/products/00000000-0000-4000-8000-000000000000",
    ]) {
      const response = await page.goto(address);
      expect(response?.status(), address).toBe(404);
    }
  });
}

test("the Head adds a product with a photo, sees its small version in the list, adds a service and is refused a duplicate (Done when)", async ({
  page,
}, info) => {
  test.slow();
  const suffix = randomUUID().slice(0, 8);
  const category = `Kanselyariya ${suffix}`;
  const measure = `Dona ${suffix}`;
  const name = `Daftar ${suffix}`;
  await signIn(page, E2E_ROLES.HEAD);

  // A category and a measure to pick from (1.5).
  await openNew(page, "/catalog/categories/new", t.kinds.categories.newTitle);
  await page.getByLabel(t.fields.name).fill(category);
  await saveNew(page, /\/catalog\/categories\/[0-9a-f-]{36}$/);
  await openNew(page, "/catalog/measures/new", t.kinds.measures.newTitle);
  await page.getByLabel(t.fields.name, { exact: true }).fill(measure);
  await page.getByLabel(t.fields.shortName).fill(`d${suffix}`);
  await saveNew(page, /\/catalog\/measures\/[0-9a-f-]{36}$/);

  // /catalog lists Products and services.
  await page.goto("/catalog");
  await page.getByRole("link", { name: new RegExp(t.kinds.products.title) }).click();
  await expect(page).toHaveURL(/\/catalog\/products$/);

  // A product with a photo; the type is Product unless Service is chosen (A7).
  await openNew(page, "/catalog/products/new", t.kinds.products.newTitle);
  await expect(page.getByRole("radio", { name: t.productType.GOODS })).toBeChecked();
  const save = page.getByRole("button", { name: t.save });
  expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(
    info.project.name === "phone-375" ? 44 : 40,
  );
  await page.getByLabel(t.fields.name).fill(` ${name} `);
  await page.getByLabel(t.fields.categoryId).selectOption({ label: category });
  await page.getByLabel(t.fields.unitId).selectOption({ label: measure });
  await page.getByLabel(t.fields.referencePrice).fill("12 500");
  const photo = await sharp({
    create: { width: 900, height: 600, channels: 3, background: "#2a6fdb" },
  })
    .jpeg()
    .toBuffer();
  await page.locator("#product-photo").setInputFiles({
    name: "daftar.jpg",
    mimeType: "image/jpeg",
    buffer: photo,
  });
  const preview = page.locator("form").getByRole("img", { name: new RegExp(suffix) });
  await expect(preview).toBeVisible();
  await expect(page.getByRole("button", { name: t.photoReplace })).toBeVisible();
  await saveNew(page, /\/catalog\/products\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  // The price is shown, not edited (plan of 1.7, decision 2).
  await expect(page.getByText(/12\s500/).first()).toBeVisible();
  await expect(page.getByText(uz.audit.actions.product.create).first()).toBeVisible();
  await noSideScroll(page);

  // A service.
  await openNew(page, "/catalog/products/new", t.kinds.products.newTitle);
  await page.getByLabel(t.fields.name).fill(`Ta'mir ${suffix}`);
  await page.getByRole("radio", { name: t.productType.SERVICE }).click();
  await page.getByLabel(t.fields.categoryId).selectOption({ label: category });
  await page.getByLabel(t.fields.unitId).selectOption({ label: measure });
  await saveNew(page, /\/catalog\/products\/[0-9a-f-]{36}$/);

  // A duplicate name is refused, in other capital letters too (04 rule 3).
  await openNew(page, "/catalog/products/new", t.kinds.products.newTitle);
  await page.getByLabel(t.fields.name).fill(name.toUpperCase());
  await page.getByLabel(t.fields.categoryId).selectOption({ label: category });
  await page.getByLabel(t.fields.unitId).selectOption({ label: measure });
  await page.getByRole("button", { name: t.save }).click();
  await expect(page.getByText(uz.errors.field.taken)).toBeVisible();
  await expect(page).toHaveURL(/\/catalog\/products\/new$/);

  // The list: the small photo loads; the type filter keeps the service only.
  await page.goto(`/catalog/products?q=${suffix}`);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText(t.productType.GOODS);
  const small = row.getByRole("img", { name: new RegExp(suffix) });
  await expect(small).toBeVisible();
  await expect
    .poll(() => small.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(160);
  await noSideScroll(page);
  await page.getByLabel(t.filterType).selectOption({ label: t.productType.SERVICE });
  await page.getByRole("button", { name: t.find }).click();
  await expect(page).toHaveURL(/type=SERVICE/);
  await expect(page.getByRole("row").filter({ hasText: `Ta'mir ${suffix}` })).toHaveCount(1);
  await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(0);
});
