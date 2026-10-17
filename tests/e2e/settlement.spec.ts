import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import en from "../../src/i18n/messages/en.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_PAGE_USERS, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build plan 4.5 (Settlement screen), the plan's Playwright line: Finance ticks two cash orders
// Waiting for settlement on the list, opens Settle, sees the net (08 Money ledger 2: "the Manager
// hands Finance …"), saves after the confirmation that names the orders, the Managers and the net
// (11-screens-and-ux.md rule 6; review of the plan, Should fix 1), and both counts reach 0;
// confirms a transfer that differs only after writing the note (08 Closing 2); sends an order back
// for correction with a reason (08 Closing 4). Run at 375 px and at 1440 px by the two projects;
// the users read English, as order-page.spec.ts sets them (it shares these users and runs beside
// this one).

const t = en.money.settle;

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
 * Three finished orders of the Manager in EA, Waiting for settlement, each 2 × 5 000 and of a
 * product of its own: "Ortdi" given 10 000 in cash and bought 2 × 4 000 (count +2 000), "Kamaydi"
 * given 10 000 and bought 2 × 5 500 (count −1 000), and "Otkazma" by transfer, 10 000 transferred
 * and 2 × 4 500 received (a note is needed).
 */
async function seedSettlement(owner: Person, finance: Person) {
  return withDatabase(async (client) => {
    await client.query("begin");
    try {
      const idOf = async (username: string) =>
        (await client.query<{ id: string }>("select id from users where username = $1", [username]))
          .rows[0]!.id;
      await client.query("update users set locale = 'en' where username = any($1)", [
        [owner.username, finance.username],
      ]);
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
      const made: Record<string, { id: string; product: string }> = {};
      for (const [key, type, price, kind] of [
        ["more", "CASH", 4000, "CASH_GIVEN"],
        ["less", "CASH", 5500, "CASH_GIVEN"],
        ["transfer", "TRANSFER", 4500, "BANK_TRANSFER"],
      ] as const) {
        const name = `${key === "more" ? "Ortdi" : key === "less" ? "Kamaydi" : "Otkazma"} ${tag}`;
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
           select $1, b.id, $2, $2, 'SETTLEMENT', 'DONE', $3, $4, '2031-05-01', 2, 5000, 10000,
                  $5, 0, now(), now(), now(), now()
             from branches b where b.code = 'EA'
           returning id, branch_id`,
          [number, ownerId, variant.rows[0]!.id, department.rows[0]!.id, type],
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
           values ($1, $2, $3, 10000, now())`,
          [action.rows[0]!.id, id, kind],
        );
        const trip = await client.query<{ id: string }>(
          `insert into purchase_trips (client_key, branch_id, purchased_on, payment_type,
                                       created_by, created_at)
           values ($1, $2, (now() at time zone 'Asia/Tashkent')::date, $3, $4, now())
           returning id`,
          [randomUUID(), branchId, type, ownerId],
        );
        await client.query(
          `insert into purchases (trip_id, order_id, branch_id, variant_id, qty, unit_price,
                                  comment, created_by, created_at)
           values ($1, $2, $3, $4, 2, $5, 'Sinov xaridi', $6, now())`,
          [trip.rows[0]!.id, id, branchId, variant.rows[0]!.id, price, ownerId],
        );
        made[key] = { id, product: name };
      }
      await client.query("commit");
      return { ownerId, more: made.more!, less: made.less!, transfer: made.transfer! };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

/** 08 Order's cash count of an order, as the database holds its rows and records. */
async function countOf(orderId: string): Promise<number> {
  return withDatabase(async (client) => {
    const found = await client.query<{ count: string }>(
      `select (
         coalesce((select sum(case r.kind when 'CASH_RETURNED' then -r.amount else r.amount end)
                   from money_rows r join money_actions a on a.id = r.money_action_id
                   where r.order_id = $1 and not a.is_cancelled
                     and r.kind in ('CASH_GIVEN', 'CASH_RETURNED', 'PAID_BACK')), 0)
         - coalesce((select sum(p.qty * p.unit_price) from purchases p
                     join purchase_trips t on t.id = p.trip_id
                     where p.order_id = $1 and not p.is_cancelled and t.payment_type = 'CASH'), 0)
       )::text as count`,
      [orderId],
    );
    return Number(found.rows[0]!.count);
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

test("Finance settles two cash orders with one action and the net, confirms a transfer with its note, and sends an order back for correction (08 Closing 2 and 4; 11 rule 6)", async ({
  page,
}, info) => {
  const people = E2E_PAGE_USERS[info.project.name as keyof typeof E2E_PAGE_USERS];
  const seeded = await seedSettlement(people.manager, people.finance);

  await signIn(page, people.finance);
  await page.goto(`/orders?status=SETTLEMENT&owner=${seeded.ownerId}`);
  const bar = page.locator("[data-list-bar]");
  const tick = (key: "more" | "less") =>
    page
      .locator("tbody[data-group]")
      .filter({ hasText: seeded[key].product })
      .locator("input[type=checkbox]")
      .first();
  await tick("more").check();
  await expect(bar).toBeVisible();
  // On a phone the action bar can cover the lower row's tick box; the page has answered the first
  // tick, so a click event reaches the second (as close-exact.spec.ts clears through the bar).
  await tick("less").dispatchEvent("click");
  await expect(tick("less")).toBeChecked();
  await expect(bar.locator('[data-move="SEND_BACK_FOR_CORRECTION"]')).toBeVisible();
  await bar.locator("[data-settle]").click();
  await expect(page).toHaveURL(/\/orders\/settle\?ids=/);
  await expect(page.locator("[data-settlement] h1")).toHaveText(t.title);

  // The prefilled rows: Receive 2 000 on one, Pay 1 000 on the other; the net is 1 000 to Finance.
  await expect(page.locator(`[data-settle-amount="${seeded.more.id}"]`)).toHaveValue("2000");
  await expect(page.locator(`[data-settle-amount="${seeded.less.id}"]`)).toHaveValue("1000");
  const net = page.locator("[data-settle-net]");
  await expect(net).toContainText("hands Finance");
  await expect(net).toContainText("1 000");
  expect(await scrollsSideways(page)).toBe(false);

  await page.locator("[data-settle-comment]").fill("Hisob-kitob sinovi");
  await page.locator("[data-settle-save]").click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("2 orders, 1 Manager:");
  await expect(dialog).toContainText("hands Finance");
  await dialog.getByRole("button", { name: t.save, exact: true }).click();
  await expect(page.getByText("Settlement saved for 2 orders.")).toBeVisible();
  expect(await countOf(seeded.more.id)).toBe(0);
  expect(await countOf(seeded.less.id)).toBe(0);

  // The transfer: 10 000 transferred, 9 000 received; Confirmed waits for the note (08 Closing 2).
  await page.goto(`/orders/settle?ids=${seeded.transfer.id}`);
  const box = page.locator(`[data-confirm="TRANSFER:${seeded.transfer.id}"]`);
  await expect(box).toBeDisabled();
  await page
    .locator(`[data-transfer-note="${seeded.transfer.id}"]`)
    .fill("Yetkazib beruvchi 1 000 qaytaradi");
  // The box shows what the server holds: it turns ticked once the save has answered.
  await box.click();
  await expect(box).toBeChecked();
  await page.reload();
  await expect(page.locator(`[data-confirm="TRANSFER:${seeded.transfer.id}"]`)).toBeChecked();

  // Send back for correction, with a reason (08 Closing 4).
  await page
    .locator(`[data-settle-order="${seeded.transfer.id}"]`)
    .locator('[data-move="SEND_BACK_FOR_CORRECTION"]')
    .click();
  const back = page.getByRole("alertdialog");
  await back.locator("textarea[data-reason]").fill("Narx notoʻgʻri yozilgan");
  await back
    .getByRole("button", { name: en.orders.moves.button.SEND_BACK_FOR_CORRECTION, exact: true })
    .click();
  await expect.poll(() => statusOf(seeded.transfer.id)).toBe("PURCHASING");
});
