import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import en from "../../src/i18n/messages/en.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_PAGE_USERS, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build-plan 2.9, Done when: "on a submitted order the stepper stands at Head, History shows the
// submit with name and time, and a Finance user sees the waiting line". 11-screens-and-ux.md
// (Order page layout 1 to 4; rules 6 and 13); 06-approval-workflow.md rule 11; plan of 2.9,
// decided items 4 and 5 (Look first). The draft is written straight into the table and submitted
// with the page's own Submit, so its event, actor and time are the real action's. Each project has
// its own Manager and Finance user (E2E_PAGE_USERS).

const p = en.orders.page;

type Person = { username: string; password: string; fullName: string };

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

/** A complete draft of the Manager in branch EA, its people in English. Returns its id. */
async function seedDraft(manager: Person, finance: Person): Promise<string> {
  return withDatabase(async (client) => {
    await client.query("begin");
    try {
      await client.query("update users set locale = 'en' where username = any($1)", [
        [manager.username, finance.username],
      ]);
      const owner = await client.query<{ id: string }>("select id from users where username = $1", [
        manager.username,
      ]);
      const ownerId = owner.rows[0]!.id;
      const tag = randomUUID().slice(0, 8);
      const unit = await client.query<{ id: string }>(
        `insert into units (name, short_name, allow_decimal, is_active, created_at)
         values ($1, $2, false, true, now()) returning id`,
        [`O'lchov ${tag}`, `p${tag}`],
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
        [`Daftar ${tag}`, category.rows[0]!.id, unit.rows[0]!.id],
      );
      const variant = await client.query<{ id: string }>(
        `insert into product_variants (product_id, name, is_default, is_active, created_at)
         values ($1, 'default', true, true, now()) returning id`,
        [product.rows[0]!.id],
      );
      const draft = await client.query<{ id: string }>(
        `insert into orders (branch_id, owner_id, created_by, status, variant_id, department_id,
                             needed_by, planned_qty, planned_price, planned_total, payment_type,
                             created_at, updated_at)
         select b.id, $1, $1, 'DRAFT', $2, $3, '2031-05-01', 2, 5000, 10000, 'CASH', now(), now()
           from branches b where b.code = 'EA'
         returning id`,
        [ownerId, variant.rows[0]!.id, department.rows[0]!.id],
      );
      await client.query("commit");
      return draft.rows[0]!.id;
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

const TIME = /\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}/;

test("Done when: the submitted order's stepper stands at Head, History shows the submit, Finance sees the waiting line (11 Order page layout; 06 rule 11)", async ({
  page,
}, info) => {
  const people = E2E_PAGE_USERS[info.project.name as keyof typeof E2E_PAGE_USERS];
  const draftId = await seedDraft(people.manager, people.finance);

  // The owner submits the draft from its page, with the confirmation of 11 rule 6.
  const owner = page;
  await signIn(owner, people.manager);
  await owner.goto(`/orders/${draftId}`);
  await expect(owner.locator("[data-order-number]")).toHaveText(p.noNumber);
  await expect(owner.locator("[data-waiting]")).toHaveCount(0);
  await owner.locator("[data-order-bar]").getByRole("button", { name: p.bar.submit }).click();
  const dialog = owner.getByRole("alertdialog");
  await expect(dialog).toContainText(p.bar.submitTitle);
  await dialog.getByRole("button", { name: p.bar.submit }).click();
  // D38: the submit succeeded before anything else is checked.
  await expect(owner.getByText(/^Submitted: EA-\d{2}-\d{4,}\.$/)).toBeVisible();
  await expect(owner.locator("[data-order-number]")).toHaveText(/^EA-\d{2}-\d{4,}$/);
  const number = (await owner.locator("[data-order-number]").textContent())!;

  // The stepper stands at Head; Draft is finished with the owner's name and the time.
  await expect(owner.locator('li[data-step="HEAD"]')).toHaveAttribute("data-state", "current");
  const draftStep = owner.locator('li[data-step="DRAFT"]');
  await expect(draftStep).toHaveAttribute("data-state", "done");
  await expect(draftStep.locator("[data-step-by]")).toContainText(people.manager.fullName);
  await expect(draftStep.locator("[data-step-by]")).toContainText(TIME);

  // History shows the submit with the name and the time.
  await owner.getByRole("link", { name: p.tabs.history }).click();
  await expect(owner).toHaveURL(new RegExp(`/orders/${draftId}\\?tab=history$`));
  const submitted = owner.locator('li[data-event="SUBMIT"]');
  await expect(submitted).toContainText(`${p.history.moves.SUBMIT} by ${people.manager.fullName}`);
  await expect(submitted.locator("time")).toHaveText(TIME);
  expect(await scrollsSideways(owner)).toBe(false);

  // The owner has no move at Waiting for Head in 2.9 beyond Take back (2.11), which has no button
  // yet: neither a button nor the waiting line (decided item 4).
  await expect(owner.locator("[data-order-bar]").getByRole("button")).toHaveCount(0);

  // A Finance user of the branch has no move on it, so the bar says who it waits for.
  await page.context().clearCookies();
  const finance = page;
  await signIn(finance, people.finance);
  await finance.goto(`/orders/${draftId}`);
  await expect(finance.locator("[data-order-number]")).toHaveText(number);
  await expect(finance.locator("[data-waiting]")).toHaveText(p.waiting.HEAD);
  await expect(finance.locator("[data-order-bar]").getByRole("button")).toHaveCount(0);
  expect(await scrollsSideways(finance)).toBe(false);
});
