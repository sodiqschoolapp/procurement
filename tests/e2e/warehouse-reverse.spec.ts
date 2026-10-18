import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build plan 5.7 (Reverse a document): the EA Manager reverses their own issue from the item card
// with a reason (09-warehouse.md, Movement types, last paragraph; Issue to a department 3;
// 11-screens-and-ux.md rule 6: "ask for confirmation and state the result"; plan of 5.7). The
// dialog lists the line, Confirm waits for a reason of 5, and afterwards the issue carries
// "Reversed" and the stock is back. Run at 375 px and at 1440 px by the two projects. A receipt
// of 5 and an issue of 2 are written straight into the tables, as createDocument() and
// postMovement() write them.

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

/** An item of EA with 5 received and 2 issued to a department by the EA Manager. */
async function seedIssue() {
  return withDatabase(async (client) => {
    await client.query("begin");
    try {
      const found = await client.query<{ id: string }>("select id from users where username = $1", [
        E2E_ROLES.MANAGER.username,
      ]);
      const managerId = found.rows[0]!.id;
      const tag = randomUUID().slice(0, 8);
      const unit = await client.query<{ id: string }>(
        `insert into units (name, short_name, allow_decimal, is_active, created_at)
         values ($1, $2, false, true, now()) returning id`,
        [`O'lchov ${tag}`, `r${tag}`],
      );
      const category = await client.query<{ id: string }>(
        `insert into categories (name, is_active, created_at) values ($1, true, now()) returning id`,
        [`Toifa ${tag}`],
      );
      const department = await client.query<{ id: string; branch_id: string }>(
        `insert into departments (branch_id, name, is_active, created_at)
         select id, $1, true, now() from branches where code = 'EA' returning id, branch_id`,
        [`Bo'lim ${tag}`],
      );
      const { id: departmentId, branch_id: branchId } = department.rows[0]!;
      const name = `Qaytar ${tag}`;
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
         values ($1, $2, 'RECEIPT', 5, 4000, 5, $3, now())`,
        [branchId, variantId, managerId],
      );
      const number = `ISS-EA-26-${9_000_000 + Math.floor(Math.random() * 999_999)}`;
      const document = await client.query<{ id: string }>(
        `insert into stock_documents (number, type, branch_id, department_id, received_by_name,
                                      doc_date, status, client_key, created_by, created_at)
         values ($1, 'ISSUE', $2, $3, 'Sinov Qabulqiluvchi',
                 (now() at time zone 'Asia/Tashkent')::date, 'POSTED', $4, $5, now())
         returning id`,
        [number, branchId, departmentId, randomUUID(), managerId],
      );
      const line = await client.query<{ id: string }>(
        `insert into stock_document_lines (document_id, variant_id, qty, created_at)
         values ($1, $2, 2, now()) returning id`,
        [document.rows[0]!.id, variantId],
      );
      await client.query(
        `insert into stock_movements (branch_id, variant_id, type, qty_delta, unit_cost,
                                      balance_after, document_line_id, created_by, created_at)
         values ($1, $2, 'ISSUE', -2, 4000, 3, $3, $4, now())`,
        [branchId, variantId, line.rows[0]!.id, managerId],
      );
      await client.query(
        `insert into stock_balances (branch_id, variant_id, qty, avg_cost, created_at, updated_at)
         values ($1, $2, 3, 4000, now(), now())`,
        [branchId, variantId],
      );
      await client.query("commit");
      return { name, number, variantId, branchId };
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

test("the Manager reverses their issue from the item card with a reason: the issue shows Reversed and the stock is back (09 Issue to a department 3)", async ({
  page,
}) => {
  const seeded = await seedIssue();
  await signIn(page, E2E_ROLES.MANAGER);
  await page.goto(`/warehouse/items/${seeded.variantId}?branch=${seeded.branchId}`);
  await expect(page.getByRole("heading", { name: seeded.name })).toBeVisible();

  const issueRow = page
    .getByRole("row")
    .filter({ hasText: uz.warehouse.item.types.ISSUE })
    .filter({ hasText: seeded.number });
  await issueRow.getByRole("button", { name: uz.warehouse.reverse.button }).click();

  const dialog = page.getByRole("alertdialog");
  await expect(
    dialog.getByText(uz.warehouse.reverse.title.replace("{number}", seeded.number)),
  ).toBeVisible();
  await expect(dialog.getByText(uz.warehouse.reverse.result.ISSUE)).toBeVisible();
  await expect(dialog.locator("[data-reverse-lines] li")).toHaveCount(1);
  const confirm = dialog.getByRole("button", { name: uz.warehouse.reverse.button });
  await expect(confirm).toBeDisabled();
  await dialog.locator("[data-reason]").fill("Xato bo'lim");
  await expect(confirm).toBeEnabled();
  await confirm.click();

  await expect(
    page.getByText(uz.warehouse.reverse.done.replace("{number}", seeded.number)),
  ).toBeVisible();
  await expect(issueRow.locator("[data-reversed]")).toHaveText(uz.warehouse.item.reversed);
  await expect(issueRow.getByRole("button", { name: uz.warehouse.reverse.button })).toHaveCount(0);
  // The movement cell, exactly: "Storno" is also the start of the label "Storno qilingan".
  const reversal = page.getByRole("row").filter({
    has: page.getByRole("cell", { name: uz.warehouse.item.types.REVERSAL, exact: true }),
  });
  await expect(reversal).toHaveCount(1);
  await expect(reversal).toContainText("+2");
  await expect(reversal).toContainText("5");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
});
