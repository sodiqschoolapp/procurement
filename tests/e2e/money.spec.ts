import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_PAGE_USERS, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build plan 4.3 (Money tab and money actions), the plan's Playwright line: Finance ticks two Open
// orders of one Manager, records Cash given with the prefill after the dialog that names the 2
// orders and the total (11-screens-and-ux.md rule 6), the Money tab shows the row and the count;
// Finance cancels the action with a reason after the dialog that names its orders, and the count
// goes back; the Manager sees the Money tab with no Record money and no Cancel (08-money-and-
// settlement.md, Money ledger; 03 Permission matrix "Record money given, returned, paid back").
// Run at 375 px and at 1440 px by the two projects; the users read Uzbek.

const t = uz.money;

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

test("Finance records Cash given on two ticked orders, sees it in the Money tab and cancels it; the Manager has no money buttons (08 Money ledger; 11 rule 6)", async ({
  page,
}, info) => {
  const people = E2E_PAGE_USERS[info.project.name as keyof typeof E2E_PAGE_USERS];
  const seeded = await seedOpen(people.manager);
  const [first, second] = seeded.orders as [
    { id: string; number: string },
    { id: string; number: string },
  ];

  await signIn(page, people.finance);
  await page.goto(`/orders?status=PURCHASING&owner=${seeded.ownerId}`);
  const group = page.locator("tbody[data-group]").filter({ hasText: seeded.product });
  await group.locator("input[type=checkbox]").first().check();
  await page.locator("[data-list-bar]").getByRole("button", { name: t.record.button }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();

  // One block for the one Manager, each row prefilled with the order's planned cash.
  await expect(dialog.locator("[data-money-block]")).toHaveCount(1);
  await expect(dialog.locator(`[data-money-row="${first.id}"] input`)).toHaveValue("10000");
  await expect(dialog.locator(`[data-money-row="${second.id}"] input`)).toHaveValue("10000");
  const confirm = dialog.getByRole("button", { name: t.record.confirm, exact: true });
  // The comment is required (plan of 4.1, decided item 9).
  await expect(confirm).toBeDisabled();
  await dialog.locator("[data-money-comment]").fill("Sinov uchun naqd pul");
  await expect(confirm).toBeEnabled();
  // The confirmation names the 2 orders and the total (11 rule 6).
  await expect(dialog).toContainText(/2 ta buyurtma/);
  await expect(dialog).toContainText(/20\s000/);
  expect(await scrollsSideways(page)).toBe(false);
  await confirm.click();
  await expect(page.getByText("2 ta buyurtma uchun pul yozildi.")).toBeVisible();

  // The Money tab: the row and the count.
  await page.goto(`/orders/${first.id}?tab=money`);
  await expect(page.locator("[data-cash-count]")).toHaveAttribute("data-cash-count", "10000");
  const rows = page.locator("[data-money-action]");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(t.kinds.CASH_GIVEN);
  expect(await scrollsSideways(page)).toBe(false);

  // Cancel: the dialog names both orders of the action and its total.
  await rows.first().getByRole("button", { name: t.cancel.button }).click();
  const cancelDialog = page.getByRole("alertdialog");
  await expect(cancelDialog).toContainText(first.number);
  await expect(cancelDialog).toContainText(second.number);
  await expect(cancelDialog).toContainText(/20\s000/);
  await cancelDialog.locator("[data-reason]").fill("Summa xato yozildi");
  await cancelDialog.getByRole("button", { name: t.cancel.button, exact: true }).click();
  await expect(page.locator("[data-cash-count]")).toHaveAttribute("data-cash-count", "0");
  await expect(page.locator("[data-money-action][data-cancelled]")).toHaveCount(1);
  await expect(page.locator("[data-cancel-money]")).toHaveCount(0);

  // The Manager sees the Money tab, with no Record money and no Cancel.
  await page.context().clearCookies();
  await signIn(page, people.manager);
  await page.goto(`/orders/${second.id}?tab=money`);
  await expect(page.locator("[data-money-action]")).toHaveCount(1);
  await expect(page.locator("[data-record-money]")).toHaveCount(0);
  await expect(page.locator("[data-cancel-money]")).toHaveCount(0);
  expect(await scrollsSideways(page)).toBe(false);
});
