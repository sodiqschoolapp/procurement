import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build plan 5.8 (Direct entry by the Head). 09-warehouse.md, Direct entry by the Head: branch,
// date, reason, lines with a cost prefilled from the reference price; 15-quality-and-acceptance.md
// S15: "The Head enters 200 chairs that branch CHL already owns. A Manager tries to do the same.
// Stock +200 and the item card says Direct entry. The Manager has no button and the server
// refuses." Here in branch EA of the browser tests: the Head opens the form from Stock on hand,
// chooses EA, adds a product whose cost is prefilled with its reference price, types 200, saves,
// finds 200 in stock and "Direct entry" with the ENT number on the item card. The Manager has no
// button and the address is Not found; the server's refusal is the database test's. Run at 375 px
// (one step at a time) and at 1440 px by the two projects.

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

/** A product of goods with a reference price of 150 000 and no stock anywhere. */
async function seedChairs() {
  return withDatabase(async (client) => {
    await client.query("begin");
    try {
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
      const name = `Stul ${tag}`;
      const product = await client.query<{ id: string }>(
        `insert into products (name, type, category_id, unit_id, is_active, has_variants, created_at)
         values ($1, 'GOODS', $2, $3, true, false, now()) returning id`,
        [name, category.rows[0]!.id, unit.rows[0]!.id],
      );
      const variant = await client.query<{ id: string }>(
        `insert into product_variants (product_id, name, is_default, reference_price, is_active,
                                       created_at)
         values ($1, 'default', true, 150000, true, now()) returning id`,
        [product.rows[0]!.id],
      );
      // A reference price is the newest HEAD row of its history (04 rule 4; migration 0014).
      await client.query(
        `insert into price_history (variant_id, price, source, set_by, created_at)
         select $1, 150000, 'HEAD', id, now() from users where username = $2`,
        [variant.rows[0]!.id, E2E_ROLES.HEAD.username],
      );
      const branch = await client.query<{ id: string }>(
        "select id from branches where code = 'EA'",
      );
      await client.query("commit");
      return { tag, name, variantId: variant.rows[0]!.id, branchId: branch.rows[0]!.id };
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

const texts = uz.warehouse.directEntry;

test("the Head enters 200 chairs EA already owns at the reference price, and the item card says Direct entry (S15)", async ({
  page,
}, testInfo) => {
  const phone = testInfo.project.name === "phone-375";
  const seeded = await seedChairs();
  await signIn(page, E2E_ROLES.HEAD);

  await page.goto("/warehouse/stock");
  await page.getByRole("link", { name: uz.warehouse.stock.directEntry }).click();
  await expect(page).toHaveURL(/\/warehouse\/documents\/new\?type=DIRECT_ENTRY$/);
  await expect(page.getByRole("heading", { level: 1, name: texts.title })).toBeVisible();

  // Step 1: the branch; the reason stays "stock we already had".
  await page.locator("#entry-branch").selectOption(seeded.branchId);
  await expect(page.getByRole("radio", { name: texts.reasons.EXISTING_STOCK })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  if (phone) {
    await expect(page.getByRole("heading", { name: texts.items })).toBeHidden();
    await page.getByRole("button", { name: texts.next }).click();
  }

  // Step 2: the item, its cost prefilled with the reference price.
  await page.getByLabel(texts.search).fill(seeded.tag);
  await page.locator(`[data-pick="${seeded.variantId}"]`).click();
  const line = page.locator(`[data-entry-line="${seeded.variantId}"]`);
  await expect(line.getByLabel(texts.unitCost)).toHaveValue("150000");
  await line.getByLabel(/^Miqdori/).fill("200");
  if (phone) {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);
    await page.getByRole("button", { name: texts.next }).click();
  }
  await expect(page.getByLabel(texts.commentOptional, { exact: true })).toBeVisible();

  // Step 3: save.
  await page.getByRole("button", { name: texts.save }).click();
  const saved = page.locator("[data-entry-saved]");
  await expect(saved).toBeVisible();
  const heading = (await saved.getByRole("heading").textContent()) ?? "";
  const number = /ENT-EA-\d{2}-\d{4,}/.exec(heading)?.[0];
  expect(number).toBeTruthy();

  await page.goto(`/warehouse/stock?q=${encodeURIComponent(seeded.tag)}&branch=${seeded.branchId}`);
  await expect(page.getByRole("row").filter({ hasText: seeded.name })).toContainText("200");
  // The +200 in the balance too: the product had no stock anywhere (plan of 9.1c, S15).
  const balance = await withDatabase((client) =>
    client.query<{ qty: string }>(
      "select qty::text as qty from stock_balances where branch_id = $1 and variant_id = $2",
      [seeded.branchId, seeded.variantId],
    ),
  );
  expect(balance.rows.map((row) => row.qty)).toEqual(["200.000"]);
  await page.getByRole("link", { name: seeded.name }).click();
  const entered = page.getByRole("row").filter({ hasText: uz.warehouse.item.types.DIRECT_ENTRY });
  await expect(entered).toContainText(number!);
  await expect(entered).toContainText("+200");
});

test("the Manager has no Direct entry button and the form is Not found (S15; 03 matrix: Enter stock directly)", async ({
  page,
}) => {
  await signIn(page, E2E_ROLES.MANAGER);
  await page.goto("/warehouse/stock");
  await expect(page.getByRole("link", { name: uz.warehouse.stock.newReturn })).toBeVisible();
  await expect(page.getByRole("link", { name: uz.warehouse.stock.directEntry })).toHaveCount(0);
  await page.goto("/warehouse/documents/new?type=DIRECT_ENTRY");
  await expect(page.getByRole("heading", { name: uz.notFoundPage.title })).toBeVisible();
  await expect(page.getByRole("heading", { name: texts.title })).toHaveCount(0);
});
