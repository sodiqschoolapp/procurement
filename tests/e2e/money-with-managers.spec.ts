import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_PAGE_USERS, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build plan 4.9 (Money with managers), the plan's Playwright line: Finance opens Money from the
// menu, sees the Manager holding the cash given on a seeded Open order, opens the block and follows
// the order to its page; the Manager gets "Not found" at /money (08-money-and-settlement.md, Money
// with managers; 11-screens-and-ux.md, Screens: "/money, Finance, Head"). Run at 375 px and at
// 1440 px by the two projects; the users read Uzbek.

const t = uz.money.managers;

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

/** Two Open Cash orders of 10 000 so'm of the owner in EA, of a product of their own. */
async function seedOpen(owner: Person) {
  return withDatabase(async (client) => {
    await client.query("begin");
    try {
      const found = await client.query<{ id: string }>("select id from users where username = $1", [
        owner.username,
      ]);
      const ownerId = found.rows[0]!.id;
      const tag = randomUUID().slice(0, 8);
      const unit = await client.query<{ id: string }>(
        `insert into units (name, short_name, allow_decimal, is_active, created_at)
         values ($1, $2, true, true, now()) returning id`,
        [`O'lchov ${tag}`, `kg${tag}`],
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
        `insert into products (name, type, category_id, unit_id, is_active, has_variants, created_at)
         values ($1, 'GOODS', $2, $3, true, false, now()) returning id`,
        [`Daftar ${tag}`, category.rows[0]!.id, unit.rows[0]!.id],
      );
      const variant = await client.query<{ id: string }>(
        `insert into product_variants (product_id, name, is_default, is_active, created_at)
         values ($1, 'default', true, true, now()) returning id`,
        [product.rows[0]!.id],
      );
      const orders: { id: string; number: string }[] = [];
      for (let at = 0; at < 2; at += 1) {
        const number = `EA-26-${8_000_000 + Math.floor(Math.random() * 999_999)}`;
        const order = await client.query<{ id: string }>(
          `insert into orders (number, branch_id, owner_id, created_by, status, variant_id,
                               department_id, needed_by, planned_qty, planned_price, planned_total,
                               payment_type, stock_at_submit, submitted_at, approved_at, created_at,
                               updated_at)
           select $1, b.id, $2, $2, 'PURCHASING', $3, $4, '2031-05-01', 2, 5000, 10000,
                  'CASH', 0, now(), now(), now(), now()
             from branches b where b.code = 'EA'
           returning id`,
          [number, ownerId, variant.rows[0]!.id, department.rows[0]!.id],
        );
        orders.push({ id: order.rows[0]!.id, number });
      }
      await client.query("commit");
      return { ownerId, product: `Daftar ${tag}`, orders };
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

function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

/** Cash given to the owner on the first of the orders, dated 3 May 2031, as an approval writes it. */
async function giveCash(orderId: string, ownerId: string, finance: Person) {
  await withDatabase(async (client) => {
    const by = await client.query<{ id: string }>("select id from users where username = $1", [
      finance.username,
    ]);
    const action = await client.query<{ id: string }>(
      `insert into money_actions (client_key, manager_id, occurred_on, comment, created_by,
                                  created_at)
       values ($1, $2, '2031-05-03', 'Invented cash', $3, now()) returning id`,
      [randomUUID(), ownerId, by.rows[0]!.id],
    );
    await client.query(
      `insert into money_rows (money_action_id, order_id, kind, amount, created_at)
       values ($1, $2, 'CASH_GIVEN', 37000, now())`,
      [action.rows[0]!.id, orderId],
    );
  });
}

test("Finance opens Money with managers from the menu, opens the Manager's block and follows the order; the Manager gets Not found (08 Money with managers; 11 Screens)", async ({
  page,
}, info) => {
  const people = E2E_PAGE_USERS[info.project.name as keyof typeof E2E_PAGE_USERS];
  const seeded = await seedOpen(people.manager);
  const order = seeded.orders[0]!;
  await giveCash(order.id, seeded.ownerId, people.finance);

  await signIn(page, people.finance);
  await page.locator('a[href="/money"]:visible').first().click();
  await expect(page).toHaveURL(/\/money$/);
  await expect(page.getByRole("heading", { level: 1, name: t.title })).toBeVisible();

  const block = page.locator(`li[data-owner="${seeded.ownerId}"]`);
  await expect(block.locator('[data-figure="held"]')).toBeVisible();
  await expect(block.locator('[data-figure="since"]')).toBeVisible();
  const row = block.locator(`li[data-order="${order.id}"]`);
  await expect(row).toBeHidden();
  await block.locator("summary").click();
  await expect(row).toBeVisible();
  await expect(row).toContainText("37");
  expect(await scrollsSideways(page)).toBe(false);
  await row.getByRole("link", { name: order.number }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}`));

  await page.context().clearCookies();
  await signIn(page, people.manager);
  await expect(page.locator('a[href="/money"]')).toHaveCount(0);
  await page.goto("/money");
  await expect(page.getByRole("heading", { name: uz.notFoundPage.title })).toBeVisible();
});
