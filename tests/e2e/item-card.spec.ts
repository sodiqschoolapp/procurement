import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build plan 5.3 (Item card), Done when: "the card of a purchased item lists the receipt with a
// working link" (09-warehouse.md, Stock screens: Item card, "a link to the source document or
// order"; plan of 5.3, decided item 5: the order's Purchases tab). The Principal of EA opens the
// item from Stock on hand, sees the receipt with its running balance and follows its link to the
// order. Run at 375 px and at 1440 px by the two projects; the Principal is shared with other
// specs that read Uzbek. The purchase, its receipt movement and the balance are written straight
// into the tables, as postMovement() writes them.

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

/** An Open order of EA owned by the EA Manager, one purchase of 3 at 5 000 and its receipt. */
async function seedReceipt() {
  return withDatabase(async (client) => {
    await client.query("begin");
    try {
      const found = await client.query<{ id: string }>("select id from users where username = $1", [
        E2E_ROLES.MANAGER.username,
      ]);
      const ownerId = found.rows[0]!.id;
      const tag = randomUUID().slice(0, 8);
      const unit = await client.query<{ id: string }>(
        `insert into units (name, short_name, allow_decimal, is_active, created_at)
         values ($1, $2, false, true, now()) returning id`,
        [`O'lchov ${tag}`, `c${tag}`],
      );
      const category = await client.query<{ id: string }>(
        `insert into categories (name, is_active, created_at) values ($1, true, now()) returning id`,
        [`Toifa ${tag}`],
      );
      const department = await client.query<{ id: string }>(
        `insert into departments (branch_id, name, is_active, created_at)
         select id, $1, true, now() from branches where code = 'EA' returning id`,
        [`Bo'lim ${tag}`],
      );
      const name = `Karta ${tag}`;
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
      const number = `EA-26-${8_000_000 + Math.floor(Math.random() * 999_999)}`;
      const order = await client.query<{ id: string; branch_id: string }>(
        `insert into orders (number, branch_id, owner_id, created_by, status, variant_id,
                             department_id, needed_by, planned_qty, planned_price, planned_total,
                             payment_type, stock_at_submit, submitted_at, approved_at, created_at,
                             updated_at)
         select $1, b.id, $2, $2, 'PURCHASING', $3, $4, '2031-05-01', 3, 5000, 15000,
                'CARD', 0, now(), now(), now(), now()
           from branches b where b.code = 'EA'
         returning id, branch_id`,
        [number, ownerId, variantId, department.rows[0]!.id],
      );
      const { id: orderId, branch_id: branchId } = order.rows[0]!;
      const trip = await client.query<{ id: string }>(
        `insert into purchase_trips (client_key, branch_id, purchased_on, payment_type,
                                     created_by, created_at)
         values ($1, $2, (now() at time zone 'Asia/Tashkent')::date, 'CARD', $3, now())
         returning id`,
        [randomUUID(), branchId, ownerId],
      );
      const purchase = await client.query<{ id: string }>(
        `insert into purchases (trip_id, order_id, branch_id, variant_id, qty, unit_price,
                                created_by, created_at)
         values ($1, $2, $3, $4, 3, 5000, $5, now()) returning id`,
        [trip.rows[0]!.id, orderId, branchId, variantId, ownerId],
      );
      await client.query(
        `insert into stock_movements (branch_id, variant_id, type, qty_delta, unit_cost,
                                      balance_after, purchase_id, created_by, created_at)
         values ($1, $2, 'RECEIPT', 3, 5000, 3, $3, $4, now())`,
        [branchId, variantId, purchase.rows[0]!.id, ownerId],
      );
      await client.query(
        `insert into stock_balances (branch_id, variant_id, qty, avg_cost, created_at, updated_at)
         values ($1, $2, 3, 5000, now(), now())`,
        [branchId, variantId],
      );
      await client.query("commit");
      return { tag, name, orderId, number };
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

test("the card of a purchased item lists the receipt with its balance, and its link opens the order's Purchases tab (09 Stock screens: Item card)", async ({
  page,
}) => {
  const seeded = await seedReceipt();
  await signIn(page, E2E_ROLES.PRINCIPAL);

  // From Stock on hand, the product name opens the card in the row's branch (progress 5.2).
  await page.goto(`/warehouse/stock?q=${encodeURIComponent(seeded.tag)}`);
  await page.getByRole("link", { name: seeded.name }).click();
  await expect(page).toHaveURL(/\/warehouse\/items\/[0-9a-f-]+\?branch=/);
  await expect(page.getByRole("heading", { name: seeded.name })).toBeVisible();

  const receipt = page.getByRole("row").filter({ hasText: uz.warehouse.item.types.RECEIPT });
  await expect(receipt).toHaveCount(1);
  await expect(receipt).toContainText("+3");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);

  const link = receipt.getByRole("link", {
    name: uz.warehouse.item.order.replace("{number}", seeded.number),
  });
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/orders/${seeded.orderId}\\?tab=purchases$`));
  await expect(page.getByText(seeded.number).first()).toBeVisible();
});
