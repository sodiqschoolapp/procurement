// The one place that applies the SQL migrations of drizzle/ to a database.
// `npm run db:migrate` and the test-database helper both call it, so a test database is built
// exactly as a real one is. Plain .mjs: task 0.16 runs it at deploy with production packages only.
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
 * Where an address leads: host, port and database name, as the driver itself reads them.
 * The driver's reading is used, not our own, because an address can name its host in more than
 * one place and the line a person reads must name the server that is really reached.
 * @param {string} connectionString
 * @returns {{ host: string, port: number, database: string }}
 */
export function databaseTarget(connectionString) {
  // The errors of `new URL` and of the driver can repeat the whole text, password included.
  // This one does not.
  const invalid = new Error("DATABASE_URL is not a valid database address.");
  if (!URL.canParse(connectionString)) throw invalid;
  try {
    const { host, port, database } = new pg.Client({ connectionString });
    return { host, port, database: database ?? "" };
  } catch {
    throw invalid;
  }
}

/**
 * Host, port and database name of an address, for a line a person reads.
 * The user and the password are never part of it, and neither is the address itself.
 * @param {string} connectionString
 * @returns {string}
 */
export function describeDatabase(connectionString) {
  const { host, port, database } = databaseTarget(connectionString);
  return `database "${database}" at ${host}:${port}`;
}

/**
 * What went wrong, for the one line `db:migrate` prints when it fails.
 * @param {unknown} error
 * @returns {string}
 */
export function failureReason(error) {
  // A refused connection arrives as a group of errors with an empty message of its own.
  const first = error instanceof AggregateError ? error.errors[0] : error;
  if (!(first instanceof Error)) return String(first);
  // Drizzle wraps a failed statement: its own message holds the SQL text, and PostgreSQL's
  // reason is the cause. Both are needed to find the line of the migration.
  if (first.cause instanceof Error) return `${first.cause.message}\n${first.message}`;
  return first.message;
}

/**
 * The names drizzle-kit gave the migrations, in order, with the time stamp of each.
 * @param {string} migrationsFolder
 * @returns {{ tag: string, when: number }[]}
 */
function readJournal(migrationsFolder) {
  const journal = JSON.parse(readFileSync(`${migrationsFolder}/meta/_journal.json`, "utf8"));
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
 * @param {string} [migrationsFolder] drizzle/ itself; only a test hands it another folder
 * @returns {Promise<string[]>} the names of the migrations it applied; empty when there was nothing to apply
 */
export async function applyMigrations(connectionString, migrationsFolder = MIGRATIONS_FOLDER) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    // Drizzle's migrator applies the files but does not say which. The names are worked out
    // here with the comparison the migrator makes itself: a migration is applied when its time
    // stamp is later than the newest one in the bookkeeping table.
    const journal = readJournal(migrationsFolder);
    const before = await readBookkeeping(client);
    const pending = journal
      .filter((entry) => before.newest === null || before.newest < entry.when)
      .map((entry) => entry.tag);

    await migrate(drizzle(client), {
      migrationsFolder,
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

    // The migrator skips in silence a migration whose time stamp is older than the newest one
    // already applied, and the check above, which uses the same comparison, cannot see it.
    // Every journal entry has its row, or the database does not match the code
    // (docs/decisions.md, "Decided ahead: task 0.3", item 6).
    if (after.count < journal.length) {
      throw new Error(
        `Drizzle's bookkeeping holds ${after.count} migrations, but the journal has ` +
          `${journal.length}: a migration was skipped. Its time stamp in ` +
          `drizzle/meta/_journal.json is likely older than one already applied.`,
      );
    }
    if (after.count > journal.length) {
      throw new Error(
        `Drizzle's bookkeeping holds ${after.count} migrations, but the journal has ` +
          `${journal.length}: the database is ahead of the code. It was migrated by a newer ` +
          `version of drizzle/.`,
      );
    }
    return pending;
  } finally {
    await client.end();
  }
}
