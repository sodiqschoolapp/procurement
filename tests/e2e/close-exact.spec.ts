import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_PAGE_USERS, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build plan 4.4 (Close on an exact match), the plan's Playwright line: the Manager ticks an
// exact-match order; the bar shows "1 of 1 match exactly" and Close; the dialog carries 08 Closing
// 1's sentence and the result with the count (11-screens-and-ux.md rule 6); after Confirm the order
// is Closed. Ticked with an order bought cheaper, the bar shows Send to settlement and no Close
// (build plan 4.4, Done when). Run at 375 px and at 1440 px by the two projects; the users read
// Uzbek.

const t = uz.orders.moves;

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
 * Two finished Open card orders of the owner in EA, 2 × 5 000 each, of two products of their
 * own: one bought exactly as planned, one at 4 000 a piece. Card: no cash, so the count is 0.
 */
async function seedFinished(owner: Person) {
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
      const made: { id: string; product: string }[] = [];
      for (const [name, price] of [
        [`Yopiladi ${tag}`, 5000],
        [`Arzon ${tag}`, 4000],
      ] as const) {
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
        const number = `EA-26-${8_000_000 + Math.floor(Math.random() * 999_999)}`;
        const order = await client.query<{ id: string; branch_id: string }>(
          `insert into orders (number, branch_id, owner_id, created_by, status, progress, variant_id,
                               department_id, needed_by, planned_qty, planned_price, planned_total,
                               payment_type, stock_at_submit, submitted_at, approved_at, created_at,
                               updated_at)
           select $1, b.id, $2, $2, 'PURCHASING', 'DONE', $3, $4, '2031-05-01', 2, 5000, 10000,
                  'CARD', 0, now(), now(), now(), now()
             from branches b where b.code = 'EA'
           returning id, branch_id`,
          [number, ownerId, variant.rows[0]!.id, department.rows[0]!.id],
        );
        const { id, branch_id: branchId } = order.rows[0]!;
        const trip = await client.query<{ id: string }>(
          `insert into purchase_trips (client_key, branch_id, purchased_on, payment_type,
                                       created_by, created_at)
           values ($1, $2, (now() at time zone 'Asia/Tashkent')::date, 'CARD', $3, now())
           returning id`,
          [randomUUID(), branchId, ownerId],
        );
        await client.query(
          `insert into purchases (trip_id, order_id, branch_id, variant_id, qty, unit_price,
                                  comment, created_by, created_at)
           values ($1, $2, $3, $4, 2, $5, $6, $7, now())`,
          [
            trip.rows[0]!.id,
            id,
            branchId,
            variant.rows[0]!.id,
            price,
            price === 5000 ? null : "Arzonroq topildi",
            ownerId,
          ],
        );
        made.push({ id, product: name });
      }
      await client.query("commit");
      return { ownerId, exact: made[0]!, cheaper: made[1]! };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

async function statusOf(orderId: string): Promise<string> {
  return withDatabase(async (client) => {
    const found = await client.query<{ status: string }>(
      "select status from orders where id = $1",
      [orderId],
    );
    return found.rows[0]!.status;
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

test("the Manager closes an exact match after the confirmation; with a difference ticked beside it only Send to settlement is offered (08 Closing 1; 11 rule 6)", async ({
  page,
}, info) => {
  const people = E2E_PAGE_USERS[info.project.name as keyof typeof E2E_PAGE_USERS];
  const seeded = await seedFinished(people.manager);

  await signIn(page, people.manager);
  await page.goto(`/orders?status=PURCHASING&owner=${seeded.ownerId}`);
  const bar = page.locator("[data-list-bar]");
  const exactGroup = page.locator("tbody[data-group]").filter({ hasText: seeded.exact.product });
  const cheaperGroup = page
    .locator("tbody[data-group]")
    .filter({ hasText: seeded.cheaper.product });

  // Both ticked: no Close for either, Send to settlement offered (build plan 4.4, Done when).
  await exactGroup.locator("input[type=checkbox]").first().check();
  await cheaperGroup.locator("input[type=checkbox]").first().check();
  await expect(bar.locator("[data-exact-count]")).toHaveText("Farqsiz: 1 / 2");
  await expect(bar.locator('[data-move="SEND_TO_SETTLEMENT"]')).toBeVisible();
  await expect(bar.locator('[data-move="CLOSE_EXACT"]')).toHaveCount(0);

  // The exact match alone: Close, with the sentence and the result (08 Closing 1; 11 rule 6).
  await cheaperGroup.locator("input[type=checkbox]").first().uncheck();
  await expect(bar.locator("[data-exact-count]")).toHaveText("Farqsiz: 1 / 1");
  await bar.locator('[data-move="CLOSE_EXACT"]').click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-close-confirm]")).toHaveText(t.closeConfirm);
  await expect(dialog).toContainText("1 ta buyurtma yopiladi");
  expect(await scrollsSideways(page)).toBe(false);
  await dialog.getByRole("button", { name: t.button.CLOSE_EXACT, exact: true }).click();
  await expect(page.getByText("1 ta buyurtma yopildi.")).toBeVisible();
  expect(await statusOf(seeded.exact.id)).toBe("CLOSED");
  expect(await statusOf(seeded.cheaper.id)).toBe("PURCHASING");
});
