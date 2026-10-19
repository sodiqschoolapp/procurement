import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build plan 7.3 (Stock count). 09-warehouse.md, Other documents, Stock count: "The Manager
// starts a count for a branch or a category and types the counted quantities. The system shows
// the differences"; 11-screens-and-ux.md, Screens: "Stock counts | /warehouse/counts | Manager,
// Head", rule 6 (the start states its result; leaving unsaved changes asks first). In branch EA
// of the browser tests, a category made for this run holds 10 pieces of one item and 2.5 kg of
// another: the Manager starts a count of that category, types 8 and 3, sees −2 and +0,5, is asked
// before leaving unsaved, saves, reloads and sees them kept; the count is listed under "Stock
// count" in Documents. Run at 375 px and at 1440 px by the two projects.

type Person = { username: string; password: string };

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

/** A category of its own with two items in EA's stock: 10 pieces, and 2.5 kg. */
async function seedCategory() {
  return withDatabase(async (client) => {
    await client.query("begin");
    try {
      const found = await client.query<{ id: string }>("select id from users where username = $1", [
        E2E_ROLES.MANAGER.username,
      ]);
      const userId = found.rows[0]!.id;
      const tag = randomUUID().slice(0, 8);
      const category = await client.query<{ id: string }>(
        `insert into categories (name, is_active, created_at) values ($1, true, now()) returning id`,
        [`Sanoq toifasi ${tag}`],
      );
      const item = async (name: string, decimals: boolean, qty: string) => {
        const unit = await client.query<{ id: string }>(
          `insert into units (name, short_name, allow_decimal, is_active, created_at)
           values ($1, $2, $3, true, now()) returning id`,
          [`O'lchov ${name}`, `u${randomUUID().slice(0, 6)}`, decimals],
        );
        const product = await client.query<{ id: string }>(
          `insert into products (name, type, category_id, unit_id, is_active, has_variants,
                                 created_at)
           values ($1, 'GOODS', $2, $3, true, false, now()) returning id`,
          [name, category.rows[0]!.id, unit.rows[0]!.id],
        );
        const variant = await client.query<{ id: string }>(
          `insert into product_variants (product_id, name, is_default, is_active, created_at)
           values ($1, 'default', true, true, now()) returning id`,
          [product.rows[0]!.id],
        );
        const variantId = variant.rows[0]!.id;
        await client.query(
          `insert into stock_movements (branch_id, variant_id, type, qty_delta, unit_cost,
                                        balance_after, created_by, created_at)
           select id, $1, 'RECEIPT', $3, 5000, $3, $2, now() from branches where code = 'EA'`,
          [variantId, userId, qty],
        );
        await client.query(
          `insert into stock_balances (branch_id, variant_id, qty, avg_cost, created_at,
                                       updated_at)
           select id, $1, $2, 5000, now(), now() from branches where code = 'EA'`,
          [variantId, qty],
        );
        return variantId;
      };
      const pieces = await item(`Sanoq dona ${tag}`, false, "10");
      const kilos = await item(`Sanoq kg ${tag}`, true, "2.5");
      await client.query("commit");
      return { tag, categoryId: category.rows[0]!.id, pieces, kilos };
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

async function noSideScroll(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
}

const texts = uz.warehouse.count;

test("a Manager counts a category: the differences are counted − stock at start, kept after Save (09 Stock count)", async ({
  page,
}) => {
  const seeded = await seedCategory();
  await signIn(page, E2E_ROLES.MANAGER);

  await page.goto("/warehouse/stock");
  await page.getByRole("link", { name: uz.warehouse.documents.tabs.counts, exact: true }).click();
  await expect(page).toHaveURL(/\/warehouse\/counts$/);
  await expect(page.getByRole("heading", { level: 1, name: texts.title })).toBeVisible();
  await noSideScroll(page);

  // Start cannot be undone: the dialog says what the count takes and that it stays.
  await page.locator("[data-count-start]").click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(texts.startResult);
  await dialog.locator("[data-count-category]").selectOption(seeded.categoryId);
  await dialog.getByRole("button", { name: texts.start, exact: true }).click();
  await expect(page).toHaveURL(/\/warehouse\/documents\/[0-9a-f-]+$/);
  const heading = (await page.getByRole("heading", { level: 1 }).textContent()) ?? "";
  const number = /CNT-EA-\d{2}-\d{4,}/.exec(heading)?.[0] ?? "";
  expect(number).not.toBe("");

  const sheet = page.locator("[data-count-sheet]");
  await expect(sheet.locator("[data-count-line]")).toHaveCount(2);
  const piecesLine = sheet.locator("[data-count-line]").filter({ hasText: "Sanoq dona" });
  const kilosLine = sheet.locator("[data-count-line]").filter({ hasText: "Sanoq kg" });
  await expect(piecesLine).toContainText("10");
  await expect(piecesLine.locator("[data-count-difference]")).toHaveText(texts.notCounted);

  // Half a piece is refused as it is typed.
  await piecesLine.getByRole("textbox").fill("7.5");
  await expect(piecesLine).toContainText(uz.errors.field.wholeOnly);
  await piecesLine.getByRole("textbox").fill("8");
  await kilosLine.getByRole("textbox").fill("3");
  await expect(piecesLine.locator("[data-count-difference]")).toContainText("-2");
  await expect(kilosLine.locator("[data-count-difference]")).toContainText("+0,5");
  await noSideScroll(page);

  // Leaving with unsaved quantities asks first; staying keeps them.
  await page.getByRole("link", { name: uz.shell.menu.orders, exact: true }).click();
  const leave = page.getByRole("alertdialog");
  await expect(leave).toContainText(uz.unsavedChanges.title);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/warehouse\/documents\/[0-9a-f-]+$/);
  await expect(piecesLine.getByRole("textbox")).toHaveValue("8");

  await page.locator("[data-count-save]").click();
  await expect(page.getByText(texts.saved.replace("{number}", number))).toBeVisible();
  await page.reload();
  await expect(piecesLine.getByRole("textbox")).toHaveValue("8");
  await expect(kilosLine.getByRole("textbox")).toHaveValue("3");
  await expect(kilosLine.locator("[data-count-difference]")).toContainText("+0,5");

  // The count is a document of type "Stock count".
  await page.goto("/warehouse/documents?type=COUNT");
  await expect(page.locator(`[data-document-row="${number}"]`)).toContainText(
    uz.warehouse.documents.types.COUNT,
  );
  await page.goto("/warehouse/counts");
  await expect(page.locator(`[data-count-row="${number}"] [data-count-progress]`)).toContainText(
    "2",
  );
});

test("Stock counts is Not found for the Principal and Finance, with no Counts tab (11 Screens: Manager, Head)", async ({
  page,
}) => {
  for (const person of [E2E_ROLES.PRINCIPAL, E2E_ROLES.FINANCE]) {
    await page.context().clearCookies();
    await signIn(page, person);
    await page.goto("/warehouse/stock");
    await expect(
      page.getByRole("link", { name: uz.warehouse.documents.tabs.counts, exact: true }),
    ).toHaveCount(0);
    await page.goto("/warehouse/counts");
    await expect(page.getByRole("heading", { name: uz.notFoundPage.title })).toBeVisible();
  }
});
