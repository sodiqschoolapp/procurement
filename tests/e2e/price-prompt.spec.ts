import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build plan 3.10, the price prompt (04-catalogs.md rule 4: "When recent purchases differ from the
// reference price by more than 20%, the Head sees a prompt to update it in one click"; Decided
// ahead 2; plan of 3.10, decided items 10 and 11). A product priced 10 000 so'm and two purchase
// records of 13 000 in branch EA, yesterday and today, are written straight into the tables; the
// Head opens /prices, clicks "Set …" once, and the price is the average. Every name is new on
// every run, so the two projects never meet.

const p = uz.prices;

async function seedPrompt(): Promise<{ name: string; variantId: string }> {
  const client = new pg.Client(
    connectionOptions(e2eDatabaseUrl(serverDatabaseUrl()), process.env.DATABASE_CA_CERT),
  );
  await client.connect();
  try {
    await client.query("begin");
    const head = await client.query<{ id: string }>("select id from users where username = $1", [
      E2E_ROLES.HEAD.username,
    ]);
    const headId = head.rows[0]!.id;
    const tag = randomUUID().slice(0, 8);
    const name = `Taklif daftar ${tag}`;
    const unit = await client.query<{ id: string }>(
      `insert into units (name, short_name, allow_decimal, is_active, created_at)
       values ($1, $2, false, true, now()) returning id`,
      [`O'lchov ${tag}`, `t${tag}`],
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
    const product = await client.query<{ id: string }>(
      `insert into products (name, type, category_id, unit_id, reference_price, is_active,
                             has_variants, created_at)
       values ($1, 'GOODS', $2, $3, 10000, true, false, now()) returning id`,
      [name, category.rows[0]!.id, unit.rows[0]!.id],
    );
    const variant = await client.query<{ id: string }>(
      `insert into product_variants (product_id, name, is_default, reference_price, is_active,
                                     created_at)
       values ($1, 'default', true, 10000, true, now()) returning id`,
      [product.rows[0]!.id],
    );
    const variantId = variant.rows[0]!.id;
    // The current price is the newest HEAD row (migration 0014, price_recorded).
    await client.query(
      `insert into price_history (variant_id, price, source, set_by, created_at)
       values ($1, 10000, 'HEAD', $2, now())`,
      [variantId, headId],
    );
    for (const daysAgo of [1, 0]) {
      const number = `EA-90-${String(Math.floor(Math.random() * 900_000) + 100_000)}`;
      const order = await client.query<{ id: string; branch_id: string }>(
        `insert into orders (number, branch_id, owner_id, created_by, status, variant_id,
                             department_id, needed_by, planned_qty, planned_price, planned_total,
                             payment_type, submitted_at, approved_at, created_at, updated_at)
         select $4, b.id, $1, $1, 'PURCHASING', $2, $3, '2031-05-01', 1, 10000, 10000, 'CARD',
                now(), now(), now(), now()
           from branches b where b.code = 'EA'
         returning id, branch_id`,
        [headId, variantId, department.rows[0]!.id, number],
      );
      const { id: orderId, branch_id: branchId } = order.rows[0]!;
      const trip = await client.query<{ id: string }>(
        `insert into purchase_trips (client_key, branch_id, purchased_on, payment_type, created_by,
                                     created_at)
         values ($1, $2, ((now() at time zone 'Asia/Tashkent')::date - $3::int), 'CARD', $4, now())
         returning id`,
        [randomUUID(), branchId, daysAgo, headId],
      );
      await client.query(
        `insert into purchases (trip_id, order_id, branch_id, variant_id, qty, unit_price,
                                created_by, created_at)
         values ($1, $2, $3, $4, 1, 13000, $5, now())`,
        [trip.rows[0]!.id, orderId, branchId, variantId, headId],
      );
    }
    await client.query("commit");
    return { name, variantId };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(uz.login.username).fill(E2E_ROLES.HEAD.username);
  await page.getByLabel(uz.login.password).fill(E2E_ROLES.HEAD.password);
  await page.getByRole("button", { name: uz.login.submit }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("the Head sees the price prompt on /prices and sets the average in one click (04 rule 4)", async ({
  page,
}) => {
  const { name, variantId } = await seedPrompt();
  await signIn(page);
  await page.goto("/prices");

  await expect(page.getByRole("heading", { name: p.prompt.title, level: 2 })).toBeVisible();
  const row = page.locator("[data-price-prompt]:visible").filter({ hasText: name });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("+30%");
  const sizes = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    screen: document.documentElement.clientWidth,
  }));
  expect(sizes.content).toBeLessThanOrEqual(sizes.screen);

  await row.getByRole("button").click();
  await expect(page.getByText(p.saved).first()).toBeVisible();
  await expect(page.locator("[data-price-prompt]").filter({ hasText: name })).toHaveCount(0);

  await page.goto(`/prices/${variantId}`);
  await expect(page.getByText(/13\s000/).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: p.sources.HEAD }).first()).toBeVisible();
});
