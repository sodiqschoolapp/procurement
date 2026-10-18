import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build plan 5.10 (Minimum stock and low stock; plan of 5.10, Tests): the Head sets a minimum on
// Stock on hand, sees "Low" (09-warehouse.md, Low stock), switches "Low stock only" (09 Stock
// screens) and adds the item to a draft with the one button (09 Low stock: "One button adds it as
// a draft order for that branch"). Run at 375 px and at 1440 px by the two projects; the Head
// reads Uzbek. The item's stock of 3 in EA is written straight into the tables, as postMovement()
// writes it.

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

/** A product of EA with 3 on hand and a department of EA to order it for. */
async function seedStock() {
  return withDatabase(async (client) => {
    await client.query("begin");
    try {
      const head = await client.query<{ id: string }>("select id from users where username = $1", [
        E2E_ROLES.HEAD.username,
      ]);
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
      await client.query(
        `insert into departments (branch_id, name, is_active, created_at)
         select id, $1, true, now() from branches where code = 'EA'`,
        [department],
      );
      const name = `Kam ${tag}`;
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
         select id, $1, 'CORRECTION', 3, 0, 3, $2, now() from branches where code = 'EA'`,
        [variantId, head.rows[0]!.id],
      );
      await client.query(
        `insert into stock_balances (branch_id, variant_id, qty, avg_cost, created_at, updated_at)
         select id, $1, 3, 0, now(), now() from branches where code = 'EA'`,
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

test("the Head sets a minimum, sees Low, filters Low stock only and adds the item to a draft (09 Low stock)", async ({
  page,
}) => {
  const seeded = await seedStock();
  await signIn(page, E2E_ROLES.HEAD);

  await page.goto(`/warehouse/stock?q=${encodeURIComponent(seeded.tag)}`);
  const row = page.locator("tr[data-stock-row]").filter({ hasText: seeded.name });
  await expect(row).toHaveCount(1);
  await expect(row.locator("[data-low]")).toHaveCount(0);

  await row.locator("[data-set-minimum]").click();
  const dialog = page.getByRole("alertdialog");
  await dialog.locator("[data-minimum-input]").fill("5");
  await dialog.getByRole("button", { name: uz.warehouse.minimum.save }).click();
  await expect(page.getByText(uz.warehouse.minimum.saved)).toBeVisible();
  await expect(row.locator("[data-minimum]")).toContainText("5");
  await expect(row.locator("[data-low]")).toHaveText(uz.warehouse.low.label);

  await page.locator("[data-low-only]").check();
  await page.getByRole("button", { name: uz.warehouse.stock.find }).click();
  await expect(page).toHaveURL(/low=1/);
  await expect(page.locator("tr[data-stock-row]").filter({ hasText: seeded.name })).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);

  await page
    .locator("tr[data-stock-row]")
    .filter({ hasText: seeded.name })
    .locator("[data-add-to-draft]")
    .click();
  const adding = page.getByRole("alertdialog");
  await adding.locator("[data-draft-department]").selectOption({ label: seeded.department });
  await adding.locator("[data-draft-quantity]").fill("2");
  await adding.getByRole("button", { name: uz.warehouse.addToDraft.confirm }).click();
  await expect(page.getByText(uz.warehouse.addToDraft.added)).toBeVisible();

  const drafts = await withDatabase((client) =>
    client.query<{ planned_qty: string; status: string }>(
      `select o.planned_qty::text as planned_qty, o.status from orders o
       join users u on u.id = o.owner_id
       where o.variant_id = $1 and u.username = $2`,
      [seeded.variantId, E2E_ROLES.HEAD.username],
    ),
  );
  expect(drafts.rows).toEqual([{ planned_qty: "2.000", status: "DRAFT" }]);
});
