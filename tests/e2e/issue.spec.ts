import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build plan 5.4 (Issue to a department), the spec's phase 5 check "download an issue note as PDF"
// (16-build-order.md, phase 5 row). 09-warehouse.md, Issue to a department (the fields, the stock
// beside each line, the number, the note); 11-screens-and-ux.md, Interface per role: Manager
// ("Buying and issuing have phone layouts"). The EA Manager opens the form from Stock on hand,
// picks the department (Received by is prefilled), adds an item from the search, issues 3 of 10,
// downloads the note and finds 7 in stock. Run at 375 px (one step at a time) and at 1440 px by the
// two projects. The stock is written straight into the tables, as postMovement() writes it.

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

/** A product of EA with 10 in stock and a department of EA with its responsible person. */
async function seedStock() {
  return withDatabase(async (client) => {
    await client.query("begin");
    try {
      const found = await client.query<{ id: string }>("select id from users where username = $1", [
        E2E_ROLES.MANAGER.username,
      ]);
      const userId = found.rows[0]!.id;
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
      const department = `Bo'lim ${tag}`;
      const responsible = "Sinov Mas'ulov";
      await client.query(
        `insert into departments (branch_id, name, responsible_name, is_active, created_at)
         select id, $1, $2, true, now() from branches where code = 'EA'`,
        [department, responsible],
      );
      const name = `Berish ${tag}`;
      const product = await client.query<{ id: string }>(
        `insert into products (name, type, category_id, unit_id, is_active, has_variants, created_at)
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
         select id, $1, 'RECEIPT', 10, 5000, 10, $2, now() from branches where code = 'EA'`,
        [variantId, userId],
      );
      await client.query(
        `insert into stock_balances (branch_id, variant_id, qty, avg_cost, created_at, updated_at)
         select id, $1, 10, 5000, now(), now() from branches where code = 'EA'`,
        [variantId],
      );
      await client.query("commit");
      return { tag, name, department, responsible, variantId };
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

const texts = uz.warehouse.issue;

test("a Manager issues 3 of 10 to a department, downloads the issue note, and 7 are left (09 Issue to a department)", async ({
  page,
}, testInfo) => {
  const phone = testInfo.project.name === "phone-375";
  const seeded = await seedStock();
  await signIn(page, E2E_ROLES.MANAGER);

  await page.goto(`/warehouse/stock?q=${encodeURIComponent(seeded.tag)}`);
  await page.getByRole("link", { name: uz.warehouse.stock.newIssue }).click();
  await expect(page).toHaveURL(/\/warehouse\/documents\/new\?type=ISSUE$/);
  await expect(page.getByRole("heading", { level: 1, name: texts.title })).toBeVisible();

  // Step 1: the department; Received by is prefilled with its responsible person (09 Issue).
  await page
    .getByLabel(texts.department, { exact: true })
    .selectOption({ label: seeded.department });
  await expect(page.getByLabel(texts.receivedBy, { exact: true })).toHaveValue(seeded.responsible);
  if (phone) {
    await expect(page.getByRole("heading", { name: texts.items })).toBeHidden();
    await page.getByRole("button", { name: texts.next }).click();
  }

  // Step 2: the item from the search of the branch's stock, its stock beside it.
  await page.getByLabel(texts.search).fill(seeded.tag);
  await page.locator(`[data-pick="${seeded.variantId}"]`).click();
  const line = page.locator(`[data-issue-line="${seeded.variantId}"]`);
  await expect(line.locator("[data-in-stock]")).toContainText("10");
  const quantity = line.getByRole("textbox");
  await quantity.fill("11");
  await expect(line).toContainText(texts.moreThanStock);
  await quantity.fill("3");
  await expect(line).not.toContainText(texts.moreThanStock);
  if (phone) {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
    await page.getByRole("button", { name: texts.next }).click();
  }

  // Step 3: save.
  await page.getByRole("button", { name: texts.save }).click();
  const saved = page.locator("[data-issue-saved]");
  await expect(saved).toBeVisible();
  const heading = (await saved.getByRole("heading").textContent()) ?? "";
  const number = /ISS-EA-\d{2}-\d{4,}/.exec(heading)?.[0];
  expect(number).toBeTruthy();

  // The note downloads as a PDF named by its number (09 Issue 2).
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    saved.getByRole("link", { name: texts.downloadNote }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${number}.pdf`);

  await page.goto(`/warehouse/stock?q=${encodeURIComponent(seeded.tag)}`);
  await expect(page.getByRole("row").filter({ hasText: seeded.name })).toContainText("7");
});

test("the issue form is Not found for the Principal and Finance, and their Stock on hand has no New issue (03 matrix: Issue, return, transfer stock)", async ({
  page,
}) => {
  for (const person of [E2E_ROLES.PRINCIPAL, E2E_ROLES.FINANCE]) {
    await page.context().clearCookies();
    await signIn(page, person);
    await page.goto("/warehouse/stock");
    await expect(page.getByRole("link", { name: uz.warehouse.stock.newIssue })).toHaveCount(0);
    await page.goto("/warehouse/documents/new?type=ISSUE");
    await expect(page.getByRole("heading", { name: uz.notFoundPage.title })).toBeVisible();
    await expect(page.getByRole("heading", { name: texts.title })).toHaveCount(0);
  }
});
