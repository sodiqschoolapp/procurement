// The one place that applies the SQL migrations of drizzle/ to a database.
// `npm run db:migrate` and the test-database helper both call it, so a test database is built
// exactly as a real one is. Plain .mjs: task 0.15 runs it at deploy with production packages only.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

// Drizzle's own bookkeeping: one row per applied migration. It is not one of the spec's tables.
const BOOKKEEPING_SCHEMA = "drizzle";
const BOOKKEEPING_TABLE = "__drizzle_migrations";

/**
 * Host, port and database name of an address, for a line a person reads.
 * The user and the password are never part of it, and neither is the address itself.
 * @param {string} connectionString
 * @returns {string}
 */
export function describeDatabase(connectionString) {
  let url;
  try {
    url = new URL(connectionString);
  } catch {
    // The error of `new URL` repeats the whole text, password included. This one does not.
    throw new Error("DATABASE_URL is not a valid database address.");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  return `database "${database}" at ${url.hostname}:${url.port || "5432"}`;
}

/**
 * The names drizzle-kit gave the migrations, in order, with the time stamp of each.
 * @returns {{ tag: string, when: number }[]}
 */
function readJournal() {
  const journal = JSON.parse(readFileSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`, "utf8"));
  return journal.entries;
}

/**
 * How many migrations the bookkeeping table holds, and the time stamp of the newest.
 * @param {pg.Client} client
 * @returns {Promise<{ count: number, newest: number | null }>}
 */
async function readBookkeeping(client) {
  const exists = await client.query("select to_regclass($1) as found", [
    `${BOOKKEEPING_SCHEMA}.${BOOKKEEPING_TABLE}`,
  ]);
  if (exists.rows[0].found === null) return { count: 0, newest: null };

  const result = await client.query(
    `select count(*)::int as count, max(created_at) as newest from "${BOOKKEEPING_SCHEMA}"."${BOOKKEEPING_TABLE}"`,
  );
  const { count, newest } = result.rows[0];
  return { count, newest: newest === null ? null : Number(newest) };
}

/**
 * Applies every migration the database does not have yet, in one transaction.
 * @param {string} connectionString
 * @returns {Promise<string[]>} the names of the migrations it applied; empty when there was nothing to apply
 */
export async function applyMigrations(connectionString) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    // Drizzle's migrator applies the files but does not say which. The names are worked out
    // here with the comparison the migrator makes itself: a migration is applied when its time
    // stamp is later than the newest one in the bookkeeping table.
    const before = await readBookkeeping(client);
    const pending = readJournal()
      .filter((entry) => before.newest === null || before.newest < entry.when)
      .map((entry) => entry.tag);

    await migrate(drizzle(client), {
      migrationsFolder: MIGRATIONS_FOLDER,
      migrationsSchema: BOOKKEEPING_SCHEMA,
      migrationsTable: BOOKKEEPING_TABLE,
    });

    // The report must never differ from what happened. If a Drizzle upgrade changes its
    // bookkeeping, this stops loudly instead of printing a wrong line.
    const after = await readBookkeeping(client);
    if (after.count - before.count !== pending.length) {
      throw new Error(
        `Migrations were applied, but the report does not match Drizzle's bookkeeping: ` +
          `expected ${pending.length} new, found ${after.count - before.count}. ` +
          `Check scripts/apply-migrations.mjs against the installed drizzle-orm.`,
      );
    }
    return pending;
  } finally {
    await client.end();
  }
}
