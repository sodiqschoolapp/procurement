import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import en from "../../src/i18n/messages/en.json" with { type: "json" };
import ru from "../../src/i18n/messages/ru.json" with { type: "json" };
import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_PAGE_USERS, E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build plan 4.7 (Overspend guard), the plan's Playwright line: the Head opens an order Waiting
// for settlement above the guard, clicks "Acknowledge overspend", types a comment and confirms
// (08-money-and-settlement.md, Overspend guard; 11-screens-and-ux.md rule 6); the acknowledgment
// is stored with the comment and the button is gone. Run at 375 px and at 1440 px by the two
// projects. The Head is shared with other specs, so his language is left as it is and the
// confirm button is found by its label in any of the three languages.

type Person = { username: string; password: string };

const ACKNOWLEDGE = new RegExp(
  `^(${[uz, ru, en].map((messages) => messages.orders.moves.button.ACKNOWLEDGE_OVERSPEND).join("|")})$`,
);
const COMMENT = "Narxlar shu hafta oshdi";

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
 * One finished cash order of the Manager in EA, Waiting for settlement: planned 2 × 5 000 =
 * 10 000, given 10 000 in cash and bought 2 × 100 000 = 200 000, so 190 000 over, above the
 * default guard (10% and 100 000 so'm).
 */
async function seedOverspent(owner: Person, finance: Person) {
  return withDatabase(async (client) => {
    await client.query("begin");
    try {
      const idOf = async (username: string) =>
        (await client.query<{ id: string }>("select id from users where username = $1", [username]))
          .rows[0]!.id;
      const ownerId = await idOf(owner.username);
      const financeId = await idOf(finance.username);
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
        [`Qimmat ${tag}`, category.rows[0]!.id, unit.rows[0]!.id],
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
         select $1, b.id, $2, $2, 'SETTLEMENT', 'DONE', $3, $4, '2031-05-01', 2, 5000, 10000,
                'CASH', 0, now(), now(), now(), now()
           from branches b where b.code = 'EA'
         returning id, branch_id`,
        [number, ownerId, variant.rows[0]!.id, department.rows[0]!.id],
      );
      const { id, branch_id: branchId } = order.rows[0]!;
      const action = await client.query<{ id: string }>(
        `insert into money_actions (client_key, manager_id, occurred_on, comment, created_by,
                                    created_at)
         values ($1, $2, (now() at time zone 'Asia/Tashkent')::date, 'Sinov puli', $3, now())
         returning id`,
        [randomUUID(), ownerId, financeId],
      );
      await client.query(
        `insert into money_rows (money_action_id, order_id, kind, amount, created_at)
         values ($1, $2, 'CASH_GIVEN', 10000, now())`,
        [action.rows[0]!.id, id],
      );
      const trip = await client.query<{ id: string }>(
        `insert into purchase_trips (client_key, branch_id, purchased_on, payment_type,
                                     created_by, created_at)
         values ($1, $2, (now() at time zone 'Asia/Tashkent')::date, 'CASH', $3, now())
         returning id`,
        [randomUUID(), branchId, ownerId],
      );
      await client.query(
        `insert into purchases (trip_id, order_id, branch_id, variant_id, qty, unit_price,
                                comment, created_by, created_at)
         values ($1, $2, $3, $4, 2, 100000, 'Sinov xaridi', $5, now())`,
        [trip.rows[0]!.id, id, branchId, variant.rows[0]!.id, ownerId],
      );
      await client.query("commit");
      return id;
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

async function acknowledgmentOf(orderId: string) {
  return withDatabase(async (client) => {
    const found = await client.query<{ comment: string | null }>(
      "select overspend_ack_comment as comment from order_settlements where order_id = $1",
      [orderId],
    );
    return found.rows[0]?.comment ?? null;
  });
}

async function signIn(page: Page, user: Person): Promise<void> {
  await page.goto("/login");
  await page.locator("#username").fill(user.username);
  await page.locator("#password").fill(user.password);
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(/\/$/);
}

test("the Head acknowledges an overspend with a comment on the order page (08 Overspend guard; 11 rule 6)", async ({
  page,
}, info) => {
  const people = E2E_PAGE_USERS[info.project.name as keyof typeof E2E_PAGE_USERS];
  const orderId = await seedOverspent(people.manager, people.finance);

  await signIn(page, E2E_ROLES.HEAD);
  await page.goto(`/orders/${orderId}`);
  const button = page.locator('[data-order-bar] [data-move="ACKNOWLEDGE_OVERSPEND"]');
  await expect(button).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);

  await button.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole("button", { name: ACKNOWLEDGE });
  // The comment is required: 5 characters at least (06 rule 3; decided item 4).
  await expect(confirm).toBeDisabled();
  await dialog.locator("textarea[data-reason]").fill(COMMENT);
  await confirm.click();
  await expect(dialog).toBeHidden();

  await expect.poll(() => acknowledgmentOf(orderId)).toBe(COMMENT);
  await expect(button).toHaveCount(0);
});
