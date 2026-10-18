import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_PAGE_USERS, E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build plan 6.2 (Home: Head and Finance), its Done when: "a Finance entry opens the filtered
// order list ready to tick" (11 Interface per role: Finance; plan of 6.2, decided item 3), and the
// Head's waiting line of a branch. Build plan 6.1 (Home: Manager and Principal), its Done when: "Playwright at 375 px: the
// Principal approves a group row of two orders from the home page in two taps"
// (11-screens-and-ux.md, Interface per role: Principal; 06-approval-workflow.md rules 8 and 11
// rule 6; plan of 6.1, decided item 4); and the Manager's home with its three buttons and a list
// that opens the filtered order list (10 Home page per role; 11 Interface per role: Manager). Both
// projects run it, each with its own product. Every e2e person starts in Uzbek (global setup), so
// the spec reads the Uzbek texts. The orders are written straight into the table.

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
 * Two Cash orders of 10 000 so'm of one new product of the owner in EA, at the status given.
 * Urgent ones are pinned on top of the Principal's cards (05 field 14), so no other spec's
 * waiting orders push the card off the first page.
 */
async function seedOrders(owner: Person, status: string, priority: "NORMAL" | "URGENT") {
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
        [`Guruch ${tag}`, category.rows[0]!.id, unit.rows[0]!.id],
      );
      const variant = await client.query<{ id: string }>(
        `insert into product_variants (product_id, name, is_default, is_active, created_at)
         values ($1, 'default', true, true, now()) returning id`,
        [product.rows[0]!.id],
      );
      const ids: string[] = [];
      for (let at = 0; at < 2; at += 1) {
        // A number far above any the run's own submits reach (05 Order number 2).
        const number = `EA-26-${7_000_000 + Math.floor(Math.random() * 999_999)}`;
        const order = await client.query<{ id: string }>(
          `insert into orders (number, branch_id, owner_id, created_by, status, variant_id,
                               department_id, needed_by, planned_qty, planned_price, planned_total,
                               payment_type, priority, urgent_reason, submitted_at, created_at,
                               updated_at)
           select $1, b.id, $2, $2, $5, $3, $4, '2031-05-01', 2, 5000, 10000, 'CASH', $6, $7,
                  now(), now(), now()
             from branches b where b.code = 'EA'
           returning id`,
          [
            number,
            ownerId,
            variant.rows[0]!.id,
            department.rows[0]!.id,
            status,
            priority,
            priority === "URGENT" ? "Dars uchun kerak" : null,
          ],
        );
        ids.push(order.rows[0]!.id);
      }
      await client.query("commit");
      return { ownerId, product: `Guruch ${tag}`, ids };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

async function statusesOf(ids: readonly string[]): Promise<string[]> {
  return withDatabase(async (client) => {
    const found = await client.query<{ status: string }>(
      "select status from orders where id = any($1::uuid[]) order by id",
      [ids],
    );
    return found.rows.map((row) => row.status);
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

test("Done when: the Principal approves a group row of two orders from the home page in two taps (11 Interface per role: Principal; 06 rule 8)", async ({
  page,
}) => {
  const owner = E2E_PAGE_USERS[test.info().project.name as keyof typeof E2E_PAGE_USERS].manager;
  const seeded = await seedOrders(owner, "PENDING_PRINCIPAL", "URGENT");

  await signIn(page, E2E_ROLES.PRINCIPAL);
  const card = page.locator("[data-waiting-card]").filter({ hasText: seeded.product });
  await expect(card).toBeVisible();
  // The card: its total, the urgent label, its two orders.
  await expect(card.locator("[data-card-total]")).toHaveText(/20\s000/);
  await expect(card).toContainText(uz.orders.list.urgent);
  await expect(page.locator("[data-waiting-total]")).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);

  // Tap one: the card's Approve (2); tap two: Approve in the confirmation.
  await card
    .locator("[data-card-actions]")
    .getByRole("button", { name: uz.orders.approve.buttonCount.replace("{count}", "2") })
    .click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: uz.orders.approve.button, exact: true }).click();

  await expect(page.getByText("2 ta buyurtma tasdiqlandi.")).toBeVisible();
  await expect(card).toHaveCount(0);
  expect(await statusesOf(seeded.ids)).toEqual(["PENDING_FINANCE", "PENDING_FINANCE"]);
});

test("the Manager's home: three large buttons, and My open orders opens the filtered order list (10 Home page per role; 11 Interface per role: Manager)", async ({
  page,
}) => {
  const owner = E2E_PAGE_USERS[test.info().project.name as keyof typeof E2E_PAGE_USERS].manager;
  // Open orders, so no other spec's drafts grid of this owner shows them (Sent back is in both).
  const seeded = await seedOrders(owner, "PURCHASING", "NORMAL");

  await signIn(page, owner);
  for (const button of ["newOrder", "recordPurchase", "issue"] as const) {
    await expect(page.locator(`[data-home-button="${button}"]`)).toHaveText(
      uz.home.manager.buttons[button],
    );
  }
  const open = page.locator('[data-home-block="open"]');
  const row = open.locator("[data-home-group]").filter({ hasText: seeded.product });
  await expect(row).toBeVisible();
  // Its progress: nothing received of 4, none of its two orders finished (07 Order progress).
  await expect(row.locator("[data-home-progress]")).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);

  await open.getByRole("link", { name: /^Hammasini/ }).click();
  await expect(page).toHaveURL(new RegExp(`/orders\\?status=PURCHASING&owner=${seeded.ownerId}$`));
  await expect(page.locator("tbody[data-group]").filter({ hasText: seeded.product })).toBeVisible();
});

test("Done when: a Finance entry opens the order list filtered to its orders, ready to tick (11 Interface per role: Finance; plan of 6.2, decided item 3)", async ({
  page,
}) => {
  const people = E2E_PAGE_USERS[test.info().project.name as keyof typeof E2E_PAGE_USERS];
  const seeded = await seedOrders(people.manager, "PENDING_FINANCE", "NORMAL");

  await signIn(page, people.finance);
  const approvals = page.locator('[data-home-block="approvals"]');
  const entry = approvals.getByRole("link", {
    name: uz.home.finance.openOrders
      .replace("{name}", people.manager.fullName)
      .replace("{branch}", "EA"),
  });
  await expect(entry).toBeVisible();
  // The exact cash to give: at least the two seeded Cash orders of 10 000 (other specs may add
  // orders of the same owner).
  await expect(entry).toContainText(/Naqd|naqd/);
  expect(await scrollsSideways(page)).toBe(false);

  await entry.click();
  await expect(page).toHaveURL(
    new RegExp(`/orders\\?branch=[0-9a-f-]+&status=PENDING_FINANCE&owner=${seeded.ownerId}$`),
  );
  const tick = page.getByRole("checkbox", {
    name: uz.orders.list.tickGroup.replace("{product}", seeded.product),
  });
  await tick.check();
  await expect(page.locator("[data-list-bar] [data-ticked-count]")).toHaveText("2 ta buyurtma");
});

test("the Head's home: Waiting for my approval shows the branch's line, which opens that branch's waiting orders (10 Home page per role, Head)", async ({
  page,
}) => {
  const owner = E2E_PAGE_USERS[test.info().project.name as keyof typeof E2E_PAGE_USERS].manager;
  const seeded = await seedOrders(owner, "PENDING_HEAD", "URGENT");

  await signIn(page, E2E_ROLES.HEAD);
  const waiting = page.locator('[data-home-block="waiting"]');
  await expect(waiting.locator('[data-waiting-branch="EA"]')).toBeVisible();
  await expect(
    waiting.locator("[data-home-group]").filter({ hasText: seeded.product }),
  ).toBeVisible();
  for (const block of [
    "overspends",
    "write-offs",
    "suggestions",
    "prompts",
    "stuck",
    "by-status",
    "spending",
  ]) {
    await expect(page.locator(`[data-home-block="${block}"]`)).toBeVisible();
  }
  expect(await scrollsSideways(page)).toBe(false);

  await waiting.locator('[data-waiting-branch="EA"]').click();
  await expect(page).toHaveURL(/\/orders\?branch=[0-9a-f-]+&status=PENDING_HEAD$/);
  await expect(page.locator("tbody[data-group]").filter({ hasText: seeded.product })).toBeVisible();
});
