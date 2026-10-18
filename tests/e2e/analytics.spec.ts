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

test("a Manager's Analytics page has no Plan vs actual block (plan of 6.4, decided item 8)", async ({
  page,
}) => {
  await page.goto("/login");
  await page.locator("#username").fill(E2E_ROLES.MANAGER.username);
  await page.locator("#password").fill(E2E_ROLES.MANAGER.password);
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/analytics");
  await expect(page.locator('[data-analytics-block="spending"]')).toBeVisible();
  await expect(page.locator('[data-analytics-block="plan"]')).toHaveCount(0);
  await expect(page.locator('[data-analytics-block="head-spending"]')).toHaveCount(0);
});
