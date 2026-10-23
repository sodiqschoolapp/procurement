import { randomUUID } from "node:crypto";

import { type Locator, type Page, expect, test } from "@playwright/test";
import pg from "pg";

import en from "../../src/i18n/messages/en.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_DRAFT_USERS, E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";
import { shownAmount } from "./shown-amount";

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
// 2.6: three products, each of its own department, so no merge can hide a double add (D40).
const notebook = `Daftar ${run}`;
const marker = `Marker ${run}`;
const chalk = `Bor ${run}`;
const history = `Tarix ${run}`;
// 2.7: products of the Submit tests, each in its own row.
const stapler = `Stepler ${run}`;
const tape = `Skotch ${run}`;
const glue = `Kley ${run}`;
// 2.7b: the products of the confirmation test, so the 2.7 tests read only their own orders.
const ruler = `Chizgʻich ${run}`;
const eraser = `Oʻchirgʻich ${run}`;
const KEYBOARD_DRAFTS = [
  { product: notebook, department: science, quantity: "4" },
  { product: marker, department: music, quantity: "6" },
  { product: chalk, department: history, quantity: "8" },
] as const;

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
    await insertProduct(client, notebook, 3000);
    await insertProduct(client, marker, 9000);
    await insertProduct(client, chalk, 1500);
    await insertDepartment(client, history);
    await insertProduct(client, stapler, 12000);
    await insertProduct(client, tape, 4000);
    await insertProduct(client, glue, 3000);
    await insertProduct(client, ruler, 2500);
    await insertProduct(client, eraser, 1000);
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
  await expect(price).toHaveValue(shownAmount("5000"));
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
  // Since 2.8 the Principal has the order list, a table of submitted orders; no draft row and no
  // drafts grid (plan of 2.8, decided item 1).
  await expect(page.locator("tr[data-draft]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: t.draftsTitle })).toHaveCount(0);
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

// Build-plan 2.6 (11-screens-and-ux.md, Rules for a smooth feel 2, 7 and 13; plan of 2.6 and its
// review, corrections 3 and 4). These run after the tests above: each starts from an empty grid.

/** The never-submitted drafts of the person, with product, department and quantity. */
async function draftsOf(person: Person) {
  return withDatabase(async (client) => {
    const { rows: found } = await client.query<{
      product: string;
      department: string;
      quantity: string;
      price: string | null;
    }>(
      `select p.name as product, d.name as department, o.planned_qty::text as quantity,
              o.planned_price::text as price
         from orders o join product_variants v on v.id = o.variant_id
         join products p on p.id = v.product_id join departments d on d.id = o.department_id
        where o.status = 'DRAFT' and o.number is null
          and o.owner_id = (select id from users where username = $1)
        order by o.created_at`,
      [person.username],
    );
    return found;
  });
}

/**
 * React's "Maximum update depth exceeded" errors of the page (a render loop of the typed cells,
 * found and fixed in the build of 2.6): collected from the start, asserted empty at the end.
 */
function renderLoops(page: Page): string[] {
  const found: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && message.text().includes("Maximum update depth")) {
      found.push(message.text());
    }
  });
  return found;
}

async function focusedId(page: Page): Promise<string> {
  return page.evaluate(() => document.activeElement?.id ?? "");
}

test("Done when: three drafts are added with the keyboard only (11 rules 2 and 13)", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop-1440", "The Done-when is at 1440 px.");
  const manager = E2E_DRAFT_USERS["desktop-1440"];
  const loops = renderLoops(page);
  await freshGrid(manager);
  await signIn(page, manager);
  await page.goto("/orders");
  await page.waitForLoadState("networkidle");

  // From here to the third row: only keyboard.press and keyboard.type (review, correction 4).
  for (let presses = 0; (await focusedId(page)) !== "add-product"; presses += 1) {
    expect(presses, "Tab reaches the product cell of the add row").toBeLessThan(80);
    await page.keyboard.press("Tab");
  }
  for (const [at, draft] of KEYBOARD_DRAFTS.entries()) {
    const option = page.getByRole("option", { name: draft.product });
    // Typed again until the search shows the product as the active hit (typing before the page
    // has hydrated, or before the search answered, is not seen by the picker).
    await expect(async () => {
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type(draft.product);
      await expect(option).toHaveAttribute("aria-selected", "true", { timeout: 2000 });
    }).toPass();
    await page.keyboard.press("Enter");
    // Enter on the picked product moves to "Department" (decided item 2).
    await expect(page.locator("#add-department")).toBeFocused();
    await page.keyboard.type(draft.department);
    await expect(page.locator("#add-department option:checked")).toHaveText(draft.department);
    await page.keyboard.press("Tab");
    await expect(page.locator("#add-quantity")).toBeFocused();
    await page.keyboard.type(draft.quantity);
    // Enter on the last row adds a draft (11 rule 2), and the focus is back on the product cell.
    await page.keyboard.press("Enter");
    await expect(rows(page)).toHaveCount(at + 1);
    await expect(page.locator("#add-product")).toBeFocused();
  }

  // Three drafts, one per pair, in the database too: nothing was added twice (D40).
  expect(
    (await draftsOf(manager)).map((one) => [one.product, one.department, Number(one.quantity)]),
  ).toEqual(KEYBOARD_DRAFTS.map((one) => [one.product, one.department, Number(one.quantity)]));

  // Enter in a typed cell saves it and moves to the same column of the next row (11 rule 2).
  const firstQuantity = rows(page).nth(0).getByLabel(t.columns.quantity);
  await firstQuantity.focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("5");
  await page.keyboard.press("Enter");
  await expect(rows(page).nth(1).getByLabel(t.columns.quantity)).toBeFocused();
  await expect(rows(page).nth(0)).toContainText(t.save.saved);
  await expect(firstQuantity).toHaveValue("5");
  // Shift+Enter goes back up; Enter on the last draft goes to the add row.
  await page.keyboard.press("Shift+Enter");
  await expect(firstQuantity).toBeFocused();
  await rows(page).nth(2).getByLabel(t.columns.quantity).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#add-product")).toBeFocused();
  expect(loops).toEqual([]);
});

test("a save made offline keeps what was typed and is sent when the connection is back (11 rule 7)", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "desktop-1440", "Once is enough.");
  const manager = E2E_DRAFT_USERS["desktop-1440"];
  // The three drafts of the keyboard test above.
  expect(await draftsOf(manager)).toHaveLength(3);
  await signIn(page, manager);
  await page.goto("/orders");
  const row = rows(page).nth(1);
  const price = row.getByLabel(t.columns.price);
  await expect(price).toHaveValue(shownAmount("9000"));

  await context.setOffline(true);
  await price.fill("9500");
  await price.press("Tab");
  await expect(row).toContainText(t.save.retrying);
  await expect(price).toHaveValue(shownAmount("9500"));

  await context.setOffline(false);
  await expect(row).toContainText(t.save.saved);
  await expect(price).toHaveValue(shownAmount("9500"));
  const after = await draftsOf(manager);
  expect(after).toHaveLength(3);
  expect(after[1]).toMatchObject({ product: marker, price: "9500" });
});

test("an add sent offline keeps its fields and makes one draft when the connection is back (developer-rules rule 8; 11 rule 7)", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "desktop-1440", "Once is enough.");
  const manager = E2E_DRAFT_USERS["desktop-1440"];
  expect(await draftsOf(manager)).toHaveLength(3);
  await signIn(page, manager);
  await page.goto("/orders");
  await expect(rows(page)).toHaveCount(3);

  // A new pair: notebook for the music department.
  const form = addForm(page);
  const picker = form.getByRole("combobox", { name: t.columns.product });
  const option = page.getByRole("option", { name: notebook });
  await expect(async () => {
    await picker.fill(notebook);
    await expect(option).toBeVisible({ timeout: 2000 });
  }).toPass();
  await option.click();
  await form.getByLabel(t.columns.requestedBy).selectOption({ label: music });
  await form.getByLabel(t.columns.quantity).fill("3");

  await context.setOffline(true);
  await form.getByRole("button", { name: t.add.button }).click();
  await expect(form.getByRole("status")).toHaveText(t.add.retrying);
  // The fields keep what was typed and are locked while the add waits (decided item 9).
  await expect(form.getByLabel(t.columns.quantity)).toHaveValue("3");
  await expect(form.getByLabel(t.columns.quantity)).toBeDisabled();

  await context.setOffline(false);
  await expect(rows(page)).toHaveCount(4);
  await expect(form.getByLabel(t.columns.quantity)).toHaveValue("");
  const after = await draftsOf(manager);
  expect(after.filter((one) => one.product === notebook && one.department === music)).toEqual([
    expect.objectContaining({ quantity: "3.000" }),
  ]);
  expect(after).toHaveLength(4);
});

test("Done when: the same drafts show as cards at 375 px, with 44 px controls (11 rules 2 and 13)", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone-375", "The phone width.");
  // The 375 project has its own Manager: "the same drafts" are the same three pairs (review,
  // decision 12).
  const manager = E2E_DRAFT_USERS["phone-375"];
  const loops = renderLoops(page);
  await freshGrid(manager);
  await signIn(page, manager);
  await page.goto("/orders");
  for (const [at, draft] of KEYBOARD_DRAFTS.entries()) {
    await addDraft(page, draft.product, draft.department, draft.quantity);
    await expect(rows(page)).toHaveCount(at + 1);
  }

  // The grid's own head; the order list above it has its own (plan of 2.8).
  await expect(page.locator("table:has(tr[data-draft]) > thead")).toBeHidden();
  for (let at = 0; at < 3; at += 1) {
    const card = rows(page).nth(at);
    // A card: the cells stand one above the other, each with its column's name.
    const product = await card.locator('td[data-col="product"]').boundingBox();
    const quantity = await card.locator('td[data-col="quantity"]').boundingBox();
    expect(product!.y + product!.height).toBeLessThanOrEqual(quantity!.y + 1);
    await expect(card.locator('td[data-col="quantity"] [data-card-label]')).toHaveText(
      t.columns.quantity,
    );
    // 11 rule 13: every control a finger uses is at least 44 px high (review, correction 3).
    const controls = card.locator(
      "input:visible:not([type=checkbox]):not([type=file]), select:visible, button:visible, [data-tick]",
    );
    const count = await controls.count();
    expect(count).toBeGreaterThan(5);
    for (let one = 0; one < count; one += 1) {
      const box = await controls.nth(one).boundingBox();
      expect(
        box!.height,
        await controls.nth(one).evaluate((el) => el.outerHTML.slice(0, 80)),
      ).toBeGreaterThanOrEqual(44);
    }
  }
  expect(await scrollsSideways(page)).toBe(false);

  // The totals of the ticked drafts stay visible (11 rule 2), folded to the grand total.
  await rows(page).nth(0).locator("[data-tick]").click();
  // The top of the grid at the top of the window: since 2.8 the order list stands above the grid,
  // and the totals stick inside the grid's own section (plan of 2.8, Screens).
  await rows(page)
    .nth(0)
    .evaluate((row) => row.scrollIntoView({ block: "start" }));
  const totals = page.getByRole("region", { name: t.totals.title });
  await expect(totals).toBeInViewport();
  await expect(totals.locator('[data-total="grand"] dd')).toHaveText(som("12000"));
  await expect(totals.locator('[data-total="CASH"]')).toBeHidden();
  const details = totals.getByRole("button", { name: t.totals.showDetails });
  expect((await details.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await details.click();
  await expect(totals.locator('[data-total="CASH"] dd')).toHaveText(som("12000"));
  expect(await scrollsSideways(page)).toBe(false);
  expect(loops).toEqual([]);
});

// Build-plan 2.7 (05-order-request-form.md, Drafts 4; Checks at submit; Order number;
// 06-approval-workflow.md rule 8; plan of 2.7, Tests: Playwright). The drafts are written
// complete straight into the table, so the test is about Submit and not about typing.

/** A complete never-submitted draft of the person in EA: 2 of the product for `science`. */
async function insertCompleteDraft(person: Person, product: string, neededBy: string) {
  await withDatabase(async (client) => {
    await client.query(
      `insert into orders (branch_id, owner_id, created_by, variant_id, department_id, needed_by,
                           planned_qty, planned_price, payment_type, created_at, updated_at)
       select b.id, u.id, u.id, v.id, d.id, $3, 2, 5000, 'CASH', now(), now()
         from branches b, users u, product_variants v, products p, departments d
        where b.code = 'EA' and u.username = $1 and p.name = $2 and v.product_id = p.id
          and d.name = $4 and d.branch_id = b.id`,
      [person.username, product, neededBy, science],
    );
  });
}

/** The numbers of the person's orders of the product (null for a draft). */
async function numbersOf(person: Person, product: string) {
  return withDatabase(async (client) => {
    const { rows: found } = await client.query<{ number: string | null; status: string }>(
      `select o.number, o.status from orders o
         join product_variants v on v.id = o.variant_id join products p on p.id = v.product_id
        where p.name = $2 and o.owner_id = (select id from users where username = $1)
        order by o.created_at`,
      [person.username, product],
    );
    return found;
  });
}

/** The draft row of a product: the product sits in an input, so the row is found by its tick. */
function tickOf(page: Page, product: string): Locator {
  return page.getByRole("checkbox", { name: t.tickRow.replace("{product}", product) });
}

function rowOf(page: Page, product: string): Locator {
  return rows(page).filter({ has: tickOf(page, product) });
}

/** Submit (N) of the ticked bar, confirmed in its dialog (11 rule 6; plan of 2.7b). */
async function submitConfirmed(page: Page, count: number): Promise<void> {
  await page
    .getByRole("button", { name: t.submit.button.replace("{count}", String(count)) })
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: t.submit.confirm, exact: true })
    .click();
}

test("Done when (2.7b): Submit in the grid asks first with the count; Cancel leaves the drafts Drafts; Confirm submits them (11 rule 6)", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop-1440", "The Done-when is at 1440 px.");
  const manager = E2E_DRAFT_USERS["desktop-1440"];
  await freshGrid(manager);
  await insertCompleteDraft(manager, ruler, "2031-05-01");
  await insertCompleteDraft(manager, eraser, "2031-05-01");
  await signIn(page, manager);
  await page.goto("/orders");
  await expect(rows(page)).toHaveCount(2);
  for (const product of [ruler, eraser]) await tickOf(page, product).check();

  const submit = page.getByRole("button", { name: t.submit.button.replace("{count}", "2") });
  await submit.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Submit 2 orders?");
  await expect(dialog).toContainText("Each gets its own number and goes for approval.");
  await dialog.getByRole("button", { name: en.common.cancel }).click();
  await expect(dialog).toHaveCount(0);
  // Cancel submits nothing: both are still Drafts without a number, still in the grid.
  for (const product of [ruler, eraser]) {
    expect(await numbersOf(manager, product)).toEqual([{ number: null, status: "DRAFT" }]);
  }
  await expect(rows(page)).toHaveCount(2);

  await submit.click();
  await dialog.getByRole("button", { name: t.submit.confirm, exact: true }).click();
  await expect(page.getByText(/Submitted 2 orders: EA-\d{2}-\d{4,}/)).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  for (const product of [ruler, eraser]) {
    const [order] = await numbersOf(manager, product);
    expect(order).toMatchObject({ status: "PENDING_HEAD" });
    expect(order!.number).toMatch(/^EA-\d{2}-\d{4,}$/);
  }
});

test("Submit: a past needed-by date stops all, on its cell; then the good drafts get numbers (05 Checks at submit)", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop-1440", "The Done-when is at 1440 px.");
  const manager = E2E_DRAFT_USERS["desktop-1440"];
  await freshGrid(manager);
  await insertCompleteDraft(manager, stapler, "2031-05-01");
  await insertCompleteDraft(manager, tape, "2031-05-01");
  await insertCompleteDraft(manager, glue, "2020-01-01");
  await signIn(page, manager);
  await page.goto("/orders");
  await expect(rows(page)).toHaveCount(3);

  for (const product of [stapler, glue]) {
    await tickOf(page, product).check();
  }
  await submitConfirmed(page, 2);
  // Nothing is submitted: the list on top names the order, the cell carries the message.
  const list = page.getByRole("alert").filter({ hasText: "Nothing was submitted" });
  await expect(list).toContainText(glue);
  await expect(rowOf(page, glue).locator('td[data-col="neededBy"]')).toContainText(
    en.errors.field.inPast,
  );
  expect(await numbersOf(manager, stapler)).toEqual([{ number: null, status: "DRAFT" }]);
  expect(await numbersOf(manager, glue)).toEqual([{ number: null, status: "DRAFT" }]);

  // The good two, ticked alone, go to the Head with their numbers.
  await tickOf(page, glue).uncheck();
  await tickOf(page, tape).check();
  await submitConfirmed(page, 2);
  await expect(page.getByText(/Submitted 2 orders: EA-\d{2}-\d{4,}/)).toBeVisible();
  await expect(rows(page)).toHaveCount(1);
  await expect(rowOf(page, glue)).toHaveCount(1);
  for (const product of [stapler, tape]) {
    const [order] = await numbersOf(manager, product);
    expect(order).toMatchObject({ status: "PENDING_HEAD" });
    expect(order!.number).toMatch(/^EA-\d{2}-\d{4,}$/);
  }
});

test("Submit at 375 px: the card's Submit sends the draft, no horizontal page scroll (11 rule 13)", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone-375", "The phone width.");
  const manager = E2E_DRAFT_USERS["phone-375"];
  await freshGrid(manager);
  await insertCompleteDraft(manager, stapler, "2031-05-01");
  await signIn(page, manager);
  await page.goto("/orders");
  await expect(rows(page)).toHaveCount(1);
  await tickOf(page, stapler).check();
  expect(await scrollsSideways(page)).toBe(false);
  await page.getByRole("button", { name: t.submit.button.replace("{count}", "1") }).click();
  // The confirmation fits the phone too (11 rules 6 and 13).
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Submit 1 order?");
  expect(await scrollsSideways(page)).toBe(false);
  await dialog.getByRole("button", { name: t.submit.confirm, exact: true }).click();
  await expect(page.getByText(/Submitted 1 order: EA-\d{2}-\d{4,}/)).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  expect(await scrollsSideways(page)).toBe(false);
});

test("a phone card is folded to its summary, opens with a tap and folds with Done; from 640 px every field shows (redesign of 22.10.2026)", async ({
  page,
}, info) => {
  const manager = E2E_DRAFT_USERS[info.project.name as keyof typeof E2E_DRAFT_USERS];
  await freshGrid(manager);
  await insertCompleteDraft(manager, stapler, "2031-05-01");
  await signIn(page, manager);
  await page.goto("/orders");
  const card = rowOf(page, stapler);
  const quantity = card.locator('td[data-col="quantity"] input');
  if (info.project.name !== "phone-375") {
    // A desktop row: every field, no summary.
    await expect(quantity).toBeVisible();
    await expect(card.locator("[data-card-open]")).toBeHidden();
    return;
  }
  // Folded: the summary says what the draft is (2 × 5 000 = 10 000), the fields are hidden.
  const summary = card.locator("[data-card-open]");
  await expect(summary).toContainText(stapler);
  await expect(summary).toContainText(som("10000"));
  await expect(quantity).toBeHidden();
  expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // A tap opens the fields; Done folds them again.
  await summary.click();
  await expect(quantity).toBeVisible();
  await expect(quantity).toHaveValue("2");
  await card.locator("[data-card-close]").click();
  await expect(quantity).toBeHidden();
  expect(await scrollsSideways(page)).toBe(false);
});

test("at 375 px Done folds a just-added card, and a sent-back card, which stays open, offers no Done (review of d14a85a; .claude/rules/ui.md: a button that cannot act is not offered)", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone-375", "The phone width.");
  const manager = E2E_DRAFT_USERS["phone-375"];
  // The sent-back order is numbered, so it is cancelled, never deleted, to leave the grid of the
  // other tests of this person; an earlier run's is cancelled first.
  const cancelSentBack = () =>
    withDatabase(async (client) => {
      await client.query(
        `update orders set status = 'CANCELLED'
          where owner_id = (select id from users where username = $1) and status = 'RETURNED'`,
        [manager.username],
      );
    });
  await cancelSentBack();
  await freshGrid(manager);
  // A sent-back order: a numbered RETURNED row, which the grid labels Sent back.
  await insertCompleteDraft(manager, stapler, "2031-05-01");
  await withDatabase(async (client) => {
    await client.query(
      `update orders set status = 'RETURNED', number = $2, submitted_at = now(), planned_total = 10000
        where owner_id = (select id from users where username = $1) and status = 'DRAFT'`,
      [manager.username, `EA-26-${String(Math.floor(Math.random() * 9e8) + 1e8)}`],
    );
  });
  try {
    await signIn(page, manager);
    await page.goto("/orders");
    const sentBack = rowOf(page, stapler);
    await expect(sentBack.locator('td[data-col="quantity"] input')).toBeVisible();
    await expect(sentBack.locator("[data-card-close]")).toHaveCount(0);

    // A draft added on this visit opens with its fields; Done folds it to its summary.
    await addDraft(page, notebook, science, "4");
    const added = rowOf(page, notebook);
    const quantity = added.locator('td[data-col="quantity"] input');
    await expect(quantity).toBeVisible();
    await added.locator("[data-card-close]").click();
    await expect(quantity).toBeHidden();
    await expect(added.locator("[data-card-open]")).toBeVisible();
  } finally {
    await cancelSentBack();
  }
});

// Owner's report of 23.10.2026: "When I tick them, submit is not appearing." The bar with Submit
// stood above the grid, out of sight once a card further down was ticked; the selection bar
// floats at the bottom of the window (11 Order list layout 4; design system, Selection bar).
test("at 375 px a draft ticked far down the grid shows Submit without scrolling (11 Order list layout 4)", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone-375", "The phone width.");
  const manager = E2E_DRAFT_USERS["phone-375"];
  await freshGrid(manager);
  for (const product of [stapler, tape, glue, ruler]) {
    await insertCompleteDraft(manager, product, "2031-05-01");
  }
  await signIn(page, manager);
  await page.goto("/orders");
  await expect(rows(page)).toHaveCount(4);
  const last = tickOf(page, ruler);
  await last.scrollIntoViewIfNeeded();
  await last.check();
  await expect(
    page.getByRole("button", { name: t.submit.button.replace("{count}", "1") }),
  ).toBeInViewport();
  await expect(page.getByRole("region", { name: t.totals.title })).toBeInViewport();
  expect(await scrollsSideways(page)).toBe(false);
});

// The same report: a draft and a sent-back order ticked together offer neither Submit nor Submit
// again, as one action makes one move (06 rule 8; plan of 2.11, decided item 9). The bar says so
// rather than showing nothing.
test("a draft and a sent-back order ticked together: the bar says they are submitted apart (06 rule 8)", async ({
  page,
}, info) => {
  const manager = E2E_DRAFT_USERS[info.project.name as keyof typeof E2E_DRAFT_USERS];
  const cancelSentBack = () =>
    withDatabase(async (client) => {
      await client.query(
        `update orders set status = 'CANCELLED'
          where owner_id = (select id from users where username = $1) and status = 'RETURNED'`,
        [manager.username],
      );
    });
  await cancelSentBack();
  await freshGrid(manager);
  await insertCompleteDraft(manager, stapler, "2031-05-01");
  await withDatabase(async (client) => {
    await client.query(
      `update orders set status = 'RETURNED', number = $2, submitted_at = now(), planned_total = 10000
        where owner_id = (select id from users where username = $1) and status = 'DRAFT'`,
      [manager.username, `EA-26-${String(Math.floor(Math.random() * 9e8) + 1e8)}`],
    );
  });
  await insertCompleteDraft(manager, tape, "2031-05-01");
  try {
    await signIn(page, manager);
    await page.goto("/orders");
    await expect(rows(page)).toHaveCount(2);
    await tickOf(page, stapler).check();
    await tickOf(page, tape).check();
    const bar = page.getByRole("region", { name: t.totals.title });
    await expect(bar).toContainText(t.submit.mixed);
    await expect(bar.getByRole("button", { name: /^Submit/ })).toHaveCount(0);

    await tickOf(page, stapler).uncheck();
    await expect(bar).not.toContainText(t.submit.mixed);
    await expect(
      bar.getByRole("button", { name: t.submit.button.replace("{count}", "1") }),
    ).toBeVisible();
  } finally {
    await cancelSentBack();
  }
});
