import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { type Page, expect, test } from "@playwright/test";
import ExcelJS from "exceljs";
import pg from "pg";

import en from "../../src/i18n/messages/en.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_LIST_USERS, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build-plan 2.8, Done when "By hand: a filtered link reopens the same view", kept as a test;
// 05-order-request-form.md (Group rows 1 to 3; Ticking and filters); 11-screens-and-ux.md (Order
// list layout 2 and 4; rules 8 and 13); review of the plan, correction 1 (ticks survive a change of
// page; a change of filter clears them). Each project has its own Manager (E2E_LIST_USERS) and the
// list is filtered to that owner, so the other project's run never shows here. The orders are
// written submitted straight into the table: the test is about the list, not about Submit.

test.describe.configure({ mode: "serial" });

const t = en.orders.list;
const NBSP = " ";
const som = (digits: string) => `${digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)}${NBSP}so'm`;

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
 * The person's orders of the run: `groups` products in EA, the first with three waiting orders
 * of 2 × 5 000 so'm, each other with one. Earlier runs' orders are cancelled, so the filtered list
 * holds this run only. Returns the owner's id.
 */
async function seedOrders(person: Person, run: string, groups: number): Promise<string> {
  return withDatabase(async (client) => {
    await client.query("begin");
    try {
      await client.query("update users set locale = 'en' where username = $1", [person.username]);
      const owner = await client.query<{ id: string }>("select id from users where username = $1", [
        person.username,
      ]);
      const ownerId = owner.rows[0]!.id;
      await client.query(
        `update orders set status = 'CANCELLED' where owner_id = $1 and status = 'PENDING_HEAD'`,
        [ownerId],
      );
      const tag = randomUUID().slice(0, 8);
      const unit = await client.query<{ id: string }>(
        `insert into units (name, short_name, allow_decimal, is_active, created_at)
         values ($1, $2, false, true, now()) returning id`,
        [`O'lchov ${tag}`, `l${tag}`],
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
      for (let index = 0; index < groups; index += 1) {
        const product = await client.query<{ id: string }>(
          `insert into products (name, type, category_id, unit_id, is_active, has_variants, created_at)
           values ($1, 'GOODS', $2, $3, true, false, now()) returning id`,
          [
            `${index === 0 ? "Ruchka" : "Yelim"} ${run} ${String(index).padStart(2, "0")}`,
            category.rows[0]!.id,
            unit.rows[0]!.id,
          ],
        );
        const variant = await client.query<{ id: string }>(
          `insert into product_variants (product_id, name, is_default, is_active, created_at)
           values ($1, 'default', true, true, now()) returning id`,
          [product.rows[0]!.id],
        );
        for (let copy = 0; copy < (index === 0 ? 3 : 1); copy += 1) {
          const number = `EA-26-${String(Math.floor(Math.random() * 9e8) + 1e8)}`;
          await client.query(
            `insert into orders (number, branch_id, owner_id, created_by, status, variant_id,
                                 department_id, needed_by, planned_qty, planned_price, planned_total,
                                 payment_type, submitted_at, created_at, updated_at)
             select $1, b.id, $2, $2, 'PENDING_HEAD', $3, $4, '2031-05-01', 2, 5000, 10000,
                    'CASH', now(), now(), now()
               from branches b where b.code = 'EA'`,
            [number, ownerId, variant.rows[0]!.id, department.rows[0]!.id],
          );
        }
      }
      await client.query("commit");
      return ownerId;
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

const tickGroup = (page: Page, product: string) =>
  page.getByRole("checkbox", { name: t.tickGroup.replace("{product}", product) });

test("a filtered link reopens the same view; a group row opens to its orders and ticks them all (05 Group rows; 11 rule 8)", async ({
  page,
}, info) => {
  const person = E2E_LIST_USERS[info.project.name as keyof typeof E2E_LIST_USERS];
  const run = randomUUID().slice(0, 8);
  const ownerId = await seedOrders(person, run, 2);
  const pens = `Ruchka ${run} 00`;
  await signIn(page, person);
  const address = `/orders?status=PENDING_HEAD&owner=${ownerId}&sort=submitted`;
  await page.goto(address);

  const group = page.locator("tbody[data-group]").filter({ has: tickGroup(page, pens) });
  await expect(page.locator("tbody[data-group]")).toHaveCount(2);
  await expect(group).toContainText("3 orders");
  await expect(group).toContainText(som("30000"));

  await page.getByRole("button", { name: t.showOrders.replace("{product}", pens) }).click();
  await expect(group.locator("tr[data-order]")).toHaveCount(3);

  await tickGroup(page, pens).check();
  const bar = page.locator("[data-list-bar]");
  await expect(bar.locator("[data-ticked-count]")).toHaveText("3 orders");
  await expect(bar.locator('[data-total="grand"]')).toContainText(som("30000"));
  expect(await scrollsSideways(page)).toBe(false);

  // The same link opened again shows the same filters and the same rows.
  await page.goto(address);
  await expect(page).toHaveURL(new RegExp(`status=PENDING_HEAD.*owner=${ownerId}.*sort=submitted`));
  if (info.project.name === "phone-375") {
    await page.getByRole("button", { name: t.filters.openCount.replace("{count}", "2") }).click();
  }
  await expect(page.getByLabel(t.filters.status, { exact: true })).toHaveValue("PENDING_HEAD");
  await expect(page.getByLabel(t.filters.sort, { exact: true })).toHaveValue("submitted");
  await expect(page.locator("tbody[data-group]")).toHaveCount(2);
  await expect(group).toContainText("3 orders");
});

test("a click anywhere on a group row opens it, on an order row opens the order; a tick box only ticks (design system, Panels and lists; redesign of 22.10.2026)", async ({
  page,
}, info) => {
  const person = E2E_LIST_USERS[info.project.name as keyof typeof E2E_LIST_USERS];
  const run = randomUUID().slice(0, 8);
  const ownerId = await seedOrders(person, run, 1);
  const pens = `Ruchka ${run} 00`;
  await signIn(page, person);
  await page.goto(`/orders?status=PENDING_HEAD&owner=${ownerId}`);

  const group = page.locator("tbody[data-group]").filter({ has: tickGroup(page, pens) });
  const toggle = page.getByRole("button", { name: t.showOrders.replace("{product}", pens) });
  // The tick box ticks and leaves the row closed.
  await tickGroup(page, pens).check();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await tickGroup(page, pens).uncheck();

  // The product's name opens the row, as the toggle does.
  await group.getByText(pens, { exact: true }).click();
  await expect(group.locator("tr[data-order]")).toHaveCount(3);

  // An order row's department opens the order, as its number does.
  const first = group.locator("tr[data-order]").first();
  const href = await first.locator("a[data-row-link]").getAttribute("href");
  await first
    .locator("td")
    .filter({ hasText: /Bo'lim/ })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
});

test("ticks survive a change of page; a change of filter clears them (review of the plan, correction 1)", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop-1440", "The paging is the same at both widths.");
  const person = E2E_LIST_USERS["desktop-1440"];
  const run = randomUUID().slice(0, 8);
  const ownerId = await seedOrders(person, run, 26);
  const pens = `Ruchka ${run} 00`;
  await signIn(page, person);
  await page.goto(`/orders?status=PENDING_HEAD&owner=${ownerId}&sort=product`);
  await expect(page.locator("tbody[data-group]")).toHaveCount(25);
  await tickGroup(page, pens).check();
  const bar = page.locator("[data-list-bar]");
  await expect(bar.locator("[data-ticked-count]")).toHaveText("3 orders");

  await page.getByRole("link", { name: en.pager.next }).first().click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator("tbody[data-group]")).toHaveCount(1);
  await expect(bar.locator("[data-ticked-count]")).toHaveText("3 orders");

  // The status select stands behind "More filters" beside the status tabs (redesign of
  // 21.10.2026); the status is the one filter in force there.
  await page.getByRole("button", { name: t.filters.moreCount.replace("{count}", "1") }).click();
  await page.getByLabel(t.filters.status, { exact: true }).selectOption("PENDING_PRINCIPAL");
  await expect(page).toHaveURL(/status=PENDING_PRINCIPAL/);
  await expect(bar).toHaveCount(0);
});

test("the list downloads as Excel and PDF with its filters (05 Download; 11 Order list layout 1; plan of 2.14)", async ({
  page,
}, info) => {
  const person = E2E_LIST_USERS[info.project.name as keyof typeof E2E_LIST_USERS];
  const run = randomUUID().slice(0, 8);
  const ownerId = await seedOrders(person, run, 2);
  await signIn(page, person);
  await page.goto(`/orders?status=PENDING_HEAD&owner=${ownerId}`);
  await expect(page.locator("tbody[data-group]")).toHaveCount(2);

  const excelLink = page.getByRole("link", { name: en.orders.download.excel });
  const pdfLink = page.getByRole("link", { name: en.orders.download.pdf });
  await expect(excelLink).toBeVisible();
  await expect(pdfLink).toBeVisible();
  // The links carry the list's filters, so the file holds what the list shows.
  await expect(excelLink).toHaveAttribute("href", new RegExp(`owner=${ownerId}`));
  expect(await scrollsSideways(page)).toBe(false);
  if (info.project.name === "phone-375") {
    const box = await excelLink.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  const [excel] = await Promise.all([page.waitForEvent("download"), excelLink.click()]);
  expect(excel.suggestedFilename()).toMatch(/^orders-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await excel.path());
  const products: string[] = [];
  workbook.worksheets[0]!.getColumn(6).eachCell((cell) => products.push(String(cell.value)));
  expect(products.filter((name) => name.includes(run))).toHaveLength(4);

  const [pdf] = await Promise.all([page.waitForEvent("download"), pdfLink.click()]);
  expect(pdf.suggestedFilename()).toMatch(/^orders-\d{4}-\d{2}-\d{2}\.pdf$/);
  const bytes = await readFile(await pdf.path());
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
});
