import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import uz from "../../src/i18n/messages/uz.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_MOVE_USERS, E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

// Build plan 2.11, the Playwright lines of Done when: the owner of a submitted order sees Take
// back and no Approve; the Head sees Approve, Send back and Reject. And S5 (15-quality-and-
// acceptance.md): the Head sends the order back with a note; the Manager changes 100 to 80 and
// submits again; the Head sees the same number, "rev 2" and "100 → 80" highlighted
// (06-approval-workflow.md, Allowed moves; rules 3, 4, 5; 05 Drafts 5). The Head and the
// spec's own Managers read Uzbek (reset before every run). The order is written submitted straight
// into the table with the full copy its Submit would write, each project with its own product.

const t = uz.orders;

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

/** One order of the owner at Waiting for Head in EA, 100 pieces, with its rev 1 copy. */
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
        [`O'lchov ${tag}`, `dona${tag}`],
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
      // A number far above any the run's own submits reach (05 Order number 2).
      const number = `EA-26-${8_000_000 + Math.floor(Math.random() * 999_999)}`;
      const order = await client.query<{ id: string }>(
        `insert into orders (number, branch_id, owner_id, created_by, status, variant_id,
                             department_id, needed_by, planned_qty, planned_price, planned_total,
                             payment_type, stock_at_submit, submitted_at, created_at, updated_at)
         select $1, b.id, $2, $2, 'PENDING_HEAD', $3, $4, '2031-05-01', 100, 5000, 500000,
                'CASH', 0, now(), now(), now()
           from branches b where b.code = 'EA'
         returning id`,
        [number, ownerId, variant.rows[0]!.id, department.rows[0]!.id],
      );
      const id = order.rows[0]!.id;
      // The full copy of rev 1, as Submit writes it (14 order_revisions).
      await client.query(
        `insert into order_revisions (order_id, revision, submission, snapshot, created_at)
         select o.id, 1, 1, jsonb_build_object(
           'number', o.number, 'branchId', o.branch_id, 'variantId', o.variant_id,
           'companyId', o.company_id, 'departmentId', o.department_id,
           'requesterName', o.requester_name, 'neededBy', o.needed_by,
           'quantity', o.planned_qty::text, 'price', o.planned_price::text, 'extras', '[]'::jsonb,
           'plannedTotal', o.planned_total::text, 'paymentType', o.payment_type,
           'priority', o.priority, 'urgentReason', o.urgent_reason, 'comment', o.comment,
           'referencePhotoFileId', o.reference_photo_file_id,
           'stockAtSubmit', o.stock_at_submit::text), now()
         from orders o where o.id = $1`,
        [id],
      );
      await client.query("commit");
      return { id, number };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

async function quantityOf(id: string): Promise<string> {
  return withDatabase(async (client) => {
    const row = await client.query<{ qty: string }>(
      "select planned_qty::text as qty from orders where id = $1",
      [id],
    );
    return row.rows[0]!.qty;
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

test("Done when: the owner sees Take back and no Approve; the Head sees Approve, Send back and Reject (06 Allowed moves)", async ({
  page,
}, info) => {
  const owner = E2E_MOVE_USERS[info.project.name as keyof typeof E2E_MOVE_USERS];
  const order = await seedWaiting(owner);

  await signIn(page, owner);
  await page.goto(`/orders/${order.id}`);
  const ownerBar = page.locator("[data-order-bar]");
  await expect(ownerBar.getByRole("button", { name: t.moves.button.TAKE_BACK })).toBeVisible();
  await expect(ownerBar.getByRole("button", { name: t.approve.button })).toHaveCount(0);
  await expect(ownerBar.getByRole("button", { name: t.moves.button.SEND_BACK })).toHaveCount(0);
  await page.context().clearCookies();

  await signIn(page, E2E_ROLES.HEAD);
  await page.goto(`/orders/${order.id}`);
  const headBar = page.locator("[data-order-bar]");
  for (const name of [t.approve.button, t.moves.button.SEND_BACK, t.moves.button.REJECT]) {
    await expect(headBar.getByRole("button", { name, exact: true })).toBeVisible();
  }
  // Take back is the owner's alone (decisions 2.3 item 5).
  await expect(headBar.getByRole("button", { name: t.moves.button.TAKE_BACK })).toHaveCount(0);
  expect(await scrollsSideways(page)).toBe(false);
});

test("S5: send back with a note, 100 → 80, submit again; the Head sees the same number, rev 2 and 100 → 80 (15 S5; 06 rules 4 and 5)", async ({
  page,
}, info) => {
  const owner = E2E_MOVE_USERS[info.project.name as keyof typeof E2E_MOVE_USERS];
  const order = await seedWaiting(owner);

  // The Head sends it back with a reason and a note.
  await signIn(page, E2E_ROLES.HEAD);
  await page.goto(`/orders/${order.id}`);
  await page
    .locator("[data-order-bar]")
    .getByRole("button", { name: t.moves.button.SEND_BACK, exact: true })
    .click();
  const dialog = page.getByRole("alertdialog");
  const confirm = dialog.getByRole("button", { name: t.moves.button.SEND_BACK, exact: true });
  await dialog.locator("textarea[data-reason]").fill("abcd");
  // Four characters: Confirm waits (06 rule 3); the server would refuse it too.
  await expect(confirm).toBeDisabled();
  await dialog.locator("textarea[data-reason]").fill("Miqdorni kamaytiring");
  await dialog.locator(`#note-${order.id}`).fill("100 emas, 80 ta");
  await confirm.click();
  await expect(page.getByText("1 ta buyurtma qaytarildi.")).toBeVisible();
  await page.context().clearCookies();

  // The owner changes 100 to 80 in the drafts grid and submits again.
  await signIn(page, owner);
  await page.goto("/orders");
  const row = page.locator(`tbody tr[data-draft="${order.id}"]`);
  await expect(row).toContainText(t.labels.SENT_BACK);
  const quantity = row.locator('td[data-col="quantity"] input');
  await quantity.fill("80");
  await quantity.press("Tab");
  await expect.poll(() => quantityOf(order.id)).toBe("80.000");
  await row.locator("[data-tick] input").check();
  await page.getByRole("button", { name: t.submit.againButton.replace("{count}", "1") }).click();
  await expect(page.getByText("1 ta buyurtma qayta yuborildi.")).toBeVisible();
  await page.context().clearCookies();

  // The Head sees the same number, rev 2 and "100 → 80" highlighted.
  await signIn(page, E2E_ROLES.HEAD);
  await page.goto(`/orders/${order.id}`);
  await expect(page.locator("[data-order-number]")).toHaveText(order.number);
  await expect(page.locator("[data-revision]")).toHaveText(t.revision.replace("{revision}", "2"));
  const changed = page.locator('[data-what-changed] [data-change="quantity"]');
  await expect(changed.locator("[data-old]")).toContainText("100");
  await expect(changed.locator("[data-new]")).toContainText("80");
  await expect(changed).toContainText("→");
  expect(await scrollsSideways(page)).toBe(false);
});
