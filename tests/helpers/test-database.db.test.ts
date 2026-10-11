import { sql } from "drizzle-orm";
import { Client } from "pg";
import { describe, expect, inject, it } from "vitest";

import { db } from "@/server/db/client";

import {
  TEST_DATABASE_PREFIX,
  assertServerAnswers,
  createTestDatabase,
  dropTestDatabase,
  testDatabaseExists,
} from "./test-database";

// build-plan 0.2: "the test-database helper (a real PostgreSQL, clean state for every test file)"
// and Done when: "the helper leaves no rows behind".

const serverUrl = inject("databaseServerUrl");

async function countSettings(url: string): Promise<number> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query<{ count: number }>(
      "select count(*)::int as count from settings",
    );
    return result.rows[0]?.count ?? -1;
  } finally {
    await client.end();
  }
}

describe("the test-database helper (build-plan 0.2)", () => {
  // A server that answers and refuses is passed on in its own words: "does not answer" would
  // send the reader to Docker for a fault that is somewhere else.
  it("passes on what the server itself says when it answers and refuses", async () => {
    const asNobody = new URL(serverUrl);
    asNobody.username = "invented_nobody";

    await expect(assertServerAnswers(asNobody.toString())).rejects.toThrow(
      'role "invented_nobody" does not exist',
    );
  });

  it("starts this test file in a test database that has every table and no row", async () => {
    const current = await db.execute<{ name: string }>(sql`select current_database() as name`);
    expect(current.rows[0]?.name.startsWith(TEST_DATABASE_PREFIX)).toBe(true);

    const tables = await db.execute<{ name: string }>(sql`
      select table_name as name from information_schema.tables where table_schema = 'public'
    `);
    expect(tables.rows.map((row) => row.name)).toContain("settings");

    for (const table of tables.rows) {
      const rows = await db.execute<{ count: number }>(
        sql`select count(*)::int as count from ${sql.identifier(table.name)}`,
      );
      expect(rows.rows, `rows in ${table.name}`).toEqual([{ count: 0 }]);
    }
  });

  it("leaves no rows behind: a dropped test database is gone, and the next one starts empty", async () => {
    const first = await createTestDatabase(serverUrl, { fromTemplate: true });
    const client = new Client({ connectionString: first.url });
    await client.connect();
    await client.query(
      "insert into settings (key, value, created_at) values ('invented_left_behind', '1'::jsonb, '2026-03-14T09:26:53Z')",
    );
    await client.end();
    expect(await countSettings(first.url)).toBe(1);

    await dropTestDatabase(serverUrl, first.name);

    expect(await testDatabaseExists(serverUrl, first.name)).toBe(false);

    const second = await createTestDatabase(serverUrl, { fromTemplate: true });
    try {
      expect(second.name).not.toBe(first.name);
      expect(await countSettings(second.url)).toBe(0);
    } finally {
      await dropTestDatabase(serverUrl, second.name);
    }
    expect(await testDatabaseExists(serverUrl, second.name)).toBe(false);
  });

  // CLAUDE.md, "Money and stock are always correct": a test run must never be able to empty
  // real data. `not_a_test_database` is an invented name that exists nowhere. PostgreSQL itself
  // would accept `drop database if exists` for it without an error, so a refusal can only come
  // from the helper, before a command is sent.
  it("refuses to drop or create a database that is not a test database", async () => {
    await expect(dropTestDatabase(serverUrl, "not_a_test_database")).rejects.toThrow(
      'Refused: "not_a_test_database" is not a test database.',
    );
    await expect(
      createTestDatabase(serverUrl, { name: "not_a_test_database", fromTemplate: false }),
    ).rejects.toThrow('Refused: "not_a_test_database" is not a test database.');

    expect(await testDatabaseExists(serverUrl, "not_a_test_database")).toBe(false);
  });
});
