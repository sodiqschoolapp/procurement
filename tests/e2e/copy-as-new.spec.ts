import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_COPY_USERS, E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build plan 2.13: S6 (15-quality-and-acceptance.md: "Principal rejects with a reason. Status
// Rejected, read-only. 'Copy as new' creates a draft"; 05 Ticking and filters: Copy as new) and
// "Overdue" (edge-cases/requests-and-approval.md, "The needed-by date passes while the order
// waits"), on the order page and in the list. The orders are written straight into the table,
// each project with its own owner and product; the owners and the Principal read Uzbek (reset
// before every run).

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

/** One order of the owner in EA at `status`, 100 pieces × 5 000, needed by `neededBy`. */
async function seedOrder(owner: Person, status: "REJECTED" | "PENDING_HEAD", neededBy: string) {
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
         values ($1, $2, false, true, now()) returning id`,
        [`O'lchov ${tag}`, `dona${tag}`],
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
      const product = `Daftar ${tag}`;
      const inserted = await client.query<{ id: string }>(
        `insert into products (name, type, category_id, unit_id, is_active, has_variants, created_at)
         values ($1, 'GOODS', $2, $3, true, false, now()) returning id`,
        [product, category.rows[0]!.id, unit.rows[0]!.id],
      );
      const variant = await client.query<{ id: string }>(
        `insert into product_variants (product_id, name, is_default, is_active, created_at)
         values ($1, 'default', true, true, now()) returning id`,
        [inserted.rows[0]!.id],
      );
      // A number far above any the run's own submits reach (05 Order number 2).
      const number = `EA-26-${7_000_000 + Math.floor(Math.random() * 999_999)}`;
      const order = await client.query<{ id: string }>(
        `insert into orders (number, branch_id, owner_id, created_by, status, variant_id,
                             department_id, needed_by, planned_qty, planned_price, planned_total,
                             payment_type, stock_at_submit, submitted_at, created_at, updated_at)
         select $1, b.id, $2, $2, $5, $3, $4, $6, 100, 5000, 500000,
                'CASH', 0, now(), now(), now()
           from branches b where b.code = 'EA'
         returning id`,
        [number, ownerId, variant.rows[0]!.id, department.rows[0]!.id, status, neededBy],
      );
      await client.query("commit");
      return { id: order.rows[0]!.id, number, product, ownerId, variantId: variant.rows[0]!.id };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

/** The owner's never-submitted draft of the subtype, as stored. */
async function draftOf(ownerId: string, variantId: string) {
  return withDatabase(async (client) => {
    const row = await client.query<{ id: string; qty: string; price: string }>(
      `select id, planned_qty::text as qty, planned_price::text as price from orders
       where owner_id = $1 and variant_id = $2 and status = 'DRAFT' and number is null`,
      [ownerId, variantId],
    );
    return row.rows[0] ?? null;
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

test("S6: a rejected order is read-only and Copy as new creates a draft; the Principal has no Copy as new", async ({
  page,
}, info) => {
  const owner = E2E_COPY_USERS[info.project.name as keyof typeof E2E_COPY_USERS];
  const order = await seedOrder(owner, "REJECTED", "2031-05-01");

  // The Principal of the branch sees the rejected order with no button at all.
  await signIn(page, E2E_ROLES.PRINCIPAL);
  await page.goto(`/orders/${order.id}`);
  await expect(page.locator("[data-order-number]")).toHaveText(order.number);
  await expect(page.locator("[data-order-bar] [data-copy-as-new]")).toHaveCount(0);
  await page.context().clearCookies();

  await signIn(page, owner);
  await page.goto(`/orders/${order.id}`);
  const bar = page.locator("[data-order-bar]");
  // Read-only: Copy as new is the only button.
  await expect(bar.getByRole("button")).toHaveCount(1);
  await bar.locator("[data-copy-as-new]").click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("button", { name: t.copy.button }).click();
  await expect(page.getByText("1 ta buyurtma qoralamalaringizga nusxalandi.")).toBeVisible();
  await expect(page).toHaveURL(/\/orders(#drafts-title)?$/);

  await expect.poll(() => draftOf(order.ownerId, order.variantId)).not.toBeNull();
  const draft = (await draftOf(order.ownerId, order.variantId))!;
  expect(draft).toMatchObject({ qty: "100.000", price: "5000" });
  const row = page.locator(`tbody tr[data-draft="${draft.id}"]`);
  await expect(row).toBeVisible();
  await expect(row.locator('td[data-col="quantity"] input')).toHaveValue("100");
  expect(await scrollsSideways(page)).toBe(false);
});

test("Overdue: a waiting order past its needed-by date shows Overdue on its page and in the list", async ({
  page,
}, info) => {
  const owner = E2E_COPY_USERS[info.project.name as keyof typeof E2E_COPY_USERS];
  const order = await seedOrder(owner, "PENDING_HEAD", "2020-01-15");

  await signIn(page, owner);
  await page.goto(`/orders/${order.id}`);
  await expect(page.locator("[data-overdue]")).toHaveText(t.overdue);
  // Nothing is blocked: the owner still has Take back.
  await expect(
    page.locator("[data-order-bar]").getByRole("button", { name: t.moves.button.TAKE_BACK }),
  ).toBeVisible();

  await page.goto(`/orders?status=PENDING_HEAD&owner=${order.ownerId}`);
  const group = page.locator("tbody[data-group]").filter({ hasText: order.product });
  await expect(group.locator("[data-overdue]").first()).toHaveText(t.overdue);
  expect(await scrollsSideways(page)).toBe(false);
});
