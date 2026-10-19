import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import pg from "pg";
import { describe, expect, inject, it } from "vitest";

import { MIGRATIONS_FOLDER, applyMigrations } from "../../../../scripts/apply-migrations.mjs";
import { createTestDatabase, dropTestDatabase } from "../../../../tests/helpers/test-database";

// Build plan 6.6b: migration 0044 changes how analytics_spending rows are written (has_receipt,
// NOT NULL; plan of 6.6b, Database changes), so it is run over rows written the way the 6.6a
// refresh wrote them (.claude/rules/database.md): a spending row with its payments part, an
// outcome row, and a finished analytics_refresh job row.
// Its own fresh database, so the old schema never touches the shared template.

const AT = "2026-10-16T05:00:00Z";
const FINISHED = "2026-10-16T05:00:03Z";

/** drizzle/ cut after the migration with this tag: the SQL files and the journal up to it. */
function migrationsUpTo(tag: string): string {
  const cut = mkdtempSync(join(tmpdir(), `migrations-${tag.slice(0, 4)}-`));
  cpSync(MIGRATIONS_FOLDER, cut, { recursive: true });
  const journalPath = join(cut, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  const index = journal.entries.findIndex((entry: { tag: string }) => entry.tag === tag);
  expect(index).toBeGreaterThan(0);
  journal.entries = journal.entries.slice(0, index + 1);
  writeFileSync(journalPath, JSON.stringify(journal));
  return cut;
}

describe("migration 0044: the spending rows the 0043 refresh wrote are cleared for the next run (.claude/rules/database.md)", () => {
  it("empties both spending tables (payments first), keeps analytics_outcomes, and clears the job's last_tick and last_finished_at", async () => {
    const serverUrl = inject("databaseServerUrl");
    const before = migrationsUpTo("0043_analytics_finance");
    const upTo = migrationsUpTo("0044_analytics_finance_speed");
    const database = await createTestDatabase(serverUrl, { fromTemplate: false });
    const client = new pg.Client({ connectionString: database.url });
    try {
      await applyMigrations(database.url, before);
      await client.connect();
      const one = async (text: string, values: unknown[]) =>
        (await client.query(text, values)).rows[0].id as string;
      const branch = await one(
        `insert into branches (name, code, address, created_at)
          values ('Invented branch', 'INV', 'Invented street 1', $1) returning id`,
        [AT],
      );
      const user = await one(
        `insert into users (id, full_name, username, email, phone, role, created_at, updated_at)
          values ($1, 'Invented Manager', 'invented.manager', 'invented.manager@example.invalid',
            '+998900000002', 'MANAGER', $2, $2) returning id`,
        [randomUUID(), AT],
      );
      const category = await one(
        `insert into categories (name, created_at) values ('Invented category', $1) returning id`,
        [AT],
      );
      const department = await one(
        `insert into departments (branch_id, name, created_at)
          values ($1, 'Invented department', $2) returning id`,
        [branch, AT],
      );
      const unit = await one(
        `insert into units (name, short_name, allow_decimal, created_at)
          values ('Invented unit', 'iu', false, $1) returning id`,
        [AT],
      );
      // A product and its hidden default subtype in one statement: the shape trigger is checked
      // at commit (0013).
      const variant = await one(
        `with product as (
            insert into products (name, category_id, unit_id, created_at)
              values ('Invented product', $1, $2, $3) returning id)
          insert into product_variants (product_id, name, is_default, created_at)
            select id, 'default', true, $3 from product returning id`,
        [category, unit, AT],
      );
      const order = await one(
        `insert into orders (branch_id, owner_id, created_by, payment_type, created_at, updated_at)
          values ($1, $2, $2, 'CASH', $3, $3) returning id`,
        [branch, user, AT],
      );
      const trip = await one(
        `insert into purchase_trips (client_key, branch_id, purchased_on, payment_type, created_by, created_at)
          values ($1, $2, '2026-10-16', 'CASH', $3, $4) returning id`,
        [randomUUID(), branch, user, AT],
      );
      const purchase = await one(
        `insert into purchases (trip_id, order_id, branch_id, variant_id, qty, unit_price, created_by, created_at)
          values ($1, $2, $3, $4, 2, 15000, $5, $6) returning id`,
        [trip, order, branch, variant, user, AT],
      );
      // As the 6.6a refresh wrote them: no has_receipt yet.
      await client.query(
        `insert into analytics_spending (purchase_id, order_id, branch_id, purchased_on, category_id,
            department_id, owner_id, amount, variant_id, qty, unit_price, goods, created_at)
          values ($1, $2, $3, '2026-10-16', $4, $5, $6, 30000, $7, 2, 15000, 30000, $8)`,
        [purchase, order, branch, category, department, user, variant, AT],
      );
      await client.query(
        `insert into analytics_spending_payments (purchase_id, payment_type, amount)
          values ($1, 'CASH', 30000)`,
        [purchase],
      );
      await client.query(
        `insert into analytics_outcomes (order_id, branch_id, ended_on, category_id, department_id,
            owner_id, colour, planned, actual, difference)
          values ($1, $2, '2026-10-16', $3, $4, $5, 'green', 30000, 30000, 0)`,
        [order, branch, category, department, user],
      );
      await client.query(
        `insert into scheduled_jobs (name, schedule, last_tick, last_started_at, last_finished_at, created_at)
          values ('analytics_refresh', '{"everyMinutes": 5}'::jsonb, $1, $1, $2, $1)
          on conflict (name) do update set last_tick = $1, last_started_at = $1, last_finished_at = $2`,
        [AT, FINISHED],
      );

      await applyMigrations(database.url, upTo);
      const count = async (table: string) =>
        Number((await client.query(`select count(*)::int as n from ${table}`)).rows[0].n);
      expect(await count("analytics_spending_payments")).toBe(0);
      expect(await count("analytics_spending")).toBe(0);
      expect(await count("analytics_outcomes")).toBe(1);
      expect(await count("analytics_settlements")).toBe(0);
      const job = await client.query(
        `select last_tick, last_started_at, last_finished_at from scheduled_jobs
          where name = 'analytics_refresh'`,
      );
      expect(job.rows).toEqual([
        { last_tick: null, last_started_at: new Date(AT), last_finished_at: null },
      ]);
      const columns = await client.query(
        `select column_name, is_nullable from information_schema.columns
          where table_name = 'analytics_spending'
            and column_name = 'has_receipt'`,
      );
      expect(columns.rows).toEqual([{ column_name: "has_receipt", is_nullable: "NO" }]);
    } finally {
      await client.end();
      await dropTestDatabase(serverUrl, database.name);
      rmSync(before, { recursive: true, force: true });
      rmSync(upTo, { recursive: true, force: true });
    }
  });
});
