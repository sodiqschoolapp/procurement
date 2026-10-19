import { randomUUID } from "node:crypto";

import { type Page, expect } from "@playwright/test";
import pg from "pg";

import { SETTING_DEFAULTS } from "../../src/domain/settings";
import { insertPasswordUser } from "../../src/server/auth/password-user.mjs";
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_ROLES, e2eDatabaseUrl, serverDatabaseUrl } from "./global-setup";

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
        typeof before === "string" ? before : SETTING_DEFAULTS.overspend_guard_min_amount.toString(),
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
