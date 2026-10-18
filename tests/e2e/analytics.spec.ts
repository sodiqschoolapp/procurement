import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import * as schema from "../../src/server/db/schema";
import { refreshAnalytics } from "../../src/server/jobs/analytics-refresh";
import { E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build plan 6.3 (Analytics foundations) in the browser, at 375 and 1440 px: the Head opens
// /analytics, chooses custom dates and a category, clicks a bar and sees the records behind it
// with the same total (10-notifications-analytics-reports.md, Analytics page per role, points 1 to
// 3; 16-build-order.md, phase 6: "click a bar … and see the orders behind it"); the school-year
// choice is absent while the setting is empty (the seed leaves it empty). Records are written
// straight into the tables, in January 2020, a period no other spec buys in, under a category of
// their own; the summary is rebuilt by the job's own refresh.

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

/** Two records of a new category in EA in January 2020: 2.5 × 3 333 + 1 000 and 1 × 20 000. */
async function seedRecords(): Promise<{ category: string }> {
  const tag = randomUUID().slice(0, 8);
  const category = `Tahlil ${tag}`;
  await withDatabase(async (client) => {
    await client.query("begin");
    try {
      const head = await client.query<{ id: string }>("select id from users where username = $1", [
        E2E_ROLES.HEAD.username,
      ]);
      const headId = head.rows[0]!.id;
      const unit = await client.query<{ id: string }>(
        `insert into units (name, short_name, allow_decimal, is_active, created_at)
         values ($1, $2, true, true, now()) returning id`,
        [`O'lchov ${tag}`, `t${tag}`],
      );
      const categoryRow = await client.query<{ id: string }>(
        `insert into categories (name, is_active, created_at) values ($1, true, now()) returning id`,
        [category],
      );
      const department = await client.query<{ id: string }>(
        `insert into departments (branch_id, name, is_active, created_at)
         select id, $1, true, now() from branches where code = 'EA' returning id`,
        [`Bo'lim ${tag}`],
      );
      const extraType = await client.query<{ id: string }>(
        `insert into extra_cost_types (name, is_active, created_at) values ($1, true, now())
         returning id`,
        [`Yetkazish ${tag}`],
      );
      for (const [day, qty, price, extra] of [
        ["2020-01-10", "2.500", 3333, 1000],
        ["2020-01-20", "1.000", 20000, null],
      ] as const) {
        const product = await client.query<{ id: string }>(
          `insert into products (name, type, category_id, unit_id, is_active, has_variants,
                                 created_at)
           values ($1, 'GOODS', $2, $3, true, false, now()) returning id`,
          [`Daftar ${tag} ${day}`, categoryRow.rows[0]!.id, unit.rows[0]!.id],
        );
        const variant = await client.query<{ id: string }>(
          `insert into product_variants (product_id, name, is_default, is_active, created_at)
           values ($1, 'default', true, true, now()) returning id`,
          [product.rows[0]!.id],
        );
        const number = `EA-20-${8_000_000 + Math.floor(Math.random() * 999_999)}`;
        const order = await client.query<{ id: string; branch_id: string }>(
          `insert into orders (number, branch_id, owner_id, created_by, status, variant_id,
                               department_id, needed_by, planned_qty, planned_price, planned_total,
                               payment_type, submitted_at, created_at, updated_at)
           select $1, b.id, $2, $2, 'PURCHASING', $3, $4, '2020-02-01', 1, 10000, 10000, 'CASH',
                  now(), now(), now()
             from branches b where b.code = 'EA'
           returning id, branch_id`,
          [number, headId, variant.rows[0]!.id, department.rows[0]!.id],
        );
        const { id: orderId, branch_id: branchId } = order.rows[0]!;
        const trip = await client.query<{ id: string }>(
          `insert into purchase_trips (client_key, branch_id, purchased_on, payment_type,
                                       created_by, created_at)
           values ($1, $2, $3, 'CASH', $4, now()) returning id`,
          [randomUUID(), branchId, day, headId],
        );
        const purchase = await client.query<{ id: string }>(
          `insert into purchases (trip_id, order_id, branch_id, variant_id, qty, unit_price,
                                  created_by, created_at)
           values ($1, $2, $3, $4, $5, $6, $7, now()) returning id`,
          [trip.rows[0]!.id, orderId, branchId, variant.rows[0]!.id, qty, price, headId],
        );
        if (extra !== null) {
          await client.query(
            `insert into purchase_extras (purchase_id, extra_cost_type_id, amount, payment_type,
                                          created_at)
             values ($1, $2, $3, 'CASH', now())`,
            [purchase.rows[0]!.id, extraType.rows[0]!.id, extra],
          );
        }
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    // The job's refresh, at once rather than at the next 5-minute tick.
    await drizzle(client, { schema }).transaction((tx) => refreshAnalytics(tx));
  });
  return { category };
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#username").fill(E2E_ROLES.HEAD.username);
  await page.locator("#password").fill(E2E_ROLES.HEAD.password);
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(/\/$/);
}

function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test("Done when: the Head chooses a period and a category, clicks a bar and sees the records behind it (10 points 1 to 3; 16 phase 6)", async ({
  page,
}) => {
  const { category } = await seedRecords();
  await signIn(page);
  await page.goto("/analytics");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(uz.analytics.title);

  // The school year is not set in the seed, so it is not a choice (10 point 1).
  const periodSelect = page.locator("[data-filter-period]");
  await expect(periodSelect.locator("option")).toHaveText([
    uz.analytics.periods.this_month,
    uz.analytics.periods.last_month,
    uz.analytics.periods.this_quarter,
    uz.analytics.periods.custom,
  ]);

  // At phone width the filters fold behind their button; it opens on a tap.
  if (test.info().project.name === "phone-375") {
    await expect(periodSelect).toBeHidden();
    await page.locator("[data-filter-toggle]").click();
  }
  await periodSelect.selectOption("custom");
  await page.locator("[data-filter-from]").fill("2020-01-01");
  await page.locator("[data-filter-to]").fill("2020-01-31");
  await page.locator("[data-filter-branch]").selectOption({ label: "Sinov filiali A" });
  await page.locator("[data-filter-category]").selectOption({ label: category });
  await page.getByRole("button", { name: uz.analytics.apply }).click();
  await expect(page).toHaveURL(/period=custom/);

  // 8 333 + 1 000 + 20 000 = 29 333, each record rounded on its own (08).
  await expect(page.locator("[data-spending-total]")).toHaveText(/29\s333/);
  await expect(page.locator("[data-spending-change]")).toContainText("+29");
  expect(await scrollsSideways(page)).toBe(false);

  // Click the category's bar: the records behind it, with the same total.
  const card = page.locator('[data-chart-card="spending-categories"]');
  await expect(card.locator(".recharts-bar-rectangle").first()).toBeVisible();
  await card.locator(".recharts-bar-rectangle").first().click();
  await expect(page).toHaveURL(/\/analytics\/records\?.*key=category/);
  await expect(page.locator("[data-records-summary]")).toContainText(/29\s333/);
  await expect(page.locator("[data-record-row]")).toHaveCount(2);
  expect(await scrollsSideways(page)).toBe(false);

  // Back, and a month's row of the table opens the same records (the keyboard's way in).
  await page.getByRole("link", { name: uz.analytics.records.back }).click();
  const monthRow = page.locator('[data-chart-card="spending-months"] [data-chart-row]').first();
  await monthRow.getByRole("link").click();
  await expect(page.locator("[data-records-summary]")).toContainText(/29\s333/);
});

test("another branch on the Analytics page and its records is Not found (03 rule 1; permission review of 6.3, Should fix 1)", async ({
  page,
}) => {
  // The Principal of EA asks for EB.
  const otherBranch = await withDatabase(async (client) => {
    const found = await client.query<{ id: string }>("select id from branches where code = 'EB'");
    return found.rows[0]!.id;
  });
  await page.goto("/login");
  await page.locator("#username").fill(E2E_ROLES.PRINCIPAL.username);
  await page.locator("#password").fill(E2E_ROLES.PRINCIPAL.password);
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(/\/$/);
  // A streamed page answers before notFound(), so the page itself is read, as branch-wall.spec.ts
  // does.
  for (const path of ["/analytics", "/analytics/records"]) {
    await page.goto(`${path}?branch=${otherBranch}`);
    await expect(page.getByRole("heading", { name: uz.notFoundPage.title })).toBeVisible();
  }
  // Its own branch opens.
  await page.goto("/analytics?branch=all");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(uz.analytics.title);
});

/**
 * A red order of a new category in EA in February 2020, owned by the Head: planned 1 × 10 000,
 * bought 1 × 12 000 by card, buying Done on 12 February (build plan 6.4a).
 */
async function seedRedOrder(): Promise<{ branch: string; category: string }> {
  const tag = randomUUID().slice(0, 8);
  return withDatabase(async (client) => {
    await client.query("begin");
    let ids;
    try {
      const headId = (
        await client.query<{ id: string }>("select id from users where username = $1", [
          E2E_ROLES.HEAD.username,
        ])
      ).rows[0]!.id;
      const branch = (
        await client.query<{ id: string }>("select id from branches where code = 'EA'")
      ).rows[0]!.id;
      const unit = await client.query<{ id: string }>(
        `insert into units (name, short_name, allow_decimal, is_active, created_at)
         values ($1, $2, true, true, now()) returning id`,
        [`O'lchov ${tag}`, `r${tag}`],
      );
      const category = await client.query<{ id: string }>(
        `insert into categories (name, is_active, created_at) values ($1, true, now()) returning id`,
        [`Reja ${tag}`],
      );
      const department = await client.query<{ id: string }>(
        `insert into departments (branch_id, name, is_active, created_at)
         values ($1, $2, true, now()) returning id`,
        [branch, `Bo'lim ${tag}`],
      );
      const product = await client.query<{ id: string }>(
        `insert into products (name, type, category_id, unit_id, is_active, has_variants, created_at)
         values ($1, 'GOODS', $2, $3, true, false, now()) returning id`,
        [`Qalam ${tag}`, category.rows[0]!.id, unit.rows[0]!.id],
      );
      const variant = await client.query<{ id: string }>(
        `insert into product_variants (product_id, name, is_default, is_active, created_at)
         values ($1, 'default', true, true, now()) returning id`,
        [product.rows[0]!.id],
      );
      const order = await client.query<{ id: string }>(
        `insert into orders (number, branch_id, owner_id, created_by, status, variant_id,
                             department_id, needed_by, planned_qty, planned_price, planned_total,
                             payment_type, progress, submitted_at, created_at, updated_at)
         values ($1, $2, $3, $3, 'PURCHASING', $4, $5, '2020-03-01', 1, 10000, 10000, 'CARD',
                 'DONE', now(), now(), now())
         returning id`,
        [
          `EA-20-${7_000_000 + Math.floor(Math.random() * 999_999)}`,
          branch,
          headId,
          variant.rows[0]!.id,
          department.rows[0]!.id,
        ],
      );
      const trip = await client.query<{ id: string }>(
        `insert into purchase_trips (client_key, branch_id, purchased_on, payment_type, created_by,
                                     created_at)
         values ($1, $2, '2020-02-12', 'CARD', $3, now()) returning id`,
        [randomUUID(), branch, headId],
      );
      await client.query(
        `insert into purchases (trip_id, order_id, branch_id, variant_id, qty, unit_price,
                                created_by, created_at)
         values ($1, $2, $3, $4, 1, 12000, $5, now())`,
        [trip.rows[0]!.id, order.rows[0]!.id, branch, variant.rows[0]!.id, headId],
      );
      const action = await client.query<{ id: string }>(
        `insert into order_actions (client_key, type, actor_id, order_count, created_at)
         values ($1, 'RECORD_PURCHASE', $2, 1, '2020-02-12T05:00:00Z') returning id`,
        [randomUUID(), headId],
      );
      await client.query(
        `insert into order_events (order_id, action_id, type, from_status, to_status, actor_id,
                                   created_at)
         values ($1, $2, 'RECORD_PURCHASE', 'PURCHASING', 'PURCHASING', $3,
                 '2020-02-12T05:00:00Z')`,
        [order.rows[0]!.id, action.rows[0]!.id, headId],
      );
      await client.query("commit");
      ids = { branch, category: category.rows[0]!.id };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    await drizzle(client, { schema }).transaction((tx) => refreshAnalytics(tx));
    return ids;
  });
}

test("Done when 6.4a: the Head clicks a branch bar and a Plan vs actual number and sees what is behind them (10 Head; 16 phase 6)", async ({
  page,
}) => {
  const { branch, category } = await seedRedOrder();
  await signIn(page);
  await page.goto(
    `/analytics?period=custom&from=2020-02-01&to=2020-02-29&branch=${branch}&category=${category}`,
  );
  await expect(page.locator('[data-analytics-block="plan"]')).toBeVisible();

  // By branch: one bar of 12 000; it opens the records of that branch with the same total.
  const branches = page.locator('[data-chart-card="spending-branches"]');
  await expect(branches.locator("[data-amount]")).toHaveText([/12\s000/]);
  await branches.locator(".recharts-bar-rectangle").first().click();
  await expect(page).toHaveURL(/\/analytics\/records\?/);
  await expect(page.locator("[data-records-summary]")).toContainText(/12\s000/);
  expect(await scrollsSideways(page)).toBe(false);
  await page.getByRole("link", { name: uz.analytics.records.back }).click();

  // By payment type: card only.
  await expect(page.locator('[data-chart-card="spending-payments"] [data-chart-row]')).toHaveText([
    new RegExp(uz.paymentTypes.CARD),
  ]);

  // Plan vs actual: one red order, over 2 000; its number opens the order behind it.
  const red = page.locator('[data-plan-tile="red"]');
  await expect(red).toContainText(/2\s000/);
  await expect(page.locator('[data-plan-tile="overspent"] [data-plan-number]')).toHaveText(
    /2\s000/,
  );
  await red.locator("[data-plan-number]").click();
  await expect(page).toHaveURL(/\/analytics\/orders\?.*key=colour%3Ared/);
  await expect(page.locator("[data-order-row]")).toHaveCount(1);
  await expect(page.locator("[data-orders-summary]")).toContainText(/2\s000/);
  expect(await scrollsSideways(page)).toBe(false);

  // The Head owns it, so the by-Manager table holds it under "Other owners" (review correction 1).
  await page.getByRole("link", { name: uz.analytics.records.back }).click();
  const others = page.locator('[data-chart-card="plan-managers"] [data-tally-row="other"]');
  await expect(others).toContainText(uz.analytics.plan.otherOwners);
  await others.locator('[data-cell="red"] a').click();
  await expect(page).toHaveURL(/owner=other/);
  await expect(page.locator("[data-order-row]")).toHaveCount(1);
});

// Changed by 6.5b (plan of 6.5b, decided item 7): the Manager's page shows the Manager's blocks
// only, so the shared Spending block of 6.3 is no longer on it.
test("a Manager's Analytics page has no Plan vs actual block (plan of 6.4, decided item 8) and no Spending block (plan of 6.5b, decided item 7)", async ({
  page,
}) => {
  await page.goto("/login");
  await page.locator("#username").fill(E2E_ROLES.MANAGER.username);
  await page.locator("#password").fill(E2E_ROLES.MANAGER.password);
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/analytics");
  await expect(page.locator('[data-analytics-block="my-orders"]')).toBeVisible();
  await expect(page.locator('[data-analytics-block="spending"]')).toHaveCount(0);
  await expect(page.locator('[data-analytics-block="plan"]')).toHaveCount(0);
  await expect(page.locator('[data-analytics-block="head-spending"]')).toHaveCount(0);
});

/**
 * Build plan 6.4b: a subtype of a new category in EA bought at 4 000 and 5 000 in March 2020, and
 * an order of it the Head sent back two hours after its Submit, on 10 March 2020.
 */
async function seedPricesAndStay(): Promise<{ branch: string; category: string; variant: string }> {
  const tag = randomUUID().slice(0, 8);
  return withDatabase(async (client) => {
    await client.query("begin");
    let ids;
    try {
      const headId = (
        await client.query<{ id: string }>("select id from users where username = $1", [
          E2E_ROLES.HEAD.username,
        ])
      ).rows[0]!.id;
      const branch = (
        await client.query<{ id: string }>("select id from branches where code = 'EA'")
      ).rows[0]!.id;
      const unit = await client.query<{ id: string }>(
        `insert into units (name, short_name, allow_decimal, is_active, created_at)
         values ($1, $2, true, true, now()) returning id`,
        [`O'lchov ${tag}`, `p${tag}`],
      );
      const category = await client.query<{ id: string }>(
        `insert into categories (name, is_active, created_at) values ($1, true, now()) returning id`,
        [`Narx ${tag}`],
      );
      const department = await client.query<{ id: string }>(
        `insert into departments (branch_id, name, is_active, created_at)
         values ($1, $2, true, now()) returning id`,
        [branch, `Bo'lim ${tag}`],
      );
      const product = await client.query<{ id: string }>(
        `insert into products (name, type, category_id, unit_id, is_active, has_variants, created_at)
         values ($1, 'GOODS', $2, $3, true, false, now()) returning id`,
        [`Bo'r ${tag}`, category.rows[0]!.id, unit.rows[0]!.id],
      );
      const variant = await client.query<{ id: string }>(
        `insert into product_variants (product_id, name, is_default, is_active, created_at)
         values ($1, 'default', true, true, now()) returning id`,
        [product.rows[0]!.id],
      );
      const order = (status: string) =>
        client.query<{ id: string }>(
          `insert into orders (number, branch_id, owner_id, created_by, status, variant_id,
                               department_id, needed_by, planned_qty, planned_price, planned_total,
                               payment_type, progress, submitted_at, created_at, updated_at)
           values ($1, $2, $3, $3, $6, $4, $5, '2020-04-01', 1, 4000, 4000, 'CASH', 'OPEN', now(),
                   now(), now())
           returning id`,
          [
            `EA-20-${8_000_000 + Math.floor(Math.random() * 999_999)}`,
            branch,
            headId,
            variant.rows[0]!.id,
            department.rows[0]!.id,
            status,
          ],
        );
      const bought = (await order("PURCHASING")).rows[0]!.id;
      for (const [day, price] of [
        ["2020-03-05", 4000],
        ["2020-03-06", 5000],
      ] as const) {
        const trip = await client.query<{ id: string }>(
          `insert into purchase_trips (client_key, branch_id, purchased_on, payment_type,
                                       created_by, created_at)
           values ($1, $2, $3, 'CASH', $4, now()) returning id`,
          [randomUUID(), branch, day, headId],
        );
        await client.query(
          `insert into purchases (trip_id, order_id, branch_id, variant_id, qty, unit_price,
                                  created_by, created_at)
           values ($1, $2, $3, $4, 1, $5, $6, now())`,
          [trip.rows[0]!.id, bought, branch, variant.rows[0]!.id, price, headId],
        );
      }
      const returned = (await order("RETURNED")).rows[0]!.id;
      for (const [type, from, to, at, reason] of [
        ["SUBMIT", "DRAFT", "PENDING_HEAD", "2020-03-10T04:00:00Z", null],
        ["SEND_BACK", "PENDING_HEAD", "RETURNED", "2020-03-10T06:00:00Z", `Sabab ${tag}`],
      ] as const) {
        const action = await client.query<{ id: string }>(
          `insert into order_actions (client_key, type, actor_id, reason, order_count, created_at)
           values ($1, $2, $3, $4, 1, $5) returning id`,
          [randomUUID(), type, headId, reason, at],
        );
        await client.query(
          `insert into order_events (order_id, action_id, type, from_status, to_status, actor_id,
                                     created_at)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [returned, action.rows[0]!.id, type, from, to, headId, at],
        );
      }
      await client.query("commit");
      ids = { branch, category: category.rows[0]!.id, variant: variant.rows[0]!.id };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    await drizzle(client, { schema }).transaction((tx) => refreshAnalytics(tx));
    return ids;
  });
}

test("6.4b: the Head picks a product's price trend and opens the stay behind an Approval speed number (10 Head; plan of 6.4b)", async ({
  page,
}) => {
  const { branch, category, variant } = await seedPricesAndStay();
  await signIn(page);
  await page.goto(
    `/analytics?period=custom&from=2020-03-01&to=2020-03-31&branch=${branch}&category=${category}`,
  );
  const prices = page.locator('[data-analytics-block="prices"]');
  await expect(prices).toBeVisible();

  // The picker keeps the period and filters and shows the chosen subtype: (4 000 + 5 000) ÷ 2.
  await prices.locator("[data-price-picker] select").selectOption(variant);
  await prices.getByRole("button", { name: uz.analytics.prices.show }).click();
  await expect(page).toHaveURL(new RegExp(`variant=${variant}`));
  await expect(page).toHaveURL(/from=2020-03-01/);
  const trend = page.locator('[data-chart-card="prices-trend"] [data-table="trend"]');
  await expect(trend.locator("tbody tr")).toHaveCount(1);
  await expect(trend).toContainText(/4\s500/);
  // The spread is empty (one branch, one supplier); nothing scrolls sideways.
  expect(await scrollsSideways(page)).toBe(false);

  // The month opens its records, with their price per unit.
  await trend.locator("tbody a").first().click();
  await expect(page).toHaveURL(/\/analytics\/records\?.*key=price/);
  await expect(page.locator("[data-unit-price]")).toHaveCount(2);
  await expect(page.locator("[data-records-summary]")).toContainText(/4\s500/);
  expect(await scrollsSideways(page)).toBe(false);
  await page.getByRole("link", { name: uz.analytics.records.back }).click();

  // Approval speed: EA's Head step at 2.0 hours, one stay; it opens that stay.
  const hours = page.locator(`[data-chart-card="speed-hours"] [data-row="${branch}"]`);
  // The shared quantity formatter drops a trailing ",0": 2.0 hours is written "2 soat".
  const twoHours = uz.analytics.speed.hours.replace("{hours}", "2");
  await expect(hours).toContainText(twoHours);
  await hours.locator("a").first().click();
  await expect(page).toHaveURL(/\/analytics\/approvals\?.*key=step%3APENDING_HEAD/);
  await expect(page.locator("[data-approval-row]")).toHaveCount(1);
  await expect(page.locator("[data-approvals-summary]")).toContainText(twoHours);
  expect(await scrollsSideways(page)).toBe(false);
});

/**
 * Build plan 6.4c: an Open order of a new category in EA that the Head owns, holding 70 000 given
 * on 1 March 2020, so the Managers block's "Other owners" row holds it (plan of 6.4c, decided
 * items 4 and 6).
 */
async function seedCashHeld(): Promise<{ branch: string; category: string }> {
  const tag = randomUUID().slice(0, 8);
  return withDatabase(async (client) => {
    await client.query("begin");
    let ids;
    try {
      const headId = (
        await client.query<{ id: string }>("select id from users where username = $1", [
          E2E_ROLES.HEAD.username,
        ])
      ).rows[0]!.id;
      const branch = (
        await client.query<{ id: string }>("select id from branches where code = 'EA'")
      ).rows[0]!.id;
      const unit = await client.query<{ id: string }>(
        `insert into units (name, short_name, allow_decimal, is_active, created_at)
         values ($1, $2, true, true, now()) returning id`,
        [`O'lchov ${tag}`, `c${tag}`],
      );
      const category = await client.query<{ id: string }>(
        `insert into categories (name, is_active, created_at) values ($1, true, now()) returning id`,
        [`Naqd ${tag}`],
      );
      const department = await client.query<{ id: string }>(
        `insert into departments (branch_id, name, is_active, created_at)
         values ($1, $2, true, now()) returning id`,
        [branch, `Bo'lim ${tag}`],
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
      const order = await client.query<{ id: string }>(
        `insert into orders (number, branch_id, owner_id, created_by, status, variant_id,
                             department_id, needed_by, planned_qty, planned_price, planned_total,
                             payment_type, progress, submitted_at, created_at, updated_at)
         values ($1, $2, $3, $3, 'PURCHASING', $4, $5, '2020-04-01', 1, 70000, 70000, 'CASH',
                 'OPEN', now(), now(), now())
         returning id`,
        [
          `EA-20-${8_000_000 + Math.floor(Math.random() * 999_999)}`,
          branch,
          headId,
          variant.rows[0]!.id,
          department.rows[0]!.id,
        ],
      );
      const action = await client.query<{ id: string }>(
        `insert into money_actions (client_key, manager_id, occurred_on, created_by, created_at)
         values ($1, $2, '2020-03-01', $2, now()) returning id`,
        [randomUUID(), headId],
      );
      await client.query(
        `insert into money_rows (money_action_id, order_id, kind, amount, created_at)
         values ($1, $2, 'CASH_GIVEN', 70000, now())`,
        [action.rows[0]!.id, order.rows[0]!.id],
      );
      await client.query("commit");
      ids = { branch, category: category.rows[0]!.id };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    await drizzle(client, { schema }).transaction((tx) => refreshAnalytics(tx));
    return ids;
  });
}

test("6.4c: the Head opens the orders behind a cash held number of the Managers block (10 Head; plan of 6.4c)", async ({
  page,
}) => {
  const { branch, category } = await seedCashHeld();
  await signIn(page);
  await page.goto(
    `/analytics?period=custom&from=2020-03-01&to=2020-03-31&branch=${branch}&category=${category}`,
  );
  const managers = page.locator('[data-analytics-block="managers"]');
  await expect(managers).toBeVisible();
  const others = managers.locator('[data-table="managers"] [data-row="other"]');
  await expect(others).toContainText(/70\s000/);
  expect(await scrollsSideways(page)).toBe(false);

  await others.getByRole("link", { name: /70\s000/ }).click();
  await expect(page).toHaveURL(/\/analytics\/cash\?.*owner=other/);
  await expect(page.locator("[data-cash-row]")).toHaveCount(1);
  await expect(page.locator("[data-cash-summary]")).toContainText(/70\s000/);
  expect(await scrollsSideways(page)).toBe(false);

  // The cancelled records of the same row: none in March 2020, its empty line, no sideways scroll.
  await page.getByRole("link", { name: uz.analytics.approvals.back }).click();
  await others.locator('a[href^="/analytics/cancelled"]').click();
  await expect(page).toHaveURL(/\/analytics\/cancelled\?.*owner=other/);
  await expect(page.getByText(uz.analytics.cancelled.empty)).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);
});

/**
 * A stock line of the category in EA (build-plan 6.4d): 10 received at 1 000 on 10 January 2020,
 * 2 issued to a department of its own on 15 January, so 8 left (8 000) and a use of 2 000. Written
 * as postMovement() and createDocument() write them, then the job's refresh.
 */
async function seedWarehouse(category: string): Promise<{ branch: string; department: string }> {
  const tag = randomUUID().slice(0, 8);
  return withDatabase(async (client) => {
    await client.query("begin");
    let ids;
    try {
      const headId = (
        await client.query<{ id: string }>("select id from users where username = $1", [
          E2E_ROLES.HEAD.username,
        ])
      ).rows[0]!.id;
      const branch = (
        await client.query<{ id: string }>("select id from branches where code = 'EA'")
      ).rows[0]!.id;
      const categoryId = (
        await client.query<{ id: string }>("select id from categories where name = $1", [category])
      ).rows[0]!.id;
      const unit = await client.query<{ id: string }>(
        `insert into units (name, short_name, allow_decimal, is_active, created_at)
         values ($1, $2, false, true, now()) returning id`,
        [`Dona ${tag}`, `d${tag}`],
      );
      const department = `Ombor bo'limi ${tag}`;
      const departmentId = (
        await client.query<{ id: string }>(
          `insert into departments (branch_id, name, is_active, created_at)
           values ($1, $2, true, now()) returning id`,
          [branch, department],
        )
      ).rows[0]!.id;
      const product = await client.query<{ id: string }>(
        `insert into products (name, type, category_id, unit_id, is_active, has_variants,
                               created_at)
         values ($1, 'GOODS', $2, $3, true, false, now()) returning id`,
        [`Bo'r ${tag}`, categoryId, unit.rows[0]!.id],
      );
      const variant = (
        await client.query<{ id: string }>(
          `insert into product_variants (product_id, name, is_default, is_active, created_at)
           values ($1, 'default', true, true, now()) returning id`,
          [product.rows[0]!.id],
        )
      ).rows[0]!.id;
      await client.query(
        `insert into stock_balances (branch_id, variant_id, qty, avg_cost, created_at, updated_at)
         values ($1, $2, 8, 1000, now(), now())`,
        [branch, variant],
      );
      await client.query(
        `insert into stock_movements (branch_id, variant_id, type, qty_delta, unit_cost,
                                      balance_after, created_by, created_at)
         values ($1, $2, 'RECEIPT', 10, 1000, 10, $3, '2020-01-10T05:00:00Z')`,
        [branch, variant, headId],
      );
      const document = (
        await client.query<{ id: string }>(
          `insert into stock_documents (number, type, branch_id, department_id, received_by_name,
                                        doc_date, status, client_key, created_by, created_at)
           values ($1, 'ISSUE', $2, $3, 'Sinov Qabulqiluvchi', '2020-01-15', 'POSTED', $4, $5,
                   '2020-01-15T05:00:00Z')
           returning id`,
          [
            `ISS-EA-20-${1_000_000 + Math.floor(Math.random() * 8_999_999)}`,
            branch,
            departmentId,
            randomUUID(),
            headId,
          ],
        )
      ).rows[0]!.id;
      const line = (
        await client.query<{ id: string }>(
          `insert into stock_document_lines (document_id, variant_id, qty, created_at)
           values ($1, $2, 2, now()) returning id`,
          [document, variant],
        )
      ).rows[0]!.id;
      await client.query(
        `insert into stock_movements (branch_id, variant_id, type, qty_delta, unit_cost,
                                      balance_after, document_line_id, created_by, created_at)
         values ($1, $2, 'ISSUE', -2, 1000, 8, $3, $4, '2020-01-15T05:00:00Z')`,
        [branch, variant, line, headId],
      );
      await client.query("commit");
      ids = { branch, department };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    await drizzle(client, { schema }).transaction((tx) => refreshAnalytics(tx));
    return ids;
  });
}

test("6.4d, the phase 6 check on the whole Head page: every block, a Spending bar and the Warehouse numbers open what is behind them (10 Head; 16 phase 6; plan of 6.4d)", async ({
  page,
}) => {
  const { category } = await seedRecords();
  const { branch, department } = await seedWarehouse(category);
  const categoryId = await withDatabase(
    async (client) =>
      (await client.query<{ id: string }>("select id from categories where name = $1", [category]))
        .rows[0]!.id,
  );
  await signIn(page);
  const address = `/analytics?period=custom&from=2020-01-01&to=2020-01-31&branch=${branch}&category=${categoryId}`;
  await page.goto(address);

  // The whole Head page: the six blocks of 10 Head, Spending in its two parts.
  for (const block of [
    "spending",
    "head-spending",
    "plan",
    "prices",
    "speed",
    "managers",
    "warehouse",
  ]) {
    await expect(page.locator(`[data-analytics-block="${block}"]`)).toBeVisible();
  }
  expect(await scrollsSideways(page)).toBe(false);

  // A Spending bar: the records behind it (16 phase 6).
  const card = page.locator('[data-chart-card="spending-categories"]');
  await card.locator(".recharts-bar-rectangle").first().click();
  await expect(page).toHaveURL(/\/analytics\/records\?.*key=category/);
  await expect(page.locator("[data-records-summary]")).toContainText(/29\s333/);
  await page.goto(address);

  // The branch's stock value of now: 8 × 1 000, and the line behind it.
  const warehouse = page.locator('[data-analytics-block="warehouse"]');
  const row = warehouse.locator(`[data-table="warehouse"] [data-row="${branch}"]`);
  await expect(row).toContainText(/8\s000/);
  await row
    .getByRole("link", { name: /8\s000/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/analytics\/stock\?.*key=stock%3Avalue/);
  await expect(page.locator("[data-stock-row]")).toHaveCount(1);
  await expect(page.locator("[data-stock-summary]")).toContainText(/8\s000/);
  expect(await scrollsSideways(page)).toBe(false);

  // The department's use in January: its bar opens the issue behind it.
  await page.getByRole("link", { name: uz.analytics.approvals.back }).click();
  const use = page.locator('[data-chart-card="warehouse-use"]');
  await expect(use.locator('[data-table="department-use"]')).toContainText(department);
  await use.locator(".recharts-bar-rectangle").first().click();
  await expect(page).toHaveURL(/\/analytics\/moves\?.*key=moves%3Ause/);
  await expect(page.locator("[data-moves-row]")).toHaveCount(1);
  await expect(page.locator("[data-moves-summary]")).toContainText(/2\s000/);
  expect(await scrollsSideways(page)).toBe(false);
});

/**
 * Build plan 6.5a: an order of a new category in EA, the Principal's branch, first submitted on
 * 10 February 2020 and waiting at Waiting for Principal, the summary refreshed. Returns its number
 * and the category.
 */
async function seedPrincipalOrder(
  owner: string = E2E_ROLES.HEAD.username,
): Promise<{ number: string; category: string }> {
  const tag = randomUUID().slice(0, 8);
  return withDatabase(async (client) => {
    await client.query("begin");
    let ids;
    try {
      const headId = (
        await client.query<{ id: string }>("select id from users where username = $1", [owner])
      ).rows[0]!.id;
      const branch = (
        await client.query<{ id: string }>("select id from branches where code = 'EA'")
      ).rows[0]!.id;
      const unit = await client.query<{ id: string }>(
        `insert into units (name, short_name, allow_decimal, is_active, created_at)
         values ($1, $2, true, true, now()) returning id`,
        [`O'lchov ${tag}`, `d${tag}`],
      );
      const category = await client.query<{ id: string }>(
        `insert into categories (name, is_active, created_at) values ($1, true, now()) returning id`,
        [`Direktor ${tag}`],
      );
      const department = await client.query<{ id: string }>(
        `insert into departments (branch_id, name, is_active, created_at)
         values ($1, $2, true, now()) returning id`,
        [branch, `Bo'lim ${tag}`],
      );
      const product = await client.query<{ id: string }>(
        `insert into products (name, type, category_id, unit_id, is_active, has_variants, created_at)
         values ($1, 'GOODS', $2, $3, true, false, now()) returning id`,
        [`Qog'oz ${tag}`, category.rows[0]!.id, unit.rows[0]!.id],
      );
      const variant = await client.query<{ id: string }>(
        `insert into product_variants (product_id, name, is_default, is_active, created_at)
         values ($1, 'default', true, true, now()) returning id`,
        [product.rows[0]!.id],
      );
      const number = `EA-20-${8_000_000 + Math.floor(Math.random() * 999_999)}`;
      await client.query(
        `insert into orders (number, branch_id, owner_id, created_by, status, variant_id,
                             department_id, needed_by, planned_qty, planned_price, planned_total,
                             payment_type, progress, submitted_at, created_at, updated_at)
         values ($1, $2, $3, $3, 'PENDING_PRINCIPAL', $4, $5, '2020-02-20', 1, 4000, 4000, 'CASH',
                 'OPEN', '2020-02-10T05:00:00Z', now(), now())`,
        [number, branch, headId, variant.rows[0]!.id, department.rows[0]!.id],
      );
      await client.query("commit");
      ids = { number, category: category.rows[0]!.id };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    await drizzle(client, { schema }).transaction((tx) => refreshAnalytics(tx));
    return ids;
  });
}

test("6.5a: the Principal sees the four blocks of the own branch and opens the orders behind a status count (10 Principal; plan of 6.5a)", async ({
  page,
}) => {
  const { number, category } = await seedPrincipalOrder();
  await page.goto("/login");
  await page.locator("#username").fill(E2E_ROLES.PRINCIPAL.username);
  await page.locator("#password").fill(E2E_ROLES.PRINCIPAL.password);
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto(`/analytics?period=custom&from=2020-02-01&to=2020-02-29&category=${category}`);
  for (const block of ["spending", "principal-spending", "orders", "my-approvals", "warehouse"]) {
    await expect(page.locator(`[data-analytics-block="${block}"]`)).toBeVisible();
  }
  // The Head's blocks are not on the Principal's page.
  await expect(page.locator('[data-analytics-block="speed"]')).toHaveCount(0);
  await expect(page.locator('[data-analytics-block="head-spending"]')).toHaveCount(0);
  expect(await scrollsSideways(page)).toBe(false);

  const status = page.locator('[data-table="statuses"] [data-row="PENDING_PRINCIPAL"] a');
  await expect(status).toHaveText("1");
  await status.click();
  await expect(page).toHaveURL(/\/analytics\/order-status\?/);
  await expect(page.locator("[data-status-row]")).toHaveCount(1);
  await expect(page.locator("[data-status-row]")).toContainText(number);
  await expect(page.locator("[data-status-summary]")).toHaveText(/^1\D/);
  expect(await scrollsSideways(page)).toBe(false);
});

test("6.5b: the Manager sees My orders, My estimates and My cash and opens the orders behind a status count (10 Manager; plan of 6.5b)", async ({
  page,
}) => {
  // The Manager's own order of a new category in EA, first submitted on 10 February 2020.
  const { number, category } = await seedPrincipalOrder(E2E_ROLES.MANAGER.username);
  await page.goto("/login");
  await page.locator("#username").fill(E2E_ROLES.MANAGER.username);
  await page.locator("#password").fill(E2E_ROLES.MANAGER.password);
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto(`/analytics?period=custom&from=2020-02-01&to=2020-02-29&category=${category}`);
  for (const block of ["my-orders", "my-estimates", "my-cash"]) {
    await expect(page.locator(`[data-analytics-block="${block}"]`)).toBeVisible();
  }
  // No Manager filter on the Manager's page (decided item 6), no other role's block.
  await expect(page.locator("[data-filter-manager]")).toHaveCount(0);
  await expect(page.locator('[data-analytics-block="orders"]')).toHaveCount(0);
  expect(await scrollsSideways(page)).toBe(false);

  const status = page.locator('[data-table="my-statuses"] [data-row="PENDING_PRINCIPAL"] a');
  await expect(status).toHaveText("1");
  await status.click();
  await expect(page).toHaveURL(/\/analytics\/order-status\?.*manager=/);
  await expect(page.locator("[data-status-row]")).toHaveCount(1);
  await expect(page.locator("[data-status-row]")).toContainText(number);
  expect(await scrollsSideways(page)).toBe(false);
});
