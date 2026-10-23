import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";
import { clickDocumentAction, documentAction } from "./document-actions";

// Build plan 5.11 (Write-off). 09-warehouse.md, Other documents, Write-off: "The Manager picks
// items, quantities and a reason from a fixed list plus a comment. Stock changes only after the
// Head approves"; 10 Notifications ("Write-off or correction asked | Head; the decision goes back
// to the Manager"); 11-screens-and-ux.md rule 6. In branch EA of the browser tests: the Manager
// opens the form from Stock on hand, adds 4 of 10, picks a reason, types the comment, confirms;
// the stock stays 10. The Head opens it from the bell, approves after the confirmation, and 6 are
// left; the Manager is told. Run at 375 px (one step at a time) and at 1440 px by the two projects.

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

/** A product of EA with 10 in stock. */
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
      const name = `Chiqarish ${tag}`;
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
      return { tag, name, variantId };
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

const texts = uz.warehouse.writeOff;

async function noSideScroll(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
}

test("a Manager asks to write off 4 of 10, the stock waits; the Head approves from the bell and 6 are left (09 Write-off)", async ({
  page,
}, testInfo) => {
  const phone = testInfo.project.name === "phone-375";
  const seeded = await seedStock();
  await signIn(page, E2E_ROLES.MANAGER);

  await page.goto(`/warehouse/stock?q=${encodeURIComponent(seeded.tag)}`);
  await clickDocumentAction(page, uz.warehouse.stock.writeOff);
  await expect(page).toHaveURL(/\/warehouse\/documents\/new\?type=WRITE_OFF$/);
  await expect(page.getByRole("heading", { level: 1, name: texts.title })).toBeVisible();
  if (phone) await page.getByRole("button", { name: texts.next }).click();

  // The item from the search of the branch's stock, its stock beside it.
  await page.getByLabel(texts.search).fill(seeded.tag);
  await page.locator(`[data-pick="${seeded.variantId}"]`).click();
  const line = page.locator(`[data-write-off-line="${seeded.variantId}"]`);
  await expect(line.locator("[data-in-stock]")).toContainText("10");
  const quantity = line.getByRole("textbox");
  await quantity.fill("11");
  await expect(line).toContainText(texts.moreThanStock);
  await quantity.fill("4");
  await expect(line).not.toContainText(texts.moreThanStock);
  if (phone) {
    await noSideScroll(page);
    await page.getByRole("button", { name: texts.next }).click();
  }

  // The reason and the comment, both required, then the confirmation that states the result.
  await page.getByLabel(texts.reason, { exact: true }).selectOption("DAMAGED");
  await page.getByLabel(texts.comment, { exact: true }).fill("Sinov: suvdan buzilgan");
  await page.getByRole("button", { name: texts.save }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText(texts.confirmAsked);
  await confirm.getByRole("button", { name: texts.confirmAskedButton }).click();
  const saved = page.locator("[data-write-off-saved]");
  await expect(saved).toBeVisible();
  const heading = (await saved.getByRole("heading").textContent()) ?? "";
  const number = /WOF-EA-\d{2}-\d{4,}/.exec(heading)?.[0];
  expect(number).toBeTruthy();

  // Nothing moved while it waits.
  await page.goto(`/warehouse/stock?q=${encodeURIComponent(seeded.tag)}`);
  await expect(page.getByRole("row").filter({ hasText: seeded.name })).toContainText("10");

  // The Head is told, opens it from the bell and approves it.
  await page.context().clearCookies();
  await signIn(page, E2E_ROLES.HEAD);
  await page.goto("/notifications");
  await page.getByText(number!).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(number!);
  await expect(page.locator("[data-document-status]")).toHaveText(
    texts.page.status.PENDING_APPROVAL,
  );
  await noSideScroll(page);
  await page.getByRole("button", { name: texts.page.approve }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: texts.page.approve }).click();
  await expect(page.locator("[data-document-status]")).toHaveText(texts.page.status.POSTED);
  await expect(page.locator("[data-write-off-decision]")).toHaveCount(0);

  await page.goto(`/warehouse/stock?q=${encodeURIComponent(seeded.tag)}`);
  await expect(page.getByRole("row").filter({ hasText: seeded.name })).toContainText("6");

  // The decision goes back to the Manager, who reads the page without the buttons.
  await page.context().clearCookies();
  await signIn(page, E2E_ROLES.MANAGER);
  await page.goto("/notifications");
  await expect(page.getByText(new RegExp(`${number}.*tasdiqlandi`)).first()).toBeVisible();
  await page.getByText(number!).first().click();
  await expect(page.locator("[data-document-status]")).toHaveText(texts.page.status.POSTED);
  await expect(page.getByRole("button", { name: texts.page.approve })).toHaveCount(0);
});

test("the write-off form is Not found for the Principal and Finance, and their Stock on hand has no Write-off (03 matrix: Ask for a write-off)", async ({
  page,
}) => {
  for (const person of [E2E_ROLES.PRINCIPAL, E2E_ROLES.FINANCE]) {
    await page.context().clearCookies();
    await signIn(page, person);
    await page.goto("/warehouse/stock");
    // Shown or folded behind More on a phone: the count is of either (redesign of 22.10.2026).
    await expect(documentAction(page, "WRITE_OFF")).toHaveCount(0);
    await page.goto("/warehouse/documents/new?type=WRITE_OFF");
    await expect(page.getByRole("heading", { name: uz.notFoundPage.title })).toBeVisible();
  }
});
