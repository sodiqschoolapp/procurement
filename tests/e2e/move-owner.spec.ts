import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import en from "../../src/i18n/messages/en.json" with { type: "json" };
import ru from "../../src/i18n/messages/ru.json" with { type: "json" };
import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build plan 4.10 (Move orders to another Manager), the plan's Playwright line: the Head ticks
// two Open orders of one Manager on the order list, clicks "Move to another Manager", picks a
// second Manager of the branch and confirms (03-roles-and-permissions.md rule 7;
// 11-screens-and-ux.md rule 6); both orders then belong to that Manager. Run at 375 px and at
// 1440 px by the two projects. The seed has one Manager per branch, so the test inserts its own
// two invented Managers of EA, who never sign in. The Head is shared with other specs, so his
// language is left as it is and the buttons are found by their label in any of the three
// languages.

const MOVE = new RegExp(
  `^(${[uz, ru, en].map((messages) => messages.orders.moves.button.MOVE_OWNER).join("|")})$`,
);

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

/** Two invented Managers of EA, and two Open orders of the first at a cash count of 0. */
async function seedTwoOrders() {
  return withDatabase(async (client) => {
    await client.query("begin");
    try {
      const tag = randomUUID().slice(0, 8);
      const manager = async (name: string, phone: string) => {
        const user = await client.query<{ id: string }>(
          `insert into users (full_name, username, email, phone, role, created_at, updated_at)
           values ($1, $2, $3, $4, 'MANAGER', now(), now()) returning id`,
          [
            `${name} ${tag}`,
            `e2e_mv_${name.toLowerCase()}_${tag}`,
            `${name}.${tag}@example.invalid`,
            phone,
          ],
        );
        const id = user.rows[0]!.id;
        await client.query(
          `insert into user_branches (user_id, branch_id, user_role, user_is_active, created_at)
           select $1, id, 'MANAGER', true, now() from branches where code = 'EA'`,
          [id],
        );
        return { id, name: `${name} ${tag}` };
      };
      const from = await manager("Aziz", "+998 90 000 98 01");
      const to = await manager("Lola", "+998 90 000 98 02");
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
      const orders: { id: string; product: string }[] = [];
      for (const label of ["Daftar", "Qalam"]) {
        const name = `${label} ${tag}`;
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
        const order = await client.query<{ id: string }>(
          `insert into orders (number, branch_id, owner_id, created_by, status, progress, variant_id,
                               department_id, needed_by, planned_qty, planned_price, planned_total,
                               payment_type, stock_at_submit, submitted_at, approved_at, created_at,
                               updated_at)
           select $1, b.id, $2, $2, 'PURCHASING', 'OPEN', $3, $4, '2031-05-01', 2, 5000, 10000,
                  'TRANSFER', 0, now(), now(), now(), now()
             from branches b where b.code = 'EA'
           returning id`,
          [number, from.id, variant.rows[0]!.id, department.rows[0]!.id],
        );
        orders.push({ id: order.rows[0]!.id, product: name });
      }
      await client.query("commit");
      return { from, to, orders };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

async function ownersOf(ids: readonly string[]): Promise<string[]> {
  return withDatabase(async (client) => {
    const found = await client.query<{ owner_id: string }>(
      "select owner_id from orders where id = any($1::uuid[]) order by id",
      [ids],
    );
    return found.rows.map((row) => row.owner_id);
  });
}

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#username").fill(E2E_ROLES.HEAD.username);
  await page.locator("#password").fill(E2E_ROLES.HEAD.password);
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(/\/$/);
}

test("the Head moves two ticked orders to another Manager of the branch (03 rule 7; 11 rule 6)", async ({
  page,
}) => {
  const seeded = await seedTwoOrders();

  await signIn(page);
  await page.goto(`/orders?status=PURCHASING&owner=${seeded.from.id}`);
  const bar = page.locator("[data-list-bar]");
  const [first, second] = seeded.orders.map((order) =>
    page.locator("tbody[data-group]").filter({ hasText: order.product }),
  );
  await first!.locator("input[type=checkbox]").first().check();
  await expect(bar).toBeVisible();
  // On a phone the sticky bar can cover the lower row's tick box (as close-exact.spec.ts).
  const secondBox = second!.locator("input[type=checkbox]").first();
  await secondBox.dispatchEvent("click");
  await expect(secondBox).toBeChecked();

  await bar.locator('[data-move="MOVE_OWNER"]').click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole("button", { name: MOVE });
  // Nothing is chosen yet: the move waits for a Manager.
  await expect(confirm).toBeDisabled();
  const select = dialog.locator("select[data-move-owner-select]");
  await expect(select.locator(`option[value="${seeded.to.id}"]`)).toHaveText(seeded.to.name);
  await select.selectOption(seeded.to.id);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    ),
  ).toBe(false);
  await confirm.click();
  await expect(dialog).toBeHidden();

  await expect
    .poll(() => ownersOf(seeded.orders.map((order) => order.id)))
    .toEqual([seeded.to.id, seeded.to.id]);
});
