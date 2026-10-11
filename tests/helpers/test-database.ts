import { randomBytes } from "node:crypto";

import { Client } from "pg";

// The test-database helper (build-plan 0.2). Every database test file gets its own database,
// copied from a template that the run builds once from the migrations. A test file therefore
// starts clean, may really commit, and leaves nothing behind: its whole database is dropped.

export const TEST_DATABASE_PREFIX = "procurement_test_";
export const TEMPLATE_DATABASE = `${TEST_DATABASE_PREFIX}template`;

// PostgreSQL's own database, present on every server. The helper connects to it to create and
// drop test databases, and never to the database of DATABASE_URL, which holds the developer's data.
const MAINTENANCE_DATABASE = "postgres";

const TEST_DATABASE_NAME = /^procurement_test_[a-z0-9_]{1,40}$/;

/** The wall around the helper: only a name of this shape is ever created or dropped. */
export function isTestDatabaseName(name: string): boolean {
  return TEST_DATABASE_NAME.test(name);
}

function refuseUnlessTestDatabase(name: string): void {
  if (!isTestDatabaseName(name)) {
    throw new Error(
      `Refused: "${name}" is not a test database. ` +
        `The test helper only creates and drops databases named ${TEST_DATABASE_PREFIX}<letters and digits>.`,
    );
  }
}

/** The same server, another database. */
export function addressOf(serverUrl: string, database: string): string {
  const url = new URL(serverUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

async function onServer<T>(serverUrl: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: addressOf(serverUrl, MAINTENANCE_DATABASE) });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/** Stops with a line a person can act on when no PostgreSQL answers at the address. */
export async function assertServerAnswers(serverUrl: string): Promise<void> {
  try {
    await onServer(serverUrl, (client) => client.query("select 1"));
  } catch {
    const url = new URL(serverUrl);
    throw new Error(
      `PostgreSQL does not answer at ${url.hostname}:${url.port || "5432"}. ` +
        `Start it with: docker compose up -d`,
    );
  }
}

/** Creates one test database: a copy of the template, or an empty one with no tables at all. */
export async function createTestDatabase(
  serverUrl: string,
  options: { name?: string; fromTemplate: boolean },
): Promise<{ name: string; url: string }> {
  const name = options.name ?? `${TEST_DATABASE_PREFIX}${randomBytes(6).toString("hex")}`;
  refuseUnlessTestDatabase(name);

  // The name passed the check above, so it holds nothing that could end the quoted identifier.
  const copyOf = options.fromTemplate ? ` template "${TEMPLATE_DATABASE}"` : "";
  await onServer(serverUrl, (client) => client.query(`create database "${name}"${copyOf}`));

  return { name, url: addressOf(serverUrl, name) };
}

/** Drops one test database with everything in it. Any other name is refused before a command is sent. */
export async function dropTestDatabase(serverUrl: string, name: string): Promise<void> {
  refuseUnlessTestDatabase(name);
  await onServer(serverUrl, (client) =>
    client.query(`drop database if exists "${name}" with (force)`),
  );
}

export async function testDatabaseExists(serverUrl: string, name: string): Promise<boolean> {
  const found = await onServer(serverUrl, (client) =>
    client.query("select 1 from pg_database where datname = $1", [name]),
  );
  return found.rowCount === 1;
}

/** Every test database on the server, the template included. A crashed run can leave some behind. */
export async function listTestDatabases(serverUrl: string): Promise<string[]> {
  const found = await onServer(serverUrl, (client) =>
    client.query<{ datname: string }>("select datname from pg_database order by datname"),
  );
  return found.rows.map((row) => row.datname).filter(isTestDatabaseName);
}
