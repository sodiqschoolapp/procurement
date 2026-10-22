import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";
import { clickDocumentAction, documentAction } from "./document-actions";

// Build plan 7.1 (Transfer: send). 09-warehouse.md, Other documents, Transfer: "The sender picks
// the other branch and the items; stock leaves the sender at once and the transfer shows 'In
// transit'"; 11-screens-and-ux.md rule 6 (the confirmation states the result). In branch EA of
// the browser tests: the Manager opens the form from Stock on hand, picks a receiving branch made
// for this run, adds 4 of 10, sends through the confirmation; the transfer's page shows In transit
// and 6 are left in EA. Build plan 7.2 (Transfer: receive): a transfer of 10 from a branch made
// for this run arrives at EA short; the Manager of EA receives 8 through the confirmation, and the
// page shows Received with 2 short. Build plan 7.4c: the sent transfer is cancelled with a reason
// and its 4 come back to EA. Run at 375 px (one step at a time) and at 1440 px by the two
// projects.

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

/** A product of EA with 10 in stock, and a receiving branch of its own for this run. */
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
      const name = `Yuborish ${tag}`;
      const code = Array.from(
        randomUUID()
          .replace(/[^a-f]/g, "")
          .slice(0, 4),
      )
        .map((letter) => letter.toUpperCase())
        .join("")
        .padEnd(4, "Z");
      const receiving = await client.query<{ id: string }>(
        `insert into branches (name, code, address, is_active, created_at)
         values ($1, $2, 'Sinov ko''chasi 2', true, now()) returning id`,
        [`Qabul filiali ${tag}`, code],
      );
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
      return { tag, name, variantId, toBranchId: receiving.rows[0]!.id, toCode: code };
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

const texts = uz.warehouse.transfer;

async function noSideScroll(page: Page): Promise<void> {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
}

test("a Manager sends 4 of 10 to another branch through the confirmation; the transfer is In transit and 6 are left (09 Transfer)", async ({
  page,
}, testInfo) => {
  const phone = testInfo.project.name === "phone-375";
  const seeded = await seedStock();
  await signIn(page, E2E_ROLES.MANAGER);

  await page.goto(`/warehouse/stock?q=${encodeURIComponent(seeded.tag)}`);
  await clickDocumentAction(page, uz.warehouse.stock.transfer);
  await expect(page).toHaveURL(/\/warehouse\/documents\/new\?type=TRANSFER$/);
  await expect(page.getByRole("heading", { level: 1, name: texts.title })).toBeVisible();

  // The receiving branch: any other active branch, the one made for this run among them.
  await page.getByLabel(texts.toBranch, { exact: true }).selectOption(seeded.toBranchId);
  if (phone) {
    await noSideScroll(page);
    await page.getByRole("button", { name: texts.next }).click();
  }

  await page.getByLabel(texts.search).fill(seeded.tag);
  await page.locator(`[data-pick="${seeded.variantId}"]`).click();
  const line = page.locator(`[data-transfer-line="${seeded.variantId}"]`);
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

  // Send cannot be undone: the confirmation names the count, the receiving branch and the result.
  await page.getByRole("button", { name: texts.save, exact: true }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText(seeded.toCode);
  await expect(confirm).toContainText("1 ta");
  await expect(confirm).toContainText("EA");
  await confirm.getByRole("button", { name: texts.confirmButton }).click();
  const saved = page.locator("[data-transfer-saved]");
  await expect(saved).toBeVisible();
  const heading = (await saved.getByRole("heading").textContent()) ?? "";
  expect(heading).toMatch(/TRF-EA-\d{2}-\d{4,}/);

  await saved.getByRole("link", { name: texts.open }).click();
  await expect(page.locator("[data-document-status]")).toHaveText(
    uz.warehouse.documents.status.IN_TRANSIT,
  );
  await expect(page.locator('[data-field="toBranch"]')).toContainText(seeded.toCode);
  await expect(page.locator("[data-transfer-in-transit]")).toBeVisible();
  await noSideScroll(page);

  const documentUrl = page.url();

  // The stock left EA at once.
  await page.goto(`/warehouse/stock?q=${encodeURIComponent(seeded.tag)}`);
  await expect(page.getByRole("row").filter({ hasText: seeded.name })).toContainText("6");

  // Build plan 7.4c: the sender cancels it with a reason, and the 4 come back to EA.
  const cancel = uz.warehouse.cancelTransfer;
  await page.goto(documentUrl);
  await page.getByRole("button", { name: cancel.button, exact: true }).click();
  const asked = page.getByRole("alertdialog");
  await expect(asked).toContainText(seeded.toCode);
  const done = asked.getByRole("button", { name: cancel.button, exact: true });
  await asked.getByRole("textbox").fill("Yoq");
  await expect(done).toBeDisabled();
  await asked.getByRole("textbox").fill("Yuk mashinasi kelmadi");
  await noSideScroll(page);
  await done.click();
  await expect(page.locator("[data-document-status]")).toHaveText(
    uz.warehouse.documents.status.CANCELLED,
  );
  await expect(page.locator('[data-field="decisionReason"]')).toContainText(
    "Yuk mashinasi kelmadi",
  );
  await expect(page.locator("[data-transfer-cancelled]")).toBeVisible();
  await expect(page.getByRole("button", { name: cancel.button, exact: true })).toHaveCount(0);
  await noSideScroll(page);
  await page.goto(`/warehouse/stock?q=${encodeURIComponent(seeded.tag)}`);
  await expect(page.getByRole("row").filter({ hasText: seeded.name })).toContainText("10");
});

test("the transfer form is Not found for the Principal and Finance, and their Stock on hand has no Transfer (03 matrix: Issue, return, transfer stock)", async ({
  page,
}) => {
  for (const person of [E2E_ROLES.PRINCIPAL, E2E_ROLES.FINANCE]) {
    await page.context().clearCookies();
    await signIn(page, person);
    await page.goto("/warehouse/stock");
    // Shown or folded behind More on a phone: the count is of either (redesign of 22.10.2026).
    await expect(documentAction(page, "TRANSFER")).toHaveCount(0);
    await page.goto("/warehouse/documents/new?type=TRANSFER");
    await expect(page.getByRole("heading", { name: uz.notFoundPage.title })).toBeVisible();
  }
});

/** An In-transit transfer of 10 to EA from a branch made for this run, as sendTransfer writes it. */
async function seedInTransit() {
  return withDatabase(async (client) => {
    await client.query("begin");
    try {
      const found = await client.query<{ id: string }>("select id from users where username = $1", [
        E2E_ROLES.MANAGER.username,
      ]);
      const userId = found.rows[0]!.id;
      const tag = randomUUID().slice(0, 8);
      const code = Array.from(
        randomUUID()
          .replace(/[^a-f]/g, "")
          .slice(0, 4),
      )
        .map((letter) => letter.toUpperCase())
        .join("")
        .padEnd(4, "Z");
      const unit = await client.query<{ id: string }>(
        `insert into units (name, short_name, allow_decimal, is_active, created_at)
         values ($1, $2, false, true, now()) returning id`,
        [`O'lchov ${tag}`, `d${tag}`],
      );
      const category = await client.query<{ id: string }>(
        `insert into categories (name, is_active, created_at) values ($1, true, now()) returning id`,
        [`Toifa ${tag}`],
      );
      const sending = await client.query<{ id: string }>(
        `insert into branches (name, code, address, is_active, created_at)
         values ($1, $2, 'Sinov ko''chasi 3', true, now()) returning id`,
        [`Yuboruvchi filial ${tag}`, code],
      );
      const fromId = sending.rows[0]!.id;
      const product = await client.query<{ id: string }>(
        `insert into products (name, type, category_id, unit_id, is_active, has_variants, created_at)
         values ($1, 'GOODS', $2, $3, true, false, now()) returning id`,
        [`Qabul ${tag}`, category.rows[0]!.id, unit.rows[0]!.id],
      );
      const variant = await client.query<{ id: string }>(
        `insert into product_variants (product_id, name, is_default, is_active, created_at)
         values ($1, 'default', true, true, now()) returning id`,
        [product.rows[0]!.id],
      );
      const variantId = variant.rows[0]!.id;
      const number = `TRF-${code}-31-0001`;
      const document = await client.query<{ id: string }>(
        `insert into stock_documents (number, type, branch_id, to_branch_id, doc_date, status,
                                      client_key, created_by, created_at)
         select $1, 'TRANSFER', $2, id, current_date, 'IN_TRANSIT', $3, $4, now()
         from branches where code = 'EA' returning id`,
        [number, fromId, randomUUID(), userId],
      );
      const documentId = document.rows[0]!.id;
      const line = await client.query<{ id: string }>(
        `insert into stock_document_lines (document_id, variant_id, qty, created_at)
         values ($1, $2, 10, now()) returning id`,
        [documentId, variantId],
      );
      await client.query(
        `insert into stock_movements (branch_id, variant_id, type, qty_delta, unit_cost,
                                      balance_after, created_by, created_at)
         values ($1, $2, 'RECEIPT', 10, 5000, 10, $3, now())`,
        [fromId, variantId, userId],
      );
      await client.query(
        `insert into stock_movements (branch_id, variant_id, type, qty_delta, unit_cost,
                                      balance_after, document_line_id, created_by, created_at)
         values ($1, $2, 'TRANSFER_OUT', -10, 5000, 0, $3, $4, now())`,
        [fromId, variantId, line.rows[0]!.id, userId],
      );
      await client.query(
        `insert into stock_balances (branch_id, variant_id, qty, avg_cost, created_at, updated_at)
         values ($1, $2, 0, 0, now(), now())`,
        [fromId, variantId],
      );
      await client.query("commit");
      return { documentId, number, lineId: line.rows[0]!.id, fromCode: code };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

test("the receiving Manager receives 8 of 10 through the confirmation; the transfer is Received with 2 short (09 Transfer; 16 phase 7 check)", async ({
  page,
}) => {
  const seeded = await seedInTransit();
  const receive = uz.warehouse.documents.receive;
  await signIn(page, E2E_ROLES.MANAGER);

  await page.goto(`/warehouse/documents/${seeded.documentId}`);
  await expect(page.locator("[data-document-status]")).toHaveText(
    uz.warehouse.documents.status.IN_TRANSIT,
  );
  const form = page.locator("[data-receive-transfer]");
  await expect(form).toBeVisible();
  const quantity = form.locator(`[data-receive-line="${seeded.lineId}"]`).getByRole("textbox");
  await expect(quantity).toHaveValue("10");
  await quantity.fill("11");
  await expect(form).toContainText(uz.errors.field.aboveSent);
  await expect(form.getByRole("button", { name: receive.confirm })).toBeDisabled();
  await quantity.fill("8");
  await expect(form).not.toContainText(uz.errors.field.aboveSent);
  await noSideScroll(page);

  // Receiving cannot be undone here: the confirmation names the shortage and where it goes.
  await form.getByRole("button", { name: receive.confirm }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText(seeded.fromCode);
  await expect(confirm).toContainText("EA");
  await confirm.getByRole("button", { name: receive.confirm }).click();

  await expect(page.locator("[data-document-status]")).toHaveText(
    uz.warehouse.documents.status.RECEIVED,
  );
  await expect(page.locator("[data-receive-transfer]")).toHaveCount(0);
  const row = page.locator(`[data-document-line="${seeded.lineId}"]`);
  await expect(row).toContainText("10");
  await expect(row).toContainText("8");
  await expect(row).toContainText("2");
  await expect(page.locator('[data-field="decidedBy"]')).toBeVisible();
  await noSideScroll(page);
});
