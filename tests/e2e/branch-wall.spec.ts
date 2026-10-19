import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_ROLES, E2E_WALL_USERS, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";
import { REPORT_MONTH, seedReportRecords } from "./report-records";

// S7 for orders (15-quality-and-acceptance.md: "Principal of branch A opens an order address of
// branch B, and ticks an order of branch B through a forged action. Must end with: 'Not found',
// and the action is refused with nothing saved"; 03-roles-and-permissions.md rules 1 and 8;
// build-plan 2.15). The forged action is the page's own Approve request with one ticked id
// changed to the EB order's (plan of 2.15, decided item 3, Look first; review correction 3). The
// Principal is shared with other specs that read Uzbek, so this one reads the Uzbek texts. The
// orders are written straight into the table, each project with its own owner and product.

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

/** Two EA orders and one EB order of the owner, all at Waiting for Principal, of one product. */
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
         values ($1, $2, false, true, now()) returning id`,
        [`O'lchov ${tag}`, `d${tag}`],
      );
      const category = await client.query<{ id: string }>(
        `insert into categories (name, is_active, created_at) values ($1, true, now()) returning id`,
        [`Toifa ${tag}`],
      );
      const product = await client.query<{ id: string }>(
        `insert into products (name, type, category_id, unit_id, is_active, has_variants, created_at)
         values ($1, 'GOODS', $2, $3, true, false, now()) returning id`,
        [`Devor ${tag}`, category.rows[0]!.id, unit.rows[0]!.id],
      );
      const variant = await client.query<{ id: string }>(
        `insert into product_variants (product_id, name, is_default, is_active, created_at)
         values ($1, 'default', true, true, now()) returning id`,
        [product.rows[0]!.id],
      );
      const orders: { id: string; number: string }[] = [];
      for (const code of ["EA", "EA", "EB"]) {
        const department = await client.query<{ id: string }>(
          `insert into departments (branch_id, name, is_active, created_at)
           select id, $1, true, now() from branches where code = $2 returning id`,
          [`Bo'lim ${tag} ${orders.length}`, code],
        );
        // A number far above any the run's own submits reach (05 Order number 2).
        const number = `${code}-26-${8_000_000 + Math.floor(Math.random() * 999_999)}`;
        const order = await client.query<{ id: string }>(
          `insert into orders (number, branch_id, owner_id, created_by, status, variant_id,
                               department_id, needed_by, planned_qty, planned_price, planned_total,
                               payment_type, stock_at_submit, submitted_at, created_at, updated_at)
           select $1, b.id, $2, $2, 'PENDING_PRINCIPAL', $3, $4, '2031-05-01', 2, 5000, 10000,
                  'CASH', 0, now(), now(), now()
             from branches b where b.code = $5
           returning id`,
          [number, ownerId, variant.rows[0]!.id, department.rows[0]!.id, code],
        );
        orders.push({ id: order.rows[0]!.id, number });
      }
      await client.query("commit");
      const [first, second, behind] = orders as [
        (typeof orders)[0],
        (typeof orders)[0],
        (typeof orders)[0],
      ];
      return { ownerId, product: `Devor ${tag}`, own: [first, second], behind };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

/** Each order's status and version, and how many events the three have. */
async function stateOf(ids: readonly string[]) {
  return withDatabase(async (client) => {
    const orders = await client.query<{ id: string; status: string; version: number }>(
      "select id, status, version from orders where id = any($1::uuid[]) order by id",
      [ids],
    );
    const events = await client.query<{ count: number }>(
      "select count(*)::int as count from order_events where order_id = any($1::uuid[])",
      [ids],
    );
    return { orders: orders.rows, events: events.rows[0]!.count };
  });
}

async function signIn(page: Page, user: Person): Promise<void> {
  await page.goto("/login");
  await page.locator("#username").fill(user.username);
  await page.locator("#password").fill(user.password);
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(/\/$/);
}

test("S7: the Principal of EA gets Not found at an EB order's address, and a forged Approve with an EB order is refused whole, nothing saved", async ({
  page,
}, info) => {
  const owner = E2E_WALL_USERS[info.project.name as keyof typeof E2E_WALL_USERS];
  const seeded = await seedWaiting(owner);
  const ids = [...seeded.own.map((order) => order.id), seeded.behind.id];
  const before = await stateOf(ids);
  expect(before.orders.map((order) => [order.status, order.version])).toEqual([
    ["PENDING_PRINCIPAL", 1],
    ["PENDING_PRINCIPAL", 1],
    ["PENDING_PRINCIPAL", 1],
  ]);

  await signIn(page, E2E_ROLES.PRINCIPAL);

  // 1. The address of the EB order: "Not found", and nothing of the order on the page (03 rule 1).
  // No HTTP status is asserted: the page streams behind loading.tsx (review of the plan, Should
  // fix 2).
  await page.goto(`/orders/${seeded.behind.id}`);
  await expect(page.getByRole("heading", { name: uz.notFoundPage.title })).toBeVisible();
  await expect(page.getByText(uz.errors.notFound)).toBeVisible();
  await expect(page.getByText(seeded.behind.number)).toHaveCount(0);
  await expect(page.getByText(seeded.product)).toHaveCount(0);
  await expect(page.getByRole("link", { name: uz.notFoundPage.back })).toHaveAttribute(
    "href",
    "/orders",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);

  // 2. The forged action: the Approve request the page sends, with the second EA order's id
  // changed to the EB order's (15 S7; 03 rule 8).
  const swapped = seeded.own[1];
  let forged = false;
  await page.route("**/orders**", async (route) => {
    const request = route.request();
    const body = request.postData() ?? "";
    if (
      request.method() === "POST" &&
      request.headers()["next-action"] &&
      body.includes("clientKey") &&
      body.includes(swapped!.id)
    ) {
      forged = true;
      await route.continue({ postData: body.replace(swapped!.id, seeded.behind.id) });
      return;
    }
    await route.continue();
  });

  await page.goto(`/orders?status=PENDING_PRINCIPAL&owner=${seeded.ownerId}`);
  const group = page.locator("tbody[data-group]").filter({ hasText: seeded.product });
  await group.locator("input[type=checkbox]").first().check();
  await page
    .locator("[data-list-bar]")
    .getByRole("button", { name: uz.orders.approve.buttonCount.replace("{count}", "2") })
    .click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: uz.orders.approve.button, exact: true }).click();

  // Refused whole: the screen says nothing was approved (06 rule 8).
  await expect(page.getByText("Hech narsa tasdiqlanmadi", { exact: false })).toBeVisible();
  expect(forged).toBe(true);
  // The refusal names nothing of the EB order (03 rule 1; permission review, Should fix 5).
  await expect(page.getByText(seeded.behind.number)).toHaveCount(0);

  // Nothing saved on either branch: every status, version and event as before (15 S7).
  expect(await stateOf(ids)).toEqual(before);
});

/** Two products of one tag, one with stock in EA and one in EB, written straight into the tables. */
async function seedStock() {
  return withDatabase(async (client) => {
    await client.query("begin");
    try {
      const tag = randomUUID().slice(0, 8);
      const unit = await client.query<{ id: string }>(
        `insert into units (name, short_name, allow_decimal, is_active, created_at)
         values ($1, $2, false, true, now()) returning id`,
        [`O'lchov ${tag}`, `s${tag}`],
      );
      const category = await client.query<{ id: string }>(
        `insert into categories (name, is_active, created_at) values ($1, true, now()) returning id`,
        [`Toifa ${tag}`],
      );
      const names: Record<"EA" | "EB", string> = { EA: `Ombor ${tag} A`, EB: `Ombor ${tag} B` };
      const variants: Partial<Record<"EA" | "EB", string>> = {};
      for (const code of ["EA", "EB"] as const) {
        const product = await client.query<{ id: string }>(
          `insert into products (name, type, category_id, unit_id, is_active, has_variants, created_at)
           values ($1, 'GOODS', $2, $3, true, false, now()) returning id`,
          [names[code], category.rows[0]!.id, unit.rows[0]!.id],
        );
        const variant = await client.query<{ id: string }>(
          `insert into product_variants (product_id, name, is_default, is_active, created_at)
           values ($1, 'default', true, true, now()) returning id`,
          [product.rows[0]!.id],
        );
        variants[code] = variant.rows[0]!.id;
        await client.query(
          `insert into stock_balances (branch_id, variant_id, qty, avg_cost, created_at, updated_at)
           select id, $1, 7, 1500, now(), now() from branches where code = $2`,
          [variant.rows[0]!.id, code],
        );
      }
      const eb = await client.query<{ id: string }>("select id from branches where code = 'EB'");
      await client.query("commit");
      return {
        tag,
        names,
        variants: variants as Record<"EA" | "EB", string>,
        ebId: eb.rows[0]!.id,
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

test("S7, the stock part: the Principal of EA sees EA's stock only, and EB's branch in the address shows none of it", async ({
  page,
}) => {
  const seeded = await seedStock();
  await signIn(page, E2E_ROLES.PRINCIPAL);

  // Stock on hand lists EA's item with its value, and nothing of EB's (03 matrix "See orders,
  // stock and reports": Principal "Own branch"; 15 S7: "The same holds for stock").
  await page.goto(`/warehouse/stock?q=${encodeURIComponent(seeded.tag)}`);
  await expect(page.getByRole("heading", { name: uz.warehouse.stock.title })).toBeVisible();
  const own = page.getByRole("row").filter({ hasText: seeded.names.EA });
  await expect(own).toBeVisible();
  // 7 × 1 500 = 10 500 so'm, from stockValue() (plan of 5.2, decided item 1).
  await expect(own).toContainText(/10\s500/);
  await expect(page.getByText(seeded.names.EB)).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);

  // EB's branch in the address: "Not found" is the empty list, with nothing of either item
  // (03 rule 1; plan of 5.2, decided item 5).
  await page.goto(`/warehouse/stock?branch=${seeded.ebId}&q=${encodeURIComponent(seeded.tag)}`);
  await expect(page.getByText(uz.warehouse.stock.noResultsTitle)).toBeVisible();
  await expect(page.getByText(seeded.names.EB)).toHaveCount(0);
  await expect(page.getByText(seeded.names.EA)).toHaveCount(0);

  // The item card (5.3; progress 5.2 "For 5.3"): EA's item opens from its row; the card of EB's
  // item, and of EA's item with EB's branch in the address, is the "Not found" page with nothing
  // of either item (03 rule 1; 15 S7).
  await page.goto(`/warehouse/stock?q=${encodeURIComponent(seeded.tag)}`);
  await page.getByRole("link", { name: seeded.names.EA }).click();
  await expect(page.getByRole("heading", { name: seeded.names.EA })).toBeVisible();
  for (const variant of [seeded.variants.EB, seeded.variants.EA]) {
    await page.goto(`/warehouse/items/${variant}?branch=${seeded.ebId}`);
    await expect(page.getByRole("heading", { name: uz.notFoundPage.title })).toBeVisible();
    await expect(page.getByText(seeded.names.EB)).toHaveCount(0);
    await expect(page.getByText(seeded.names.EA)).toHaveCount(0);
  }
});

test("S7, the reports part: the Principal of EA gets Not found for EB's branch, the file 404, and EA's report holds nothing of EB's", async ({
  page,
}) => {
  const seeded = await seedReportRecords([
    { code: "EA", day: "2019-06-11", qty: "1.000", price: 4000 },
    { code: "EB", day: "2019-06-11", qty: "1.000", price: 4000 },
  ]);
  const [eaNumber, ebNumber] = seeded.numbers as [string, string];
  await signIn(page, E2E_ROLES.PRINCIPAL);
  const dates = `from=${REPORT_MONTH.from}&to=${REPORT_MONTH.to}&category=${seeded.categoryId}`;

  // EB's branch in the address: "Not found" on every report, and its file is 404 (03 rule 1;
  // 15 S7: "The same holds for stock and reports"; build-plan 6.8).
  for (const report of ["orders", "purchases", "plan", "spending"]) {
    await page.goto(`/reports?report=${report}&branch=${seeded.ebId}&${dates}`);
    await expect(page.getByRole("heading", { name: uz.notFoundPage.title })).toBeVisible();
    await expect(page.getByText(ebNumber)).toHaveCount(0);
  }
  for (const report of ["purchases", "plan", "spending"]) {
    const file = await page.request.get(
      `/reports/download?report=${report}&branch=${seeded.ebId}&${dates}`,
    );
    expect(file.status()).toBe(404);
  }

  // Without a branch: EA's record and its total only (03 matrix: Principal "Own branch").
  await page.goto(`/reports?report=purchases&${dates}`);
  await expect(page.getByRole("link", { name: eaNumber })).toBeVisible();
  await expect(page.getByText(ebNumber)).toHaveCount(0);
  await expect(page.locator("[data-report-summary]")).toContainText(/4\s000/);
});
