import { randomUUID } from "node:crypto";

import { type Locator, type Page, expect as baseExpect } from "@playwright/test";
import pg from "pg";

import { SETTING_DEFAULTS } from "../../src/domain/settings";
import en from "../../src/i18n/messages/en.json" with { type: "json" };
import { insertPasswordUser } from "../../src/server/auth/password-user.mjs";
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";
import { shownAmount } from "./shown-amount";

// The fixtures of the acceptance scenarios (build plan 9.1a, 9.1b; plan of 9.1b, decided item
// 12). The e2e database is kept between runs and CI retries a failed test, so every attempt
// writes its own invented branch, people and products (plan of 9.1a, review must-fixes 2 and 3):
// nothing of another project or attempt reaches a group row, a counter or a filtered list.

export type Person = { username: string; password: string; fullName: string };
export type Role = "HEAD" | "MANAGER" | "PRINCIPAL" | "FINANCE";

const PASSWORD = "invented-e2e-password";
const MADE_AT = new Date("2026-10-01T00:00:00Z");

export async function withDatabase<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
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

export async function inTransaction<T>(client: pg.Client, work: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    const result = await work();
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export function tag(): string {
  return randomUUID().slice(0, 8);
}

/** A new branch with no order at all: code Z and three random capitals (branches_code_check). */
export async function newBranch(): Promise<{ id: string; code: string }> {
  return withDatabase(async (client) => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = `Z${Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("")}`;
      const made = await client.query<{ id: string }>(
        `insert into branches (name, code, address, is_active, created_at)
         values ($1, $2, 'Sinov ko''chasi 9', true, $3)
         on conflict do nothing returning id`,
        [`Sinov filiali ${code} ${tag()}`, code, MADE_AT],
      );
      if (made.rows[0]) return { id: made.rows[0].id, code };
    }
    throw new Error("No free branch code after ten tries.");
  });
}

export async function branchId(code: string): Promise<string> {
  return withDatabase(async (client) => {
    const found = await client.query<{ id: string }>("select id from branches where code = $1", [
      code,
    ]);
    return found.rows[0]!.id;
  });
}

const ROLE_NAMES: Record<Role, string> = {
  HEAD: "Rahbar",
  MANAGER: "Menejer",
  PRINCIPAL: "Direktor",
  FINANCE: "Moliyachi",
};

/**
 * An invented user of the role, in the language given. A Head has no branch (03: all branches);
 * the others belong to the branch given. The Principal's one branch is checked at commit
 * (migration 0002): one transaction.
 */
export async function newPerson(
  role: Role,
  branch: string | null,
  locale: "uz" | "en" = "uz",
): Promise<Person & { id: string }> {
  const name = tag();
  const person = {
    fullName: `Sinov ${ROLE_NAMES[role]} ${name}`,
    username: `e2e_acc_${name}`,
    phone: "+998 90 000 98 00",
    role,
    locale,
  };
  const id = await withDatabase((client) =>
    inTransaction(client, async () => {
      const made = await insertPasswordUser(
        (text: string, values: unknown[]) => client.query(text, values),
        { ...person, isActive: true },
        PASSWORD,
        MADE_AT,
      );
      if (role !== "HEAD") {
        await client.query(
          `insert into user_branches (user_id, branch_id, user_role, user_is_active, created_at)
           values ($1, $2, $3, true, $4)`,
          [made.id, branch, role, MADE_AT],
        );
      }
      return made.id;
    }),
  );
  return { ...person, password: PASSWORD, id };
}

/** An invented Manager of one branch, in the language given. */
export async function newManager(
  branch: string,
  locale: "uz" | "en" = "uz",
): Promise<Person & { id: string }> {
  return newPerson("MANAGER", branch, locale);
}

export async function newDepartment(branch: string, name: string): Promise<string> {
  return withDatabase(async (client) => {
    const made = await client.query<{ id: string }>(
      `insert into departments (branch_id, name, responsible_name, is_active, created_at)
       values ($1, $2, 'Sinov Masʼul', true, $3) returning id`,
      [branch, name, MADE_AT],
    );
    return made.rows[0]!.id;
  });
}

/** An invented extra cost type (04 Extra cost types), such as the plan's delivery. */
export async function newExtraCostType(name: string): Promise<string> {
  return withDatabase(async (client) => {
    const made = await client.query<{ id: string }>(
      `insert into extra_cost_types (name, is_active, created_at) values ($1, true, $2)
       returning id`,
      [name, MADE_AT],
    );
    return made.rows[0]!.id;
  });
}

/** An invented product without subtypes at a reference price set by the Head (04 rules 1, 4). */
export async function newProduct(name: string, referencePrice: number): Promise<string> {
  return withDatabase((client) =>
    inTransaction(client, async () => {
      const mark = tag();
      const unit = await client.query<{ id: string }>(
        `insert into units (name, short_name, allow_decimal, is_active, created_at)
         values ($1, $2, false, true, $3) returning id`,
        [`O'lchov ${mark}`, `d${mark}`, MADE_AT],
      );
      const category = await client.query<{ id: string }>(
        `insert into categories (name, is_active, created_at) values ($1, true, $2) returning id`,
        [`Toifa ${mark}`, MADE_AT],
      );
      const product = await client.query<{ id: string }>(
        `insert into products (name, type, category_id, unit_id, reference_price, is_active,
                               has_variants, created_at)
         values ($1, 'GOODS', $2, $3, $4, true, false, $5) returning id`,
        [name, category.rows[0]!.id, unit.rows[0]!.id, referencePrice, MADE_AT],
      );
      const variant = await client.query<{ id: string }>(
        `insert into product_variants (product_id, name, is_default, reference_price, is_active,
                                       created_at)
         values ($1, 'default', true, $2, true, $3) returning id`,
        [product.rows[0]!.id, referencePrice, MADE_AT],
      );
      await client.query(
        `insert into price_history (variant_id, price, source, set_by, created_at)
         select $1, $2, 'HEAD', id, $3 from users where username = $4`,
        [variant.rows[0]!.id, referencePrice, MADE_AT, E2E_ROLES.HEAD.username],
      );
      return variant.rows[0]!.id;
    }),
  );
}

/**
 * An invented product with real subtypes, each at the reference price (04 rules 1, 4; 07
 * Substitution). Returns the subtype ids in the order given.
 */
export async function newProductWithSubtypes(
  name: string,
  referencePrice: number,
  subtypes: string[],
): Promise<string[]> {
  return withDatabase((client) =>
    inTransaction(client, async () => {
      const mark = tag();
      const unit = await client.query<{ id: string }>(
        `insert into units (name, short_name, allow_decimal, is_active, created_at)
         values ($1, $2, false, true, $3) returning id`,
        [`O'lchov ${mark}`, `s${mark}`, MADE_AT],
      );
      const category = await client.query<{ id: string }>(
        `insert into categories (name, is_active, created_at) values ($1, true, $2) returning id`,
        [`Toifa ${mark}`, MADE_AT],
      );
      const product = await client.query<{ id: string }>(
        `insert into products (name, type, category_id, unit_id, reference_price, is_active,
                               has_variants, created_at)
         values ($1, 'GOODS', $2, $3, $4, true, true, $5) returning id`,
        [name, category.rows[0]!.id, unit.rows[0]!.id, referencePrice, MADE_AT],
      );
      const ids: string[] = [];
      for (const subtype of subtypes) {
        const variant = await client.query<{ id: string }>(
          `insert into product_variants (product_id, name, is_default, reference_price, is_active,
                                         created_at)
           values ($1, $2, false, $3, true, $4) returning id`,
          [product.rows[0]!.id, subtype, referencePrice, MADE_AT],
        );
        await client.query(
          `insert into price_history (variant_id, price, source, set_by, created_at)
           select $1, $2, 'HEAD', id, $3 from users where username = $4`,
          [variant.rows[0]!.id, referencePrice, MADE_AT, E2E_ROLES.HEAD.username],
        );
        ids.push(variant.rows[0]!.id);
      }
      return ids;
    }),
  );
}

/**
 * `qty` of the subtype received into the branch at `cost`, written as postMovement() writes it:
 * the movement and its balance in one transaction (plan of 9.1c, decided item 2; as issue.spec.ts
 * sets up stock). The branch must hold none of it yet.
 */
export async function stockIn(
  branch: string,
  variantId: string,
  qty: number,
  cost: number,
  by: { id: string },
): Promise<void> {
  await withDatabase((client) =>
    inTransaction(client, async () => {
      await client.query(
        `insert into stock_movements (branch_id, variant_id, type, qty_delta, unit_cost,
                                      balance_after, created_by, created_at)
         values ($1, $2, 'RECEIPT', $3, $4, $3, $5, now())`,
        [branch, variantId, qty, cost, by.id],
      );
      await client.query(
        `insert into stock_balances (branch_id, variant_id, qty, avg_cost, created_at, updated_at)
         values ($1, $2, $3, $4, now(), now())`,
        [branch, variantId, qty, cost],
      );
    }),
  );
}

/**
 * A complete never-submitted draft of the owner: `quantity` of the subtype at its price, in cash
 * unless the payment type is given, with the planned extra costs given (05 field 12).
 */
export async function insertDraft(
  owner: { id: string },
  branch: string,
  variantId: string,
  departmentId: string,
  quantity: number,
  price: number,
  plan: { paymentType?: "CASH" | "CARD"; extras?: { typeId: string; amount: number }[] } = {},
): Promise<string> {
  return withDatabase((client) =>
    inTransaction(client, async () => {
      const made = await client.query<{ id: string }>(
        `insert into orders (branch_id, owner_id, created_by, variant_id, department_id, needed_by,
                             planned_qty, planned_price, payment_type, created_at, updated_at)
         values ($1, $2, $2, $3, $4, '2031-05-01', $5, $6, $7, now(), now()) returning id`,
        [branch, owner.id, variantId, departmentId, quantity, price, plan.paymentType ?? "CASH"],
      );
      const orderId = made.rows[0]!.id;
      for (const extra of plan.extras ?? []) {
        await client.query(
          `insert into order_extras (order_id, extra_cost_type_id, amount, created_at)
           values ($1, $2, $3, now())`,
          [orderId, extra.typeId, extra.amount],
        );
      }
      return orderId;
    }),
  );
}

export async function signIn(
  page: Page,
  user: { username: string; password: string },
): Promise<void> {
  await page.goto("/login");
  await page.locator("#username").fill(user.username);
  await page.locator("#password").fill(user.password);
  await page.locator("form button[type=submit]").click();
  await expect(page).toHaveURL(/\/$/);
}

export function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

/** 08 Order's cash count of an order, as the database holds its rows and records. */
export async function countOf(orderId: string): Promise<number> {
  return withDatabase(async (client) => {
    const found = await client.query<{ count: string }>(
      `select (
         coalesce((select sum(case r.kind when 'CASH_RETURNED' then -r.amount else r.amount end)
                   from money_rows r join money_actions a on a.id = r.money_action_id
                   where r.order_id = $1 and not a.is_cancelled
                     and r.kind in ('CASH_GIVEN', 'CASH_RETURNED', 'PAID_BACK')), 0)
         - coalesce((select sum(p.qty * p.unit_price) from purchases p
                     join purchase_trips t on t.id = p.trip_id
                     where p.order_id = $1 and not p.is_cancelled and t.payment_type = 'CASH'), 0)
         - coalesce((select sum(e.amount) from purchase_extras e
                     join purchases p on p.id = e.purchase_id
                     where p.order_id = $1 and not p.is_cancelled and e.payment_type = 'CASH'), 0)
       )::text as count`,
      [orderId],
    );
    return Number(found.rows[0]!.count);
  });
}

export async function statusOf(orderId: string): Promise<string> {
  return withDatabase(async (client) => {
    const found = await client.query<{ status: string }>(
      "select status from orders where id = $1",
      [orderId],
    );
    return found.rows[0]!.status;
  });
}

/** The stock of a subtype in a branch as `stock_balances` holds it, null without a row. */
export async function stockOf(branch: string, variantId: string): Promise<string | null> {
  return withDatabase(async (client) => {
    const found = await client.query<{ qty: string }>(
      "select qty::text as qty from stock_balances where branch_id = $1 and variant_id = $2",
      [branch, variantId],
    );
    return found.rows[0]?.qty ?? null;
  });
}

/** One key for every test that changes the school's overspend guard amount (plan of 9.1b, 4). */
const GUARD_LOCK = 9_102_001;

/**
 * Runs `work` while this test holds the guard amount (plan of 9.1b, decided item 4): a session
 * advisory lock on a connection of its own, so S12 of the two projects and the settings test that
 * changes the amount never overlap. The amount found at the start is put back afterwards, and the
 * lock released, whether `work` passed or failed (review of the plan, correction 3).
 */
export async function withGuardLock<T>(work: () => Promise<T>): Promise<T> {
  const client = new pg.Client(
    connectionOptions(e2eDatabaseUrl(serverDatabaseUrl()), process.env.DATABASE_CA_CERT),
  );
  await client.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [GUARD_LOCK]);
    const found = await client.query<{ value: unknown }>(
      "select value from settings where key = 'overspend_guard_min_amount'",
    );
    const before: unknown = found.rows[0]?.value;
    try {
      return await work();
    } finally {
      // No row means the default; it is written as that value, as rows are never deleted.
      await setGuardAmount(
        client,
        typeof before === "string"
          ? before
          : SETTING_DEFAULTS.overspend_guard_min_amount.toString(),
      );
      await client.query("select pg_advisory_unlock($1)", [GUARD_LOCK]);
    }
  } finally {
    await client.end();
  }
}

/** Writes the guard amount as it is stored: a JSON text of whole so'm (src/domain/settings.ts). */
export async function setGuardAmount(client: pg.Client, amount: string): Promise<void> {
  await client.query(
    `insert into settings (key, value, created_at)
     values ('overspend_guard_min_amount', to_jsonb($1::text), now())
     on conflict (key) do update set value = excluded.value`,
    [amount],
  );
}

// The flow helpers of the acceptance scenarios (plan of 9.1c, decided item 9): moved here from
// acceptance-money.spec.ts, as a spec file cannot be imported by another without registering its
// tests twice.

// Each step answers after a server action on the `next dev` server while other projects run; a
// result line can take longer than the default 5 seconds to appear there.
export const expect = baseExpect.configure({ timeout: 15_000 });

const o = en.orders;
const m = en.orders.moves;

export type Scene = {
  branch: { id: string; code: string };
  department: string;
  delivery: string;
  manager: Person & { id: string };
  principal: Person & { id: string };
  finance: Person & { id: string };
  head: Person & { id: string };
};

/** A branch of its own with its department, the plan's delivery and one person of each role. */
export async function newScene(): Promise<Scene> {
  const branch = await newBranch();
  return {
    branch,
    department: await newDepartment(branch.id, `Bo'lim ${tag()}`),
    delivery: await newExtraCostType(`Yetkazib berish ${tag()}`),
    manager: await newPerson("MANAGER", branch.id, "en"),
    principal: await newPerson("PRINCIPAL", branch.id, "en"),
    finance: await newPerson("FINANCE", branch.id, "en"),
    head: await newPerson("HEAD", null, "en"),
  };
}

export type Planned = { id: string; product: string; variantId: string };

/** A draft of the scene's Manager: `quantity` × `price`, with the planned delivery when given. */
export async function planOf(
  scene: Scene,
  product: string,
  quantity: number,
  price: number,
  plan: { delivery?: number; paymentType?: "CASH" | "CARD" } = {},
): Promise<Planned> {
  const variantId = await newProduct(product, price);
  const id = await insertDraft(
    scene.manager,
    scene.branch.id,
    variantId,
    scene.department,
    quantity,
    price,
    {
      paymentType: plan.paymentType,
      extras: plan.delivery ? [{ typeId: scene.delivery, amount: plan.delivery }] : [],
    },
  );
  return { id, product, variantId };
}

/** The plan of section 8: 100 notebooks × 5 000 in cash plus 20 000 delivery. */
export function notebooks(scene: Scene, paymentType: "CASH" | "CARD" = "CASH"): Promise<Planned> {
  return planOf(scene, `Daftar ${tag()}`, 100, 5000, { delivery: 20000, paymentType });
}

/** Signs the page in as another person. */
export async function as(page: Page, person: Person): Promise<void> {
  await page.context().clearCookies();
  await signIn(page, person);
}

export function count(value: number, one: string, other: string): string {
  return value === 1 ? one : other.replace("#", String(value));
}

/** The group row of a product in the order list (05 Group rows 1). */
export function groupOf(page: Page, product: string): Locator {
  return page.locator("tbody[data-group]").filter({ hasText: product });
}

/**
 * Ticks the group rows of the products. On a phone the action bar can cover a lower row's tick
 * box once the first is ticked; the page has answered the first tick, so a click event reaches
 * the others (as settlement.spec.ts ticks its second order).
 */
export async function tickGroups(page: Page, orders: Planned[]): Promise<void> {
  for (const [at, order] of orders.entries()) {
    const box = groupOf(page, order.product).getByRole("checkbox", {
      name: o.list.tickGroup.replace("{product}", order.product),
    });
    if (at === 0) await box.check();
    else await box.dispatchEvent("click");
    await expect(box).toBeChecked();
  }
}

/** The list of the owner's orders at one status. */
export async function listAt(page: Page, scene: Scene, status: string): Promise<void> {
  await page.goto(`/orders?status=${status}&owner=${scene.manager.id}`);
}

/** Opens the Approve dialog of the ticked orders. */
export async function openApprove(page: Page, orders: Planned[]): Promise<Locator> {
  await tickGroups(page, orders);
  await page
    .locator("[data-list-bar]")
    .getByRole("button", {
      name:
        orders.length > 1
          ? o.approve.buttonCount.replace("{count}", String(orders.length))
          : o.approve.button,
      exact: true,
    })
    .click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Confirms an open Approve dialog and waits for the result (D38). */
export async function confirmApprove(page: Page, dialog: Locator, approved: number): Promise<void> {
  await dialog.getByRole("button", { name: o.approve.button, exact: true }).click();
  await expect(
    page.getByText(count(approved, "Approved 1 order.", "Approved # orders.")),
  ).toBeVisible();
}

/** The scene's Manager ticks the drafts in the grid and submits them, through the confirmation. */
export async function submitInGrid(page: Page, scene: Scene, orders: Planned[]): Promise<void> {
  await as(page, scene.manager);
  await page.goto("/orders");
  for (const order of orders) {
    await page
      .getByRole("checkbox", { name: o.tickRow.replace("{product}", order.product) })
      .check();
  }
  await page
    .getByRole("button", { name: o.submit.button.replace("{count}", String(orders.length)) })
    .click();
  const submit = page.getByRole("alertdialog");
  await submit.getByRole("button", { name: o.submit.confirm, exact: true }).click();
  await expect(
    page.getByText(new RegExp(count(orders.length, "Submitted 1 order", "Submitted # orders"))),
  ).toBeVisible();
}

/**
 * The scene's setting before Finance (plan of 9.1b, decided item 1): the Manager submits the
 * drafts in the grid, the Head and then the Principal approve them on the list.
 */
export async function throughApprovals(page: Page, scene: Scene, orders: Planned[]): Promise<void> {
  await submitInGrid(page, scene, orders);

  for (const [approver, status] of [
    [scene.head, "PENDING_HEAD"],
    [scene.principal, "PENDING_PRINCIPAL"],
  ] as const) {
    await as(page, approver);
    await listAt(page, scene, status);
    await confirmApprove(page, await openApprove(page, orders), orders.length);
  }
}

/**
 * Finance approves the ticked orders with the cash prefilled per order (08 When Finance
 * approves): each given row is asserted as prefilled before the confirmation.
 */
export async function financeApproves(
  page: Page,
  scene: Scene,
  orders: Planned[],
  prefilled: Record<string, string>,
): Promise<void> {
  await as(page, scene.finance);
  await listAt(page, scene, "PENDING_FINANCE");
  const dialog = await openApprove(page, orders);
  for (const [orderId, amount] of Object.entries(prefilled)) {
    await expect(dialog.locator(`[data-cash-row="${orderId}"] input`)).toHaveValue(
      shownAmount(amount),
    );
  }
  expect(await scrollsSideways(page)).toBe(false);
  await confirmApprove(page, dialog, orders.length);
}

export type Bought = {
  qty?: string;
  price?: string;
  delivery?: string;
  /** The subtype bought, when another than the ordered one (07 Substitution). */
  subtype?: string;
  comment?: string;
  /** The progress the order page shows afterwards: Done unless a part was bought (07 Order progress). */
  progress?: "OPEN" | "DONE";
};

/**
 * The owner records one purchase of the order from its page: Same as planned, then what differs
 * (07 Purchase record). Buying the planned quantity finishes it: the page shows Done (plan of
 * 9.1b, review correction 1); a part leaves it Open (plan of 9.1c, S4).
 */
export async function recordPurchase(
  page: Page,
  order: Planned,
  bought: Bought = {},
): Promise<void> {
  await page.goto(`/orders/${order.id}`);
  await page.locator("[data-record-purchase]").click();
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}/purchase$`));
  await page.getByRole("button", { name: en.purchase.form.sameAsPlanned }).click();
  if (bought.qty) await page.locator(`#purchase-qty-${order.id}`).fill(bought.qty);
  if (bought.price) await page.locator(`#purchase-price-${order.id}`).fill(bought.price);
  if (bought.delivery) {
    await page.locator(`#purchase-extra-amount-0-${order.id}`).fill(bought.delivery);
  }
  if (bought.subtype) {
    await page.locator(`#purchase-subtype-${order.id}`).selectOption(bought.subtype);
  }
  if (bought.comment) await page.locator(`#purchase-comment-${order.id}`).fill(bought.comment);
  expect(await scrollsSideways(page)).toBe(false);
  await page.getByRole("button", { name: en.purchase.form.save }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/${order.id}$`));
  if (bought.progress === "OPEN") {
    // Open buying is the status Open alone in the header (redesign of 22.10.2026).
    await expect(page.locator('header [data-request-status="PURCHASING"]')).toBeVisible();
    await expect(page.locator("header [data-progress]")).toHaveCount(0);
  } else {
    await expect(page.locator(`[data-progress="${bought.progress ?? "DONE"}"]`)).toBeVisible();
  }
}

/** The order page's label (Number, Price or Total): its colour and its text. */
export function labelOf(page: Page, label: "number" | "price" | "total"): Locator {
  return page.locator(`[data-colours] [data-colour-label="${label}"]`).first();
}

/** A move of the list bar on the ticked orders, through its confirmation. */
export async function moveOnList(
  page: Page,
  orders: Planned[],
  move: "CLOSE_EXACT" | "SEND_TO_SETTLEMENT",
  done: string,
): Promise<void> {
  await tickGroups(page, orders);
  await page.locator(`[data-list-bar] [data-move="${move}"]`).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: m.button[move], exact: true }).click();
  await expect(page.getByText(done)).toBeVisible();
}

/** The number an order got at its Submit. */
export async function numberOf(orderId: string): Promise<string> {
  return withDatabase(async (client) => {
    const found = await client.query<{ number: string }>(
      "select number from orders where id = $1",
      [orderId],
    );
    return found.rows[0]!.number;
  });
}

/** The number of stock movements of a subtype in a branch. */
export async function movementsOf(branch: string, variantId: string): Promise<number> {
  return withDatabase(async (client) => {
    const found = await client.query<{ count: number }>(
      "select count(*)::int as count from stock_movements where branch_id = $1 and variant_id = $2",
      [branch, variantId],
    );
    return found.rows[0]!.count;
  });
}
