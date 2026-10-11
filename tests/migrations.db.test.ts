import { readdirSync } from "node:fs";

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
