import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import ExcelJS from "exceljs";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { E2E_ROLES } from "./global-setup";

// Build-plan 1.10, Done when, by hand: "the spec's phase 1 check, import 30 products from Excel"
// (16-build-order.md, phase 1). Build-plan 1.11: the import of new prices. 04-catalogs.md rule 7: a template, a preview with errors per row,
// nothing saved unless every row is valid. 11-screens-and-ux.md rule 13 (375 px and 1440 px). Both
// projects share one database, so every name is new on every run. Names are invented.

type Person = (typeof E2E_ROLES)[keyof typeof E2E_ROLES];

const t = uz.catalog;
const ti = uz.imports;

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

async function openNew(page: Page, address: string, title: string): Promise<void> {
  await page.goto(address);
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: t.save })).toBeEnabled();
}

async function saveNew(page: Page, pattern: RegExp): Promise<void> {
  await page.getByRole("button", { name: t.save }).click();
  await expect(page).toHaveURL(pattern);
}

/** The template filled in: the Uzbek titles, then the rows. */
async function workbook(
  rows: (string | number | null)[][],
  kind: "products" | "prices" = "products",
): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(ti.sheet[kind]);
  if (kind === "products") {
    const columns = ti.columns.products;
    sheet.addRow([
      columns.name,
      columns.type,
      columns.category,
      columns.measure,
      columns.company,
      columns.description,
      columns.subtype,
      columns.price,
    ]);
  } else {
    const columns = ti.columns.prices;
    sheet.addRow([columns.name, columns.subtype, columns.price, columns.note]);
  }
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await book.xlsx.writeBuffer());
}

async function choose(page: Page, buffer: Buffer): Promise<void> {
  await page.locator("#import-file-input").setInputFiles({
    name: "mahsulotlar.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
}

for (const role of ["MANAGER", "PRINCIPAL", "FINANCE"] as const) {
  test(`${role} opening the import pages gets not found (03, "Manage catalogs …", "Add a new price …")`, async ({
    page,
  }) => {
    await signIn(page, E2E_ROLES[role]);
    for (const address of [
      "/catalog/import/products",
      "/catalog/import/departments",
      "/catalog/import/prices",
    ]) {
      const response = await page.goto(address);
      expect(response?.status(), address).toBe(404);
    }
    for (const kind of ["products", "prices"]) {
      const template = await page.request.get(`/catalog/import/${kind}/template`);
      expect(template.status(), kind).toBe(404);
    }
  });
}

test("the Head imports 30 products from Excel: a bad row saves nothing, the fixed file saves all (Done when)", async ({
  page,
}, info) => {
  test.slow();
  const suffix = randomUUID().slice(0, 8);
  const category = `Kanselyariya ${suffix}`;
  const measure = `Dona ${suffix}`;
  await signIn(page, E2E_ROLES.HEAD);

  await openNew(page, "/catalog/categories/new", t.kinds.categories.newTitle);
  await page.getByLabel(t.fields.name).fill(category);
  await saveNew(page, /\/catalog\/categories\/[0-9a-f-]{36}$/);
  await openNew(page, "/catalog/measures/new", t.kinds.measures.newTitle);
  await page.getByLabel(t.fields.name, { exact: true }).fill(measure);
  await page.getByLabel(t.fields.shortName).fill(`d${suffix}`);
  await saveNew(page, /\/catalog\/measures\/[0-9a-f-]{36}$/);

  // From the products list to the import page.
  await page.goto("/catalog/products");
  await page.getByRole("link", { name: t.importButton }).click();
  await expect(page).toHaveURL(/\/catalog\/import\/products$/);
  await expect(page.getByRole("heading", { name: ti.title.products, level: 1 })).toBeVisible();

  // The template downloads as a workbook.
  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: ti.download }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("products-template.xlsx");

  const names = Array.from({ length: 30 }, (_, at) => `Daftar ${suffix} ${at + 1}`);
  const good = names.map((name, at) => [name, "", category, measure, null, null, null, 1000 + at]);
  const bad = [
    ...good.slice(0, 29),
    [names[29]!, "", `Yoʻq ${suffix}`, measure, null, null, null, 5],
  ];

  // A file with one bad row: the row and the reason are named; Save stays disabled.
  await choose(page, await workbook(bad));
  const errorLine = ti.errorLine
    .replace("{row}", "31")
    .replace("{column}", ti.columns.products.category)
    .replace("{message}", uz.errors.field.unknown);
  await expect(page.getByText(errorLine)).toBeVisible();
  const save = page.getByRole("button", { name: ti.save });
  await expect(save).toBeDisabled();
  expect((await save.boundingBox())!.height).toBeGreaterThanOrEqual(
    info.project.name === "phone-375" ? 44 : 40,
  );
  await noSideScroll(page);

  // The fixed file: no error, Save imports all 30 and returns to the list.
  await choose(page, await workbook(good));
  await expect(page.getByText(errorLine)).toBeHidden();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page).toHaveURL(/\/catalog\/products$/);
  await page.getByLabel(t.search).fill(`Daftar ${suffix}`);
  await page.getByLabel(t.search).press("Enter");
  await expect(page.getByRole("link", { name: names[0]!, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: names[9]!, exact: true })).toBeVisible();
  await noSideScroll(page);
});

test("the Head imports 3 new prices from Excel: an unknown product saves nothing, the fixed file saves all (1.11, Done when)", async ({
  page,
}) => {
  test.slow();
  const suffix = randomUUID().slice(0, 8);
  const category = `Xoʻjalik ${suffix}`;
  const measure = `Quti ${suffix}`;
  const plain = `Sovun ${suffix}`;
  const sized = `Salfetka ${suffix}`;
  await signIn(page, E2E_ROLES.HEAD);

  await openNew(page, "/catalog/categories/new", t.kinds.categories.newTitle);
  await page.getByLabel(t.fields.name).fill(category);
  await saveNew(page, /\/catalog\/categories\/[0-9a-f-]{36}$/);
  await openNew(page, "/catalog/measures/new", t.kinds.measures.newTitle);
  await page.getByLabel(t.fields.name, { exact: true }).fill(measure);
  await page.getByLabel(t.fields.shortName).fill(`q${suffix}`);
  await saveNew(page, /\/catalog\/measures\/[0-9a-f-]{36}$/);

  // Two products to price: one without subtypes, one with two (through the products import).
  await page.goto("/catalog/import/products");
  await expect(page.getByRole("heading", { name: ti.title.products, level: 1 })).toBeVisible();
  await choose(
    page,
    await workbook([
      [plain, "", category, measure, null, null, null, 4000],
      [sized, "", category, measure, null, null, "Katta", 9000],
      [sized, null, null, null, null, null, "Kichik", 7000],
    ]),
  );
  const save = page.getByRole("button", { name: ti.save });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page).toHaveURL(/\/catalog\/products$/);

  // From the Prices list to the prices import.
  await page.goto("/prices");
  await page.getByRole("link", { name: uz.prices.importButton }).click();
  await expect(page).toHaveURL(/\/catalog\/import\/prices$/);
  await expect(page.getByRole("heading", { name: ti.title.prices, level: 1 })).toBeVisible();
  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: ti.download }).click();
  expect((await downloading).suggestedFilename()).toBe("prices-template.xlsx");

  const good = [
    [plain, null, 4500, "Oktabr narxi"],
    [sized, "Katta", 9500, "Oktabr narxi"],
    [sized, "Kichik", 7500, "Oktabr narxi"],
  ];
  // One unknown product: its row is named and nothing can be saved.
  await choose(page, await workbook([...good, [`Yoʻq ${suffix}`, null, 100, "x"]], "prices"));
  const errorLine = ti.errorLine
    .replace("{row}", "5")
    .replace("{column}", ti.columns.prices.name)
    .replace("{message}", uz.errors.field.unknown);
  await expect(page.getByText(errorLine)).toBeVisible();
  await expect(save).toBeDisabled();
  await noSideScroll(page);

  // The fixed file saves the 3 prices and returns to the Prices list, which shows them.
  await choose(page, await workbook(good, "prices"));
  await expect(page.getByText(errorLine)).toBeHidden();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText(ti.saved.replace("{rows}", "3"))).toBeVisible();
  await expect(page).toHaveURL(/\/prices$/);
  await page.getByLabel(uz.prices.search).fill(sized);
  await page.getByLabel(uz.prices.search).press("Enter");
  // Anchored to the start of the money text: a random name of another test's branch in the
  // switcher ("… 5d950038") also holds "9500" (e2e of 5.4b's CI).
  await expect(page.getByText(/^9\s?500\s/)).toBeVisible();
  await expect(page.getByText(/^7\s?500\s/)).toBeVisible();
  await noSideScroll(page);
});
