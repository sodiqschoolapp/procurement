import { randomUUID } from "node:crypto";

import { type Page, expect, test } from "@playwright/test";
import pg from "pg";

import en from "../../src/i18n/messages/en.json" with { type: "json" };
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_PURCHASE_USERS, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";
import { shownAmount } from "./shown-amount";
import { barAction } from "./order-bar";

// Build plans 3.3 and 3.4, the purchase form (07-purchasing.md, Purchase record: "Date bought: Default
// today", "Payment type used: Default from the order", the comment rule, "Same as planned";
// 11-screens-and-ux.md, smooth feel 3, "Buying on a phone"; plan of 3.3, Tests and spec review
// of the plan, Should fix 5). The Open order is written straight into the table, approved by
// Finance today; the record is saved by the form's own action. Each project has its own owner.

const f = en.purchase.form;
const p = en.orders.page;

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
 * An Open order of the owner in branch EA: 2 at 5 000 so'm, paid by card. Returns its id and today
 * in Tashkent by the database's clock, the business date the form defaults to (CLAUDE.md rule 10).
 */
async function seedOpenOrder(
  owner: Person,
  options: { subtypes?: boolean } = {},
): Promise<{ orderId: string; today: string; otherSubtype: string | null }> {
  return withDatabase(async (client) => {
    await client.query("begin");
    try {
      await client.query("update users set locale = 'en' where username = $1", [owner.username]);
      const found = await client.query<{ id: string }>("select id from users where username = $1", [
        owner.username,
      ]);
      const ownerId = found.rows[0]!.id;
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
         values ($1, 'GOODS', $2, $3, true, $4, now()) returning id`,
        [`Daftar ${tag}`, category.rows[0]!.id, unit.rows[0]!.id, options.subtypes === true],
      );
      // With subtypes, the order is for "Blue" and "Black" is the other (07 Substitution).
      const variant = await client.query<{ id: string }>(
        `insert into product_variants (product_id, name, is_default, is_active, created_at)
         values ($1, $2, $3, true, now()) returning id`,
        [product.rows[0]!.id, options.subtypes ? "Blue" : "default", !options.subtypes],
      );
      const other = options.subtypes
        ? await client.query<{ id: string }>(
            `insert into product_variants (product_id, name, is_default, is_active, created_at)
             values ($1, 'Black', false, true, now()) returning id`,
            [product.rows[0]!.id],
          )
        : null;
      const number = `EA-90-${String(Math.floor(Math.random() * 900_000) + 100_000)}`;
      const order = await client.query<{ id: string }>(
        `insert into orders (number, branch_id, owner_id, created_by, status, variant_id,
                             department_id, needed_by, planned_qty, planned_price, planned_total,
                             payment_type, submitted_at, approved_at, created_at, updated_at)
         select $4, b.id, $1, $1, 'PURCHASING', $2, $3, '2031-05-01', 2, 5000, 10000, 'CARD',
                now(), now(), now(), now()
           from branches b where b.code = 'EA'
         returning id`,
        [ownerId, variant.rows[0]!.id, department.rows[0]!.id, number],
      );
      const today = await client.query<{ today: string }>(
        "select (now() at time zone 'Asia/Tashkent')::date::text as today",
      );
      await client.query("commit");
      return {
        orderId: order.rows[0]!.id,
        today: today.rows[0]!.today,
        otherSubtype: other?.rows[0]!.id ?? null,
      };
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

test("the owner records a purchase with Same as planned; the order shows Received and the History event (07 Purchase record)", async ({
  page,
}, info) => {
  const owner = E2E_PURCHASE_USERS[info.project.name as keyof typeof E2E_PURCHASE_USERS];
  const { orderId, today } = await seedOpenOrder(owner);

  await signIn(page, owner);
  await page.goto(`/orders/${orderId}`);
  await page.locator("[data-record-purchase]").click();
  await expect(page).toHaveURL(new RegExp(`/orders/${orderId}/purchase$`));

  // The two defaults of 07: today, and the order's payment type. The field shows the date as
  // dd.mm.yyyy (11 rule 10, Formats; redesign of 21.10.2026) and sends the same YYYY-MM-DD.
  const [year, month, day] = today.split("-");
  await expect(page.locator("#purchase-date")).toHaveValue(`${day}.${month}.${year}`);
  await expect(page.getByRole("radio", { name: en.paymentTypes.CARD }).first()).toBeChecked();

  await page.getByRole("button", { name: f.sameAsPlanned }).click();
  await expect(page.locator(`#purchase-qty-${orderId}`)).toHaveValue("2");
  await expect(page.locator(`#purchase-price-${orderId}`)).toHaveValue(shownAmount("5000"));
  await expect(page.locator("[data-comment-reasons]")).toHaveCount(0);

  // Another price marks the comment required, by the domain's rule; back to the plan, it is not.
  await page.locator(`#purchase-price-${orderId}`).fill("5500");
  await expect(page.locator("[data-comment-reasons]")).toHaveText(f.reasons.PRICE_CHANGED);
  await expect(page.getByText(f.commentRequired)).toBeVisible();
  await page.locator(`#purchase-price-${orderId}`).fill("5000");
  await expect(page.locator("[data-comment-reasons]")).toHaveCount(0);
  expect(await scrollsSideways(page)).toBe(false);

  await page.getByRole("button", { name: f.save }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${orderId}$`));
  await expect(page.locator('[data-fact="received"] dd')).toHaveText(/^2 of 2/);
  // Done after the plan is received: no more Record purchase (07 Finishing; decided item 3).
  await expect(page.locator("[data-record-purchase]")).toHaveCount(0);
  expect(await scrollsSideways(page)).toBe(false);

  await page.getByRole("link", { name: p.tabs.history }).click();
  const event = page.locator('[data-event="RECORD_PURCHASE"]');
  await expect(event).toHaveCount(1);
  await expect(event.locator("[data-purchase]")).toContainText("2 ×");
});

test("blue ordered, black bought: the comment is asked, and the order shows Substituted (build plan 3.6; 07 Substitution; S10)", async ({
  page,
}, info) => {
  const owner = E2E_PURCHASE_USERS[info.project.name as keyof typeof E2E_PURCHASE_USERS];
  const { orderId, otherSubtype } = await seedOpenOrder(owner, { subtypes: true });

  await signIn(page, owner);
  await page.goto(`/orders/${orderId}/purchase`);
  await page.getByRole("button", { name: f.sameAsPlanned }).click();
  const subtype = page.locator(`#purchase-subtype-${orderId}`);
  await expect(subtype.locator("option")).toHaveText(["Blue", "Black"]);
  await subtype.selectOption(otherSubtype!);
  await expect(page.locator("[data-comment-reasons]")).toHaveText(f.reasons.SUBSTITUTED);
  await page.locator(`#purchase-comment-${orderId}`).fill("No blue in the shop");
  expect(await scrollsSideways(page)).toBe(false);
  await page.getByRole("button", { name: f.save }).click();

  await expect(page).toHaveURL(new RegExp(`/orders/${orderId}$`));
  await expect(page.locator("[data-substituted]")).toHaveText(en.orders.substituted);
  await page.getByRole("link", { name: p.tabs.purchases }).click();
  await expect(page.locator("[data-bought-subtype]")).toHaveText(
    p.purchases.bought.replace("{subtype}", "Black"),
  );
});

/**
 * Two Open orders of one owner for "Tata pens" of their own subtype in branch EA, 20 submitted
 * first and 10 later, by cash, approved today: one group row (07 One trip, many orders: 2; S19).
 * Returns the ids in submit order and the category that finds them alone in the list.
 */
async function seedPensGroup(
  owner: Person,
): Promise<{ older: string; newer: string; categoryId: string; product: string }> {
  return withDatabase(async (client) => {
    await client.query("begin");
    try {
      await client.query("update users set locale = 'en' where username = $1", [owner.username]);
      const found = await client.query<{ id: string }>("select id from users where username = $1", [
        owner.username,
      ]);
      const ownerId = found.rows[0]!.id;
      const tag = randomUUID().slice(0, 8);
      const product = `Tata pens ${tag}`;
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
      const made = await client.query<{ id: string }>(
        `insert into products (name, type, category_id, unit_id, is_active, has_variants, created_at)
         values ($1, 'GOODS', $2, $3, true, false, now()) returning id`,
        [product, category.rows[0]!.id, unit.rows[0]!.id],
      );
      const variant = await client.query<{ id: string }>(
        `insert into product_variants (product_id, name, is_default, is_active, created_at)
         values ($1, 'default', true, true, now()) returning id`,
        [made.rows[0]!.id],
      );
      const ids: string[] = [];
      for (const [qty, submitted] of [
        [20, "now() - interval '2 hours'"],
        [10, "now() - interval '1 hour'"],
      ] as const) {
        const number = `EA-90-${String(Math.floor(Math.random() * 900_000) + 100_000)}`;
        const order = await client.query<{ id: string }>(
          `insert into orders (number, branch_id, owner_id, created_by, status, variant_id,
                               department_id, needed_by, planned_qty, planned_price, planned_total,
                               payment_type, submitted_at, approved_at, created_at, updated_at)
           select $4, b.id, $1, $1, 'PURCHASING', $2, $3, '2031-05-01', $5::numeric, 5000, $5::bigint * 5000,
                  'CASH', ${submitted}, now(), now(), now()
             from branches b where b.code = 'EA'
           returning id`,
          [ownerId, variant.rows[0]!.id, department.rows[0]!.id, number, qty],
        );
        ids.push(order.rows[0]!.id);
      }
      await client.query("commit");
      return { older: ids[0]!, newer: ids[1]!, categoryId: category.rows[0]!.id, product };
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

test("30 Tata pens recorded on a group row of 20 and 10 fill both orders (build plan 3.4; 07 One trip, many orders 2)", async ({
  page,
}, info) => {
  const owner = E2E_PURCHASE_USERS[info.project.name as keyof typeof E2E_PURCHASE_USERS];
  const { older, newer, categoryId, product } = await seedPensGroup(owner);

  await signIn(page, owner);
  await page.goto(`/orders?status=PURCHASING&category=${categoryId}`);
  const group = page.locator("tbody[data-group]");
  await expect(group).toHaveCount(1);
  await page
    .getByRole("checkbox", { name: en.orders.list.tickGroup.replace("{product}", product) })
    .check();
  await page.locator("[data-record-trip]").click();
  await expect(page).toHaveURL(/\/orders\/purchase\?ids=/);

  // One quantity and one price for the group, split oldest first (07 One trip 2).
  await page.getByLabel(f.groupQty.replace("{unit}", "").trim(), { exact: false }).fill("30");
  await page.getByLabel(f.groupPrice).fill("5000");
  await expect(page.locator(`#purchase-qty-${older}`)).toHaveValue("20");
  await expect(page.locator(`#purchase-qty-${newer}`)).toHaveValue("10");
  await expect(page.locator(`#purchase-price-${newer}`)).toHaveValue(shownAmount("5000"));
  await expect(page.locator("[data-comment-reasons]")).toHaveCount(0);
  expect(await scrollsSideways(page)).toBe(false);

  await page.getByRole("button", { name: f.save }).click();
  await expect(page).toHaveURL(/\/orders(\?|$)/);

  for (const [id, text] of [
    [older, /^20 of 20/],
    [newer, /^10 of 10/],
  ] as const) {
    await page.goto(`/orders/${id}`);
    await expect(page.locator('[data-fact="received"] dd')).toHaveText(text);
  }
});

test("the Purchases tab lists the record; Finish order with a reason gives Done short; Reopen buying opens it again (07 Order progress; plan of 3.5)", async ({
  page,
}, info) => {
  const owner = E2E_PURCHASE_USERS[info.project.name as keyof typeof E2E_PURCHASE_USERS];
  const { orderId } = await seedOpenOrder(owner);
  const m = en.orders.moves;

  await signIn(page, owner);
  await page.goto(`/orders/${orderId}/purchase`);
  await page.getByRole("button", { name: f.sameAsPlanned }).click();
  await page.locator(`#purchase-qty-${orderId}`).fill("1");
  await page.getByRole("button", { name: f.save }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${orderId}$`));

  await page.getByRole("link", { name: p.tabs.purchases }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${orderId}\\?tab=purchases$`));
  await expect(page.locator("[data-purchase-record]")).toHaveCount(1);
  await expect(page.locator('[data-fact="received"] dd')).toHaveText(/^1 of 2/);
  await expect(page.locator('[data-fact="progress"] [data-progress]')).toHaveText(
    en.orders.progress.OPEN,
  );
  expect(await scrollsSideways(page)).toBe(false);

  // Finish order asks for one reason, then sets Done short with it.
  await (await barAction(page, '[data-move="FINISH_ORDER"]')).click();
  const dialog = page.getByRole("alertdialog");
  const confirm = dialog.getByRole("button", { name: m.button.FINISH_ORDER, exact: true });
  await expect(confirm).toBeDisabled();
  await dialog.locator("textarea[data-reason]").fill("The shop had only one");
  await confirm.click();
  await expect(page.locator('[data-fact="progress"] [data-progress]')).toHaveText(
    en.orders.progress.DONE_SHORT,
  );
  await expect(page.locator("[data-finish-reason]")).toContainText("The shop had only one");
  await expect(page.locator("[data-record-purchase]")).toHaveCount(0);

  // Reopen buying: Open again, and Record purchase is back.
  await (await barAction(page, '[data-move="REOPEN_BUYING"]')).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: m.button.REOPEN_BUYING, exact: true })
    .click();
  await expect(page.locator('[data-fact="progress"] [data-progress]')).toHaveText(
    en.orders.progress.OPEN,
  );
  await expect(page.locator("[data-record-purchase]")).toHaveCount(1);
});

/** A 1 × 1 PNG: the invented receipt photo. */
const RECEIPT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Two Open orders of one owner in branch EA, each of its own product (two steps of the form):
 * 2 at 5 000 so'm, by cash, approved today. Returns their ids in submit order.
 */
async function seedTwoProducts(owner: Person): Promise<string[]> {
  return withDatabase(async (client) => {
    await client.query("begin");
    try {
      await client.query("update users set locale = 'en' where username = $1", [owner.username]);
      const found = await client.query<{ id: string }>("select id from users where username = $1", [
        owner.username,
      ]);
      const ownerId = found.rows[0]!.id;
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
      const ids: string[] = [];
      for (const [name, submitted] of [
        [`Qalam ${tag}`, "now() - interval '2 hours'"],
        [`Bo'r ${tag}`, "now() - interval '1 hour'"],
      ] as const) {
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
        const number = `EA-90-${String(Math.floor(Math.random() * 900_000) + 100_000)}`;
        const order = await client.query<{ id: string }>(
          `insert into orders (number, branch_id, owner_id, created_by, status, variant_id,
                               department_id, needed_by, planned_qty, planned_price, planned_total,
                               payment_type, submitted_at, approved_at, created_at, updated_at)
           select $4, b.id, $1, $1, 'PURCHASING', $2, $3, '2031-05-01', 2, 5000, 10000, 'CASH',
                  ${submitted}, now(), now(), now()
             from branches b where b.code = 'EA'
           returning id`,
          [ownerId, variant.rows[0]!.id, department.rows[0]!.id, number],
        );
        ids.push(order.rows[0]!.id);
      }
      await client.query("commit");
      return ids;
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

test("a trip of two orders with a receipt: at 375 px one order at a time, the camera for the receipt (build plan 3.9; 11 smooth feel 3; 07 Receipt)", async ({
  page,
}, info) => {
  const owner = E2E_PURCHASE_USERS[info.project.name as keyof typeof E2E_PURCHASE_USERS];
  const [first, second] = (await seedTwoProducts(owner)) as [string, string];
  const phone = info.project.name === "phone-375";

  await signIn(page, owner);
  await page.goto(`/orders/purchase?ids=${first},${second}`);
  const lineOf = (id: string) => page.locator(`[data-line="${id}"]`);
  const save = page.getByRole("button", { name: f.save });

  if (phone) {
    // Step 1: the first order alone; no visit and no Save yet (plan of 3.9).
    const count = page.locator("[data-step-count]");
    await expect(count).toHaveText(f.step.replace("{current}", "1").replace("{total}", "2"));
    await expect(lineOf(first)).toBeVisible();
    await expect(lineOf(second)).toBeHidden();
    await expect(page.locator("#purchase-date")).toBeHidden();
    await expect(save).toBeHidden();
    await expect(
      page.locator("[data-step-bar]").getByRole("button", { name: f.previous }),
    ).toHaveCount(0);
    await lineOf(first).getByRole("button", { name: f.sameAsPlanned }).click();
    expect(await scrollsSideways(page)).toBe(false);
    await page.locator("[data-step-bar]").getByRole("button", { name: f.next }).click();

    // Step 2: the second order, its heading focused; then the visit and Save.
    await expect(count).toHaveText(f.step.replace("{current}", "2").replace("{total}", "2"));
    await expect(lineOf(first)).toBeHidden();
    await expect(lineOf(second)).toBeVisible();
    await expect(lineOf(second).locator("[data-step-heading]")).toBeFocused();
    await expect(page.locator("[data-step-bar]").getByRole("button", { name: f.next })).toHaveCount(
      0,
    );
    await lineOf(second).getByRole("button", { name: f.sameAsPlanned }).click();
    await expect(page.locator("#purchase-date")).toBeVisible();

    // "Take photo" opens the camera input itself: an image, the rear camera (07 Receipt).
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: f.takePhoto }).click();
    const camera = await chooser;
    expect(await camera.element().getAttribute("capture")).toBe("environment");
    expect(await camera.element().getAttribute("accept")).toBe("image/*");
    await camera.setFiles({ name: "chek.png", mimeType: "image/png", buffer: RECEIPT_PNG });
  } else {
    // A computer shows every order and the visit at once, without a step bar.
    await expect(lineOf(first)).toBeVisible();
    await expect(lineOf(second)).toBeVisible();
    await expect(page.locator("[data-step-bar]")).toBeHidden();
    await lineOf(first).getByRole("button", { name: f.sameAsPlanned }).click();
    await lineOf(second).getByRole("button", { name: f.sameAsPlanned }).click();
    await page
      .locator("[data-receipt-input]")
      .setInputFiles({ name: "chek.png", mimeType: "image/png", buffer: RECEIPT_PNG });
  }
  await expect(page.locator("[data-receipt]")).toHaveText("chek.png");
  expect(await scrollsSideways(page)).toBe(false);

  await save.click();
  await expect(page).toHaveURL(/\/orders(\?|$)/);

  // One trip, a record per order on it, and the receipt file on the trip (07 One trip 1).
  const saved = await withDatabase((client) =>
    client.query<{ trips: string; records: string; files: string }>(
      `select count(distinct p.trip_id)::text as trips, count(*)::text as records,
              (select count(*) from trip_files tf
                where tf.trip_id = min(p.trip_id::text)::uuid)::text as files
         from purchases p where p.order_id = any($1::uuid[])`,
      [[first, second]],
    ),
  );
  expect(saved.rows[0]).toEqual({ trips: "1", records: "2", files: "1" });
  for (const id of [first, second]) {
    await page.goto(`/orders/${id}`);
    await expect(page.locator('[data-fact="received"] dd')).toHaveText(/^2 of 2/);
  }
});
