import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";
import { clickDocumentAction, documentAction } from "./document-actions";

// Build plan 5.6 (Return from a department). 09-warehouse.md, Other documents: "Pick the
// department, items and quantities; stock goes up. Returning more than that department ever
// received shows a warning and needs a comment"; 11-screens-and-ux.md, Interface per role: Manager
// (phone layouts). The EA Manager opens the form from Stock on hand, picks the department, adds an
// item it received 4 of, types 5 (the warning and the comment rule), then 2, saves, finds 8 in
// stock and the RET number on the item card. Run at 375 px (one step at a time) and at 1440 px by
// the two projects. The stock and the issue are written straight into the tables, as the issue
// action writes them.

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

/** A product of EA with 10 received at 5 000, 4 of them issued to a department of EA. */
async function seedIssued() {
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
      const departmentRow = await client.query<{ id: string }>(
        `insert into departments (branch_id, name, responsible_name, is_active, created_at)
         select id, $1, null, true, now() from branches where code = 'EA' returning id`,
        [department],
      );
      const name = `Qaytarish ${tag}`;
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
      // An issue of 4 to the department; its number is of a year no counter reaches.
      const issueNumber = `ISS-EA-99-${String(parseInt(tag, 16)).padStart(4, "0")}`;
      const document = await client.query<{ id: string }>(
        `insert into stock_documents (number, type, branch_id, department_id, received_by_name,
           doc_date, status, client_key, created_by, created_at)
         select $1, 'ISSUE', id, $2, 'Sinov Mas''ulov', current_date, 'POSTED', $3, $4, now()
         from branches where code = 'EA' returning id`,
        [issueNumber, departmentRow.rows[0]!.id, randomUUID(), userId],
      );
      const line = await client.query<{ id: string }>(
        `insert into stock_document_lines (document_id, variant_id, qty, created_at)
         values ($1, $2, 4, now()) returning id`,
        [document.rows[0]!.id, variantId],
      );
      await client.query(
        `insert into stock_movements (branch_id, variant_id, type, qty_delta, unit_cost,
                                      balance_after, document_line_id, created_by, created_at)
         select id, $1, 'ISSUE', -4, 5000, 6, $2, $3, now() from branches where code = 'EA'`,
        [variantId, line.rows[0]!.id, userId],
      );
      await client.query(
        `insert into stock_balances (branch_id, variant_id, qty, avg_cost, created_at, updated_at)
         select id, $1, 6, 5000, now(), now() from branches where code = 'EA'`,
        [variantId],
      );
      await client.query("commit");
      return { tag, name, department, variantId };
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

const texts = uz.warehouse.return;

test("a Manager takes 2 of 4 back from a department after the over-return warning, and 8 are in stock (09 Other documents, Return)", async ({
  page,
}, testInfo) => {
  const phone = testInfo.project.name === "phone-375";
  const seeded = await seedIssued();
  await signIn(page, E2E_ROLES.MANAGER);

  await page.goto(`/warehouse/stock?q=${encodeURIComponent(seeded.tag)}`);
  await clickDocumentAction(page, uz.warehouse.stock.newReturn);
  await expect(page).toHaveURL(/\/warehouse\/documents\/new\?type=RETURN$/);
  await expect(page.getByRole("heading", { level: 1, name: texts.title })).toBeVisible();

  // Step 1: the department.
  await page
    .getByLabel(texts.department, { exact: true })
    .selectOption({ label: seeded.department });
  if (phone) {
    await expect(page.getByRole("heading", { name: texts.items })).toBeHidden();
    await page.getByRole("button", { name: texts.next }).click();
  }

  // Step 2: the item, with what the department received beside it.
  await page.getByLabel(texts.search).fill(seeded.tag);
  await page.locator(`[data-pick="${seeded.variantId}"]`).click();
  const line = page.locator(`[data-return-line="${seeded.variantId}"]`);
  await expect(line.locator("[data-received]")).toContainText("4");
  const quantity = line.getByRole("textbox");
  await quantity.fill("5");
  await expect(line.locator("[data-over-return]")).toBeVisible();
  if (phone) await page.getByRole("button", { name: texts.next }).click();
  await expect(page.getByLabel(texts.comment, { exact: true })).toBeVisible();
  await expect(page.locator("[data-comment-needed]")).toBeVisible();
  if (phone) await page.getByRole("button", { name: texts.previous }).click();
  await quantity.fill("2");
  await expect(line.locator("[data-over-return]")).toHaveCount(0);
  if (phone) {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
    await page.getByRole("button", { name: texts.next }).click();
  }
  await expect(page.getByLabel(texts.commentOptional, { exact: true })).toBeVisible();

  // Step 3: save.
  await page.getByRole("button", { name: texts.save }).click();
  const saved = page.locator("[data-return-saved]");
  await expect(saved).toBeVisible();
  const heading = (await saved.getByRole("heading").textContent()) ?? "";
  const number = /RET-EA-\d{2}-\d{4,}/.exec(heading)?.[0];
  expect(number).toBeTruthy();

  await page.goto(`/warehouse/stock?q=${encodeURIComponent(seeded.tag)}`);
  await expect(page.getByRole("row").filter({ hasText: seeded.name })).toContainText("8");
  await page.getByRole("link", { name: seeded.name }).click();
  const returned = page.getByRole("row").filter({ hasText: uz.warehouse.item.types.RETURN });
  await expect(returned).toContainText(number!);
  await expect(returned).toContainText("+2");
});

test("the return form is Not found for the Principal and Finance, and their Stock on hand has no New return (03 matrix: Issue, return, transfer stock)", async ({
  page,
}) => {
  for (const person of [E2E_ROLES.PRINCIPAL, E2E_ROLES.FINANCE]) {
    await page.context().clearCookies();
    await signIn(page, person);
    await page.goto("/warehouse/stock");
    // Shown or folded behind More on a phone: the count is of either (redesign of 22.10.2026).
    await expect(documentAction(page, "RETURN")).toHaveCount(0);
    await page.goto("/warehouse/documents/new?type=RETURN");
    await expect(page.getByRole("heading", { name: uz.notFoundPage.title })).toBeVisible();
    await expect(page.getByRole("heading", { name: texts.title })).toHaveCount(0);
  }
});
