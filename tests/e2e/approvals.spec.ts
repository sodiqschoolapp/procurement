import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_PAGE_USERS, E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build plan 2.10 (Approvals), the plan's Playwright line: the Head ticks two orders and approves
// them; the stepper moves to the Principal; stock at submit and stock now are shown; the owner
// (a Manager) has no Approve button (06-approval-workflow.md, Allowed moves: Approve; rules 8,
// 10; 11-screens-and-ux.md, Order list layout 4, Order page layout 4, rule 6). The Head is shared
// with other specs that read Uzbek, so this one reads the Uzbek texts and never changes his
// language. The orders are written submitted straight into the table, each project with its own
// product, so the other project's run never shows in the filtered list.

const t = uz.orders;

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

/**
 * Two orders of the owner at Waiting for Head in EA, 3 in stock when submitted and 7.5 now.
 * Returns the owner's id, the product's name and the order ids.
 */
async function seedWaiting(owner: Person) {
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
        [`Un ${tag}`, category.rows[0]!.id, unit.rows[0]!.id],
      );
      const variant = await client.query<{ id: string }>(
        `insert into product_variants (product_id, name, is_default, is_active, created_at)
         values ($1, 'default', true, true, now()) returning id`,
        [product.rows[0]!.id],
      );
      await client.query(
        `insert into stock_balances (branch_id, variant_id, qty, created_at, updated_at)
         select id, $1, 7.5, now(), now() from branches where code = 'EA'`,
        [variant.rows[0]!.id],
      );
      const ids: string[] = [];
      for (let at = 0; at < 2; at += 1) {
        // A number far above any the run's own submits reach (05 Order number 2).
        const number = `EA-26-${8_000_000 + Math.floor(Math.random() * 999_999)}`;
        const order = await client.query<{ id: string }>(
          `insert into orders (number, branch_id, owner_id, created_by, status, variant_id,
                               department_id, needed_by, planned_qty, planned_price, planned_total,
                               payment_type, stock_at_submit, submitted_at, created_at, updated_at)
           select $1, b.id, $2, $2, 'PENDING_HEAD', $3, $4, '2031-05-01', 2, 5000, 10000,
                  'CASH', 3, now(), now(), now()
             from branches b where b.code = 'EA'
           returning id`,
          [number, ownerId, variant.rows[0]!.id, department.rows[0]!.id],
        );
        ids.push(order.rows[0]!.id);
      }
      await client.query("commit");
      return { ownerId, product: `Un ${tag}`, ids };
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

test("the Head approves two ticked orders; the stepper moves to the Principal; stock is shown; the owner has no Approve (06 Allowed moves; rule 10)", async ({
  page,
}, info) => {
  const owner = E2E_PAGE_USERS[info.project.name as keyof typeof E2E_PAGE_USERS].manager;
  const seeded = await seedWaiting(owner);
  const address = `/orders?status=PENDING_HEAD&owner=${seeded.ownerId}`;
  // The owner's language is set by other specs: found by the product, not by a label.
  const groupOf = (on: Page) => on.locator("tbody[data-group]").filter({ hasText: seeded.product });
  const tickGroup = (on: Page) => groupOf(on).locator("input[type=checkbox]").first();

  // The owner ticks his own orders: the bar has no Approve; since 2.11 it has his own moves, Take
  // back and Cancel, and since 2.13 Copy as new, beside Clear (and Show details on a phone).
  await signIn(page, owner);
  await page.goto(address);
  await tickGroup(page).check();
  const ownerBar = page.locator("[data-list-bar]");
  await expect(ownerBar.locator("[data-ticked-count]")).toBeVisible();
  await expect(ownerBar.locator('[data-total="grand"]')).toBeVisible();
  await expect(ownerBar.locator("[data-move]")).toHaveCount(2);
  await expect(ownerBar.locator('[data-move="TAKE_BACK"]')).toBeVisible();
  await expect(ownerBar.locator('[data-move="CANCEL"]')).toBeVisible();
  await expect(ownerBar.locator("[data-copy-as-new]")).toBeVisible();
  await expect(ownerBar.getByRole("button")).toHaveCount(info.project.name === "phone-375" ? 5 : 4);
  await page.context().clearCookies();

  const head = page;
  await signIn(head, E2E_ROLES.HEAD);
  await head.goto(address);
  // Stock at submit and stock now in the opened group (06 rule 10).
  await head
    .getByRole("button", { name: t.list.showOrders.replace("{product}", seeded.product) })
    .click();
  const group = groupOf(head);
  await expect(group.locator('td[data-cell="stockAtSubmit"]').first()).toContainText("3");
  await expect(group.locator('td[data-cell="stockNow"]').first()).toContainText("7,5");
  expect(await scrollsSideways(head)).toBe(false);

  await tickGroup(head).check();
  const approve = head
    .locator("[data-list-bar]")
    .getByRole("button", { name: t.approve.buttonCount.replace("{count}", "2") });
  await approve.click();
  const dialog = head.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: t.approve.button, exact: true }).click();
  // D38: the approval succeeded before anything else is checked.
  await expect(head.getByText("2 ta buyurtma tasdiqlandi.")).toBeVisible();
  await expect(head.locator("[data-list-bar]")).toHaveCount(0);

  // The order page: the stepper stands at the Principal; stock at submit and now in Details.
  await head.goto(`/orders/${seeded.ids[0]}`);
  await expect(head.locator('li[data-step="PRINCIPAL"]')).toHaveAttribute("data-state", "current");
  await expect(head.locator('li[data-step="HEAD"]')).toHaveAttribute("data-state", "done");
  await expect(head.locator('[data-fact="stockAtSubmit"]')).toContainText("3");
  await expect(head.locator('[data-fact="stockNow"]')).toContainText("7,5");
  // The Head has no move at Waiting for Principal: no Approve on the page.
  await expect(
    head.locator("[data-order-bar]").getByRole("button", { name: t.approve.button }),
  ).toHaveCount(0);
  expect(await scrollsSideways(head)).toBe(false);
});
