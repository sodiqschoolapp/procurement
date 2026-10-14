import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";

import { MIGRATIONS_FOLDER, applyMigrations } from "../scripts/apply-migrations.mjs";
import { createTestDatabase, dropTestDatabase } from "./helpers/test-database";

// build-plan 0.2, Done when ("`npm run db:migrate` works on an empty database");
// developer-rules.md rule 5 ("Constraints in SQL migrations").

const serverUrl = inject("databaseServerUrl");

async function tablesOf(url: string): Promise<string[]> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const found = await client.query<{ name: string }>(`
      select table_schema || '.' || table_name as name
      from information_schema.tables
      where table_schema not in ('pg_catalog', 'information_schema')
      order by name
    `);
    return found.rows.map((row) => row.name);
  } finally {
    await client.end();
  }
}

async function bookkeepingRows(url: string): Promise<number> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const found = await client.query<{ count: number }>(
      `select count(*)::int as count from drizzle.__drizzle_migrations`,
    );
    return found.rows[0]!.count;
  } finally {
    await client.end();
  }
}

// An invented migration: one table, named after the migration.
type Migration = { tag: string; when: number; table: string };

/** Writes a migrations folder as drizzle-kit would: the journal and one .sql file per entry. */
function writeMigrationsFolder(folder: string, migrations: Migration[]): void {
  mkdirSync(join(folder, "meta"), { recursive: true });
  const entries = migrations.map((migration, idx) => ({
    idx,
    version: "7",
    when: migration.when,
    tag: migration.tag,
    breakpoints: true,
  }));
  writeFileSync(
    join(folder, "meta", "_journal.json"),
    JSON.stringify({ version: "7", dialect: "postgresql", entries }),
  );
  for (const migration of migrations) {
    writeFileSync(
      join(folder, `${migration.tag}.sql`),
      `CREATE TABLE "${migration.table}" ("id" integer PRIMARY KEY);\n`,
    );
  }
}

describe("migrations (build-plan 0.2; developer-rules.md rule 5)", () => {
  let empty: { name: string; url: string };

  beforeAll(async () => {
    empty = await createTestDatabase(serverUrl, { fromTemplate: false });
  });

  afterAll(async () => {
    await dropTestDatabase(serverUrl, empty.name);
  });

  it("applies every file of drizzle/ to an empty database, and a second run applies nothing", async () => {
    const files = readdirSync(MIGRATIONS_FOLDER)
      .filter((file) => file.endsWith(".sql"))
      .map((file) => file.replace(/\.sql$/, ""))
      .sort();
    expect(files.length).toBeGreaterThan(0);
    expect(await tablesOf(empty.url)).toEqual([]);

    const first = await applyMigrations(empty.url);

    expect(first).toEqual(files);
    const tables = await tablesOf(empty.url);
    expect(tables).toContain("public.settings");

    const second = await applyMigrations(empty.url);

    expect(second).toEqual([]);
    expect(await tablesOf(empty.url)).toEqual(tables);
  });
});

// docs/decisions.md, "Decided ahead: task 0.3", item 6 (guard 2): after migrating, the
// bookkeeping table holds as many rows as the journal has entries.
describe("a skipped migration is refused (Decided ahead 0.3, item 6)", () => {
  // Two invented migrations. "older" has the older time stamp but reaches the journal later,
  // as when two branches each add a migration and the older one is merged second.
  const older: Migration = { tag: "0000_older", when: 1791700000000, table: "invented_older" };
  const newer: Migration = { tag: "0001_newer", when: 1791800000000, table: "invented_newer" };

  const databases: string[] = [];
  let folder: string;

  beforeAll(() => {
    folder = mkdtempSync(join(tmpdir(), "procurement-migrations-"));
  });

  afterAll(async () => {
    for (const name of databases) await dropTestDatabase(serverUrl, name);
    rmSync(folder, { recursive: true, force: true });
  });

  async function emptyDatabase(): Promise<string> {
    const created = await createTestDatabase(serverUrl, { fromTemplate: false });
    databases.push(created.name);
    return created.url;
  }

  it("refuses a migration whose time stamp is older than one already applied", async () => {
    const url = await emptyDatabase();
    const skipping = join(folder, "skipping");

    writeMigrationsFolder(skipping, [newer]);
    expect(await applyMigrations(url, skipping)).toEqual([newer.tag]);

    writeMigrationsFolder(skipping, [older, newer]);
    await expect(applyMigrations(url, skipping)).rejects.toThrow(
      "Drizzle's bookkeeping holds 1 migrations, but the journal has 2: a migration was skipped.",
    );

    // Nothing failed while running: the migrator skipped the older one, and the count caught it.
    expect(await bookkeepingRows(url)).toBe(1);
    const tables = await tablesOf(url);
    expect(tables).toContain(`public.${newer.table}`);
    expect(tables).not.toContain(`public.${older.table}`);
  });

  it("refuses a database that is ahead of the code", async () => {
    const url = await emptyDatabase();
    const both = join(folder, "both");
    const first = join(folder, "first");

    writeMigrationsFolder(both, [older, newer]);
    expect(await applyMigrations(url, both)).toEqual([older.tag, newer.tag]);

    writeMigrationsFolder(first, [older]);
    await expect(applyMigrations(url, first)).rejects.toThrow(
      "Drizzle's bookkeeping holds 2 migrations, but the journal has 1: the database is ahead of the code.",
    );
  });
});
