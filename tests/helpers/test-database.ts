import { randomBytes } from "node:crypto";

import { Client } from "pg";

import { databaseTarget } from "../../scripts/apply-migrations.mjs";

// The test-database helper (build-plan 0.2). Every database test file gets its own database,
// copied from a template that the run builds once from the migrations. A test file therefore
// starts clean, may really commit, and leaves nothing behind: its whole database is dropped.

export const TEST_DATABASE_PREFIX = "procurement_test_";
export const TEMPLATE_DATABASE = `${TEST_DATABASE_PREFIX}template`;

// The name docker-compose.yml gives its PostgreSQL server. The helper works on that server only.
export const COMPOSE_CLUSTER_NAME = "procurement-compose";

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

/**
 * The second wall: the helper drops databases, so it works only on the server that
 * docker-compose.yml starts. A good name on a wrong server (another PostgreSQL on this machine,
 * a hosted database) is refused before anything is created or dropped.
 */
export function refuseUnlessComposeServer(clusterName: string): void {
  if (clusterName !== COMPOSE_CLUSTER_NAME) {
    throw new Error(
      `Refused: this PostgreSQL server is not the one docker-compose.yml starts ` +
        `(its cluster name is "${clusterName}", not "${COMPOSE_CLUSTER_NAME}"). ` +
        `The test helper creates and drops databases there and nowhere else. ` +
        `Check DATABASE_URL in the local .env file (README.md, "Run it").`,
    );
  }
}

/** The same server, another database. */
export function addressOf(serverUrl: string, database: string): string {
  // The error of `new URL` repeats the whole address. This one does not.
  if (!URL.canParse(serverUrl)) throw new Error("DATABASE_URL is not a valid database address.");
  const url = new URL(serverUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

// Every create and drop goes through here, so the check of the server cannot be forgotten.
// It asks the server that really answered, whatever the address looks like.
async function onServer<T>(serverUrl: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: addressOf(serverUrl, MAINTENANCE_DATABASE) });
  await client.connect();
  try {
    const shown = await client.query<{ cluster_name: string }>("show cluster_name");
    refuseUnlessComposeServer(shown.rows[0]?.cluster_name ?? "");
    return await work(client);
  } finally {
    await client.end();
  }
}

/**
 * Stops with a line a person can act on when no PostgreSQL answers at the address, and refuses
 * a server that is not the one of docker-compose.yml.
 */
export async function assertServerAnswers(serverUrl: string): Promise<void> {
  const { host, port } = databaseTarget(serverUrl);
  try {
    await onServer(serverUrl, (client) => client.query("select 1"));
  } catch (error) {
    // A refusal of the helper, or of a server that answers (a wrong user), says so itself.
    const isConnectionFailure =
      error instanceof AggregateError ||
      (error instanceof Error && "syscall" in error && !("severity" in error));
    if (!isConnectionFailure) throw error;
    throw new Error(
      `PostgreSQL does not answer at ${host}:${port}. Start it with: docker compose up -d`,
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

// How long a drop waits for the connections of a closed pool to leave the server.
const CLOSING_WAIT_MS = 5_000;
const CLOSING_POLL_MS = 20;

/**
 * Drops one test database with everything in it. Any other name is refused before a command is sent.
 * pg's pool.end() resolves before its connections have left the server, and `with (force)`
 * would terminate them (57P01): their error then ends the run as an unhandled error although
 * every test passed. So the drop first waits, up to 5 s, until no connection to the database is
 * left; only one still open after that (a crashed run's leftover) is forced off.
 */
export async function dropTestDatabase(serverUrl: string, name: string): Promise<void> {
  refuseUnlessTestDatabase(name);
  await onServer(serverUrl, async (client) => {
    for (let waited = 0; waited < CLOSING_WAIT_MS; waited += CLOSING_POLL_MS) {
      const open = await client.query<{ count: number }>(
        "select count(*)::int as count from pg_stat_activity where datname = $1",
        [name],
      );
      if ((open.rows[0]?.count ?? 0) === 0) break;
      await new Promise((resolve) => setTimeout(resolve, CLOSING_POLL_MS));
    }
    await client.query(`drop database if exists "${name}" with (force)`);
  });
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
