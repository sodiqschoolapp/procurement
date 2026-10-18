import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import pg from "pg";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build-plan 5.9 (Direct entry from Excel). 09-warehouse.md, Direct entry by the Head 1: "Many
// items are imported from an Excel template, with the same preview and error check as catalog
// imports"; 04-catalogs.md rule 7. In branch EA of the browser tests: the Head opens the import
// from Stock on hand, chooses EA, chooses a file with an unknown product and sees that row named
// with Save disabled, then chooses the fixed file, saves, and finds the stock with the ENT number
// on the item card. The Manager has no button and the page is Not found. Run at 375 px and at
// 1440 px by the two projects (11-screens-and-ux.md rule 13); names are invented and new each run.

type Person = { username: string; password: string };

const ti = uz.imports;

async function withDatabase<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client(
    connectionOptions(e2eDatabaseUrl(serverDatabaseUrl()), process.env.DATABASE_CA_CERT),
  );
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/** Two goods products without subtypes, with a reference price of 8 000, and branch EA. */
async function seedItems() {
  return withDatabase(async (client) => {
    await client.query("begin");
    try {
      const tag = randomUUID().slice(0, 8);
      const unit = await client.query<{ id: string }>(
        `insert into units (name, short_name, allow_decimal, is_active, created_at)
         values ($1, $2, false, true, now()) returning id`,
        [`O'lchov ${tag}`, `d${tag}`],
      );
      const category = await client.query<{ id: string }>(
        `insert into categories (name, is_active, created_at) values ($1, true, now()) returning id`,
        [`Toifa ${tag}`],
      );
      const names = [`Daftar ${tag}`, `Ruchka ${tag}`];
      for (const name of names) {
        const product = await client.query<{ id: string }>(
          `insert into products (name, type, category_id, unit_id, is_active, has_variants,
                                 created_at)
           values ($1, 'GOODS', $2, $3, true, false, now()) returning id`,
          [name, category.rows[0]!.id, unit.rows[0]!.id],
        );
        const variant = await client.query<{ id: string }>(
          `insert into product_variants (product_id, name, is_default, reference_price, is_active,
                                         created_at)
           values ($1, 'default', true, 8000, true, now()) returning id`,
          [product.rows[0]!.id],
        );
        // A reference price is the newest HEAD row of its history (04 rule 4; migration 0014).
        await client.query(
          `insert into price_history (variant_id, price, source, set_by, created_at)
           select $1, 8000, 'HEAD', id, now() from users where username = $2`,
          [variant.rows[0]!.id, E2E_ROLES.HEAD.username],
        );
      }
      const branch = await client.query<{ id: string }>(
        "select id from branches where code = 'EA'",
      );
      await client.query("commit");
      return { tag, names, branchId: branch.rows[0]!.id };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

async function signIn(page: Page, user: Person): Promise<void> {
  await page.goto("/login");
  await page.locator("#username").fill(user.username);
  await page.locator("#password").fill(user.password);
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(/\/$/);
}

/** The stock template filled in: the Uzbek titles, then the rows. */
async function workbook(rows: (string | number | null)[][]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(ti.sheet.stock);
  const columns = ti.columns.stock;
  sheet.addRow([columns.name, columns.subtype, columns.qty, columns.cost]);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await book.xlsx.writeBuffer());
}

async function choose(page: Page, buffer: Buffer): Promise<void> {
  await page.locator("#import-file-input").setInputFiles({
    name: "qoldiq.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
}

async function noSideScroll(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
}

test("the Head imports EA's existing stock: an unknown product saves nothing, the fixed file enters both (build-plan 5.9)", async ({
  page,
}) => {
  const seeded = await seedItems();
  await signIn(page, E2E_ROLES.HEAD);

  await page.goto("/warehouse/stock");
  await page.getByRole("link", { name: uz.warehouse.stock.importStock }).click();
  await expect(page).toHaveURL(/\/catalog\/import\/stock$/);
  await expect(page.getByRole("heading", { level: 1, name: ti.title.stock })).toBeVisible();

  // The file waits for the branch.
  await expect(page.locator("#import-file-input")).toBeDisabled();
  await page.locator("#import-branch").selectOption(seeded.branchId);
  await noSideScroll(page);

  const downloading = page.waitForEvent("download");
  await page.getByRole("link", { name: ti.download }).click();
  expect((await downloading).suggestedFilename()).toBe("stock-template.xlsx");

  // One unknown product: its row is named and Save stays disabled.
  await choose(
    page,
    await workbook([
      [seeded.names[0]!, null, 217, null],
      [`Yo'q ${seeded.tag}`, null, 3, 1000],
    ]),
  );
  const errorLine = ti.errorLine
    .replace("{row}", "3")
    .replace("{column}", ti.columns.stock.name)
    .replace("{message}", uz.errors.field.unknown);
  await expect(page.getByText(errorLine)).toBeVisible();
  await expect(page.getByRole("button", { name: ti.save })).toBeDisabled();
  await noSideScroll(page);

  // The fixed file: both rows, the first at its reference price.
  await choose(
    page,
    await workbook([
      [seeded.names[0]!, null, 217, null],
      [seeded.names[1]!, null, 431, 1500],
    ]),
  );
  await expect(page.getByText("2 ta qator, xato yoʻq")).toBeVisible();
  await page.getByRole("button", { name: ti.save }).click();
  await expect(page).toHaveURL(/\/warehouse\/stock$/);

  await page.goto(`/warehouse/stock?q=${encodeURIComponent(seeded.tag)}&branch=${seeded.branchId}`);
  await expect(page.getByRole("row").filter({ hasText: seeded.names[0]! })).toContainText("217");
  await expect(page.getByRole("row").filter({ hasText: seeded.names[1]! })).toContainText("431");
  await page.getByRole("link", { name: seeded.names[1]! }).click();
  const entered = page.getByRole("row").filter({ hasText: uz.warehouse.item.types.DIRECT_ENTRY });
  await expect(entered).toContainText(/ENT-EA-\d{2}-\d{4,}/);
  await expect(entered).toContainText("+431");
});

test("the Manager has no import button and the page is Not found (03 matrix: Enter stock directly)", async ({
  page,
}) => {
  await signIn(page, E2E_ROLES.MANAGER);
  await page.goto("/warehouse/stock");
  await expect(page.getByRole("link", { name: uz.warehouse.stock.newReturn })).toBeVisible();
  await expect(page.getByRole("link", { name: uz.warehouse.stock.importStock })).toHaveCount(0);
  const response = await page.goto("/catalog/import/stock");
  expect(response?.status()).toBe(404);
  expect((await page.request.get("/catalog/import/stock/template")).status()).toBe(404);
});
