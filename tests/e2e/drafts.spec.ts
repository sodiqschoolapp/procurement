import { randomUUID } from "node:crypto";

import { type Locator, type Page, expect, test } from "@playwright/test";
import pg from "pg";

import en from "../../src/i18n/messages/en.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_DRAFT_USERS, E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build-plan 2.5b, Done when: the drafts grid on /orders. 05-order-request-form.md (Order fields
// 2, 7, 10, 11, 13, 16; Drafts 1 to 3; the totals under the list; Ticking and filters: Price
// hint); 11-screens-and-ux.md (Order list layout 3; rules 4, 6, 13); 06-approval-workflow.md
// (Statuses: Draft, "Visible to the owner and the Head only"); plan of 2.5b and its review
// (correction 3: a double click adds once; Must fix 8: leaving with unsaved typing asks first).
// Each project has its own Manager (E2E_DRAFT_USERS), whose drafts the test clears first, and
// every catalog name is new on every run. The Manager works in English, so the texts are the
// Done-when's own ("+35% vs catalog price").

test.describe.configure({ mode: "serial" });

const t = en.orders;
const NBSP = " ";
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

/** An invented product without subtypes, with a reference price, in its own category and measure. */
/**
 * An invented product in its own category and measure: with named subtypes when given (each with
 * its reference price), else with its hidden default subtype (04 rule 1).
 */
async function insertProduct(
  client: pg.Client,
  name: string,
  referencePrice: number,
  subtypes: readonly { name: string; referencePrice: number }[] = [],
) {
  const tag = randomUUID().slice(0, 8);
  await client.query("begin");
  try {
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
      `insert into products (name, type, category_id, unit_id, reference_price, is_active, has_variants, created_at)
       values ($1, 'GOODS', $2, $3, $4, true, $5, now()) returning id`,
      [name, category.rows[0]!.id, unit.rows[0]!.id, referencePrice, subtypes.length > 0],
    );
    const variants =
      subtypes.length > 0 ? subtypes : [{ name: "default", referencePrice, isDefault: true }];
    for (const variant of variants) {
      const made = await client.query<{ id: string }>(
        `insert into product_variants (product_id, name, is_default, reference_price, is_active, created_at)
         values ($1, $2, $3, $4, true, now()) returning id`,
        [product.rows[0]!.id, variant.name, "isDefault" in variant, variant.referencePrice],
      );
      // A reference price is the newest HEAD row of its history (04 rule 4; migration 0014).
      await client.query(
        `insert into price_history (variant_id, price, source, set_by, created_at)
         select $1, $2, 'HEAD', id, now() from users where username = $3`,
        [made.rows[0]!.id, variant.referencePrice, E2E_ROLES.HEAD.username],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function insertDepartment(client: pg.Client, name: string) {
  await client.query(
    `insert into departments (branch_id, name, responsible_name, is_active, created_at)
     select id, $1, 'Sinov Masʼul', true, now() from branches where code = 'EA'`,
    [name],
  );
}

/** The person's own never-submitted drafts go, so each run starts with an empty grid. */
async function freshGrid(person: Person) {
  await withDatabase(async (client) => {
    await client.query("update users set locale = 'en' where username = $1", [person.username]);
    await client.query(
      `delete from orders where status = 'DRAFT' and number is null
         and owner_id = (select id from users where username = $1)`,
      [person.username],
    );
  });
}

async function signIn(page: Page, user: Person): Promise<void> {
  await page.goto("/login");
  await page.locator("#username").fill(user.username);
  await page.locator("#password").fill(user.password);
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(/\/$/);
}

function addForm(page: Page): Locator {
  return page.getByRole("form", { name: t.add.title });
}

function rows(page: Page): Locator {
  return page.locator("tbody tr[data-draft]");
}

async function addDraft(
  page: Page,
  product: string,
  department: string,
  quantity: string,
  click: "click" | "dblclick" = "click",
) {
  const form = addForm(page);
  const picker = form.getByRole("combobox", { name: t.columns.product });
  // The search is by the product's name; the hit is the product and its subtype. Typed again
  // until the hit shows: text typed before the page has hydrated is not seen by the picker.
  const option = page.getByRole("option", { name: new RegExp(product) });
  await expect(async () => {
    await picker.fill(product.split(" — ")[0]!);
    await expect(option).toBeVisible({ timeout: 2000 });
  }).toPass();
  // 05 field 2: the hit shows its category, type and stock.
  await expect(option).toContainText(en.catalog.productType.GOODS);
  await expect(option).toContainText("In stock: 0");
  await option.click();
  await form.getByLabel(t.columns.requestedBy).selectOption({ label: department });
  await form.getByLabel(t.columns.quantity).fill(quantity);
  await form.getByRole("button", { name: t.add.button })[click]();
}

function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

const run = randomUUID().slice(0, 8);
const pen = `Ruchka ${run}`;
const paper = `Qog'oz ${run}`;
const bluePen = `${pen} — Ko'k`;
const science = `Fizika ${run}`;
const music = `Musiqa ${run}`;

test.beforeAll(async () => {
  await withDatabase(async (client) => {
    // The pen has two subtypes: one pick in the picker names product and subtype (05 fields 2, 3).
    await insertProduct(client, pen, 5000, [
      { name: "Ko'k", referencePrice: 5000 },
      { name: "Qora", referencePrice: 7000 },
    ]);
    await insertProduct(client, paper, 2000);
    await insertDepartment(client, science);
    await insertDepartment(client, music);
  });
});

test("Done when: add through the picker, merge, ticked totals, delete (05 Drafts 1 to 3)", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop-1440", "The Done-when is at 1440 px.");
  const manager = E2E_DRAFT_USERS["desktop-1440"];
  await freshGrid(manager);
  await signIn(page, manager);
  await page.goto("/orders");
  await expect(page.getByRole("heading", { name: t.empty.title })).toBeVisible();

  // A double click on "Add" sends one add (correction 3; developer-rules rule 8).
  await addDraft(page, bluePen, science, "10", "dblclick");
  await expect(rows(page)).toHaveCount(1);
  const penRow = rows(page).first();
  await expect(penRow).toContainText(t.save.saved);
  await expect(penRow.getByRole("combobox", { name: t.columns.product })).toHaveValue(bluePen);

  // 05 field 11 and 16; Price hint: 10 × 6 750 = 67 500 so'm, 35% above the reference 5 000.
  const price = penRow.getByLabel(t.columns.price);
  await expect(price).toHaveValue("5000");
  await price.fill("6750");
  await price.press("Tab");
  await expect(penRow.locator('[data-cell="total"]')).toHaveText(som("67500"));
  await expect(penRow.locator('[data-cell="price-hint"]')).toHaveText("+35% vs catalog price");
  await expect(penRow).toContainText(t.save.saved);

  // 05 Drafts 2: the same subtype for the same department raises the draft.
  await addDraft(page, bluePen, science, "10");
  await expect(page.getByText("Added to your draft: now 20")).toBeVisible();
  await expect(rows(page)).toHaveCount(1);
  await expect(penRow.getByLabel(t.columns.quantity)).toHaveValue("20");
  await expect(penRow.locator('[data-cell="total"]')).toHaveText(som("135000"));

  // Two more drafts: 2 × 2 000 by bank transfer, and 1 × 2 000 in cash for another department.
  await addDraft(page, paper, science, "2");
  await expect(rows(page)).toHaveCount(2);
  const transfer = rows(page).nth(1);
  await transfer.getByLabel(t.columns.paymentType).selectOption("TRANSFER");
  await expect(transfer).toContainText(t.save.saved);
  await addDraft(page, paper, music, "1");
  await expect(rows(page)).toHaveCount(3);
  const cash = rows(page).nth(2);
  await expect(cash.locator('[data-cell="total"]')).toHaveText(som("2000"));

  // 05, the totals under the list: the two ticked drafts only; the pen draft stays unticked (D40).
  await transfer.getByRole("checkbox").check();
  await cash.getByRole("checkbox").check();
  const totals = page.getByRole("region", { name: t.totals.title });
  await expect(totals).toContainText("2 drafts");
  const line = (key: string) => totals.locator(`[data-total="${key}"] dd`);
  await expect(line("goods")).toHaveText(som("6000"));
  await expect(line("extras")).toHaveText(som("0"));
  await expect(line("grand")).toHaveText(som("6000"));
  await expect(line("CASH")).toHaveText(som("2000"));
  await expect(line("TRANSFER")).toHaveText(som("4000"));
  await expect(line("CARD")).toHaveText(som("0"));

  // 11 rule 6: leaving with a typed, unsaved cell asks first.
  const comment = penRow.getByLabel(t.columns.comment);
  await comment.fill("Ko'k rangli");
  await page.getByRole("link", { name: en.shell.menu.home }).first().click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: en.common.cancel }).click();
  await comment.press("Enter");
  await expect(penRow).toContainText(t.save.saved);

  // 05 Drafts 3: deleting asks first and removes the row.
  await cash.getByRole("button", { name: t.delete.label.replace("{product}", paper) }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText(t.delete.title);
  await dialog.getByRole("button", { name: t.delete.confirm }).click();
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByText(t.delete.done)).toBeVisible();
});

test("the Principal of the branch sees no draft (06 Statuses: Draft)", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop-1440", "Once is enough.");
  // The desktop Manager's drafts of the test above are in branch EA, the Principal's branch (D40).
  const there = await withDatabase(async (client) => {
    const { rows: found } = await client.query(
      `select 1 from orders o join product_variants v on v.id = o.variant_id
         join products p on p.id = v.product_id join branches b on b.id = o.branch_id
        where p.name = $1 and b.code = 'EA' and o.status = 'DRAFT' and o.number is null`,
      [pen],
    );
    return found.length;
  });
  expect(there).toBeGreaterThan(0);
  await signIn(page, E2E_ROLES.PRINCIPAL);
  await page.goto("/orders");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator("table")).toHaveCount(0);
  await expect(page.getByText(pen)).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(pen);
});

test("/orders opens at 375 px with no horizontal page scroll (11 rule 13)", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone-375", "The phone width.");
  const manager = E2E_DRAFT_USERS["phone-375"];
  await freshGrid(manager);
  await signIn(page, manager);
  await page.goto("/orders");
  await addDraft(page, paper, music, "3");
  await expect(rows(page)).toHaveCount(1);
  expect(await scrollsSideways(page)).toBe(false);
});
