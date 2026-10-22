import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build plan 5.12 (Warehouse documents list), Done when, by hand: "filter to the issues of one
// department". 09-warehouse.md, Stock screens: Documents ("with filters by type, date and
// department") and Item card ("a link to the source document"); 11-screens-and-ux.md, Screens:
// "Warehouse documents | All", rule 8 (filters stay in the address); plan of 5.12, decided items 3
// and 11. In branch EA of the browser tests: one item with two issues, to two departments. The
// Manager goes from Stock on hand to Documents by the tab, filters to the issues of one
// department, opens its issue, and reaches the same page from the item card's number. Run at
// 375 px and at 1440 px by the two projects.

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

/** An invented number of the issue form: digits no other run holds. */
const issueNumber = () => `ISS-EA-31-${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

/** A product of EA with 10 received, and one issue of 1 to each of two new departments. */
async function seedIssues() {
  return withDatabase(async (client) => {
    await client.query("begin");
    try {
      const found = await client.query<{ id: string }>("select id from users where username = $1", [
        E2E_ROLES.MANAGER.username,
      ]);
      const userId = found.rows[0]!.id;
      const branch = await client.query<{ id: string }>(
        "select id from branches where code = 'EA'",
      );
      const branchId = branch.rows[0]!.id;
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
      const product = await client.query<{ id: string }>(
        `insert into products (name, type, category_id, unit_id, is_active, has_variants, created_at)
         values ($1, 'GOODS', $2, $3, true, false, now()) returning id`,
        [`Hujjat ${tag}`, category.rows[0]!.id, unit.rows[0]!.id],
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
         values ($1, $2, 'RECEIPT', 10, 5000, 10, $3, now())`,
        [branchId, variantId, userId],
      );
      const issues = [];
      for (const [index, name] of [`Fizika ${tag}`, `Sport ${tag}`].entries()) {
        const department = await client.query<{ id: string }>(
          `insert into departments (branch_id, name, is_active, created_at)
           values ($1, $2, true, now()) returning id`,
          [branchId, name],
        );
        const number = issueNumber();
        const document = await client.query<{ id: string }>(
          `insert into stock_documents (number, type, branch_id, department_id, received_by_name,
             doc_date, status, client_key, created_by, created_at)
           values ($1, 'ISSUE', $2, $3, 'Sinov Qabulqiluvchi',
             (now() at time zone 'Asia/Tashkent')::date, 'POSTED', $4, $5, now())
           returning id`,
          [number, branchId, department.rows[0]!.id, randomUUID(), userId],
        );
        const line = await client.query<{ id: string }>(
          `insert into stock_document_lines (document_id, variant_id, qty, created_at)
           values ($1, $2, 1, now()) returning id`,
          [document.rows[0]!.id, variantId],
        );
        await client.query(
          `insert into stock_movements (branch_id, variant_id, type, qty_delta, unit_cost,
                                        balance_after, document_line_id, created_by, created_at)
           values ($1, $2, 'ISSUE', -1, 5000, $3, $4, $5, now())`,
          [branchId, variantId, 9 - index, line.rows[0]!.id, userId],
        );
        issues.push({ number, id: document.rows[0]!.id, departmentId: department.rows[0]!.id });
      }
      await client.query(
        `insert into stock_balances (branch_id, variant_id, qty, avg_cost, created_at, updated_at)
         values ($1, $2, 8, 5000, now(), now())`,
        [branchId, variantId],
      );
      await client.query("commit");
      return { branchId, variantId, science: issues[0]!, sport: issues[1]! };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#username").fill(E2E_ROLES.MANAGER.username);
  await page.locator("#password").fill(E2E_ROLES.MANAGER.password);
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

const texts = uz.warehouse.documents;

test("a Manager filters the documents to the issues of one department, opens one, and reaches it from the item card (09 Stock screens: Documents)", async ({
  page,
}) => {
  const seeded = await seedIssues();
  await signIn(page);

  await page.goto("/warehouse/stock");
  await page
    .getByRole("navigation", { name: texts.tabs.label })
    .getByRole("link", {
      name: texts.tabs.documents,
    })
    .click();
  await expect(page).toHaveURL(/\/warehouse\/documents$/);
  await expect(page.getByRole("heading", { level: 1, name: texts.title })).toBeVisible();
  await noSideScroll(page);

  // On a phone the filters fold behind Filters (redesign of 22.10.2026).
  if (test.info().project.name === "phone-375") await page.locator("[data-filter-toggle]").click();
  await page.locator("[data-filter-type]").selectOption("ISSUE");
  await page.locator("[data-filter-department]").selectOption(seeded.science.departmentId);
  await page.getByRole("button", { name: texts.find }).click();
  await expect(page).toHaveURL(new RegExp(`type=ISSUE.*department=${seeded.science.departmentId}`));
  await expect(page.locator(`[data-document-row="${seeded.science.number}"]`)).toBeVisible();
  await expect(page.locator(`[data-document-row="${seeded.sport.number}"]`)).toHaveCount(0);
  await expect(page.locator("[data-document-type]").first()).toHaveText(texts.types.ISSUE);
  await noSideScroll(page);

  await page.getByRole("link", { name: seeded.science.number }).click();
  await expect(page).toHaveURL(new RegExp(`/warehouse/documents/${seeded.science.id}$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText(seeded.science.number);
  await expect(page.locator('[data-field="receivedBy"]')).toContainText("Sinov Qabulqiluvchi");
  await noSideScroll(page);

  // The item card's number is a link to the same page (decided item 3).
  await page.goto(`/warehouse/items/${seeded.variantId}?branch=${seeded.branchId}`);
  await page.getByRole("link", { name: seeded.science.number }).click();
  await expect(page).toHaveURL(new RegExp(`/warehouse/documents/${seeded.science.id}$`));
});
