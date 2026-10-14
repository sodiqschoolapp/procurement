import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

import pg from "pg";

import { insertPasswordUser } from "../../src/server/auth/password-user.mjs";
import { connectionOptions } from "../../src/server/db/connection-options.mjs";
import { E2E_BUCKET, testStorageEnv } from "../helpers/local-storage";

// The browser tests' own database, `procurement_e2e`, on the server of DATABASE_URL (plan of
// 0.10b, decision 14): created when missing, migrated, and given invented branches and one
// invented person per role (CLAUDE.md, Conventions: no real person). The dev database keeps no
// Head from the tests, so `npm run user:first-head` keeps working there. playwright.config.ts
// starts the app against this database.

export const E2E_DATABASE = "procurement_e2e";

const PASSWORD = "invented-e2e-password";

export const E2E_BRANCHES = [
  { code: "EA", name: "Sinov filiali A" },
  { code: "EB", name: "Sinov filiali B" },
  { code: "EC", name: "Sinov filiali C" },
] as const;

type E2eUser = {
  fullName: string;
  username: string;
  phone: string;
  role: "HEAD" | "MANAGER" | "PRINCIPAL" | "FINANCE";
  password: string;
  branches: readonly string[];
};

/** The sign-in tests' Manager (task 0.6), now in branch EA. */
export const E2E_USER = {
  fullName: "Kamola Sinovova",
  username: "e2e_manager",
  phone: "+998 90 000 99 01",
  role: "MANAGER",
  password: PASSWORD,
  branches: ["EA"],
} as const satisfies E2eUser;

/** One person per role (11-screens-and-ux.md, Interface per role). */
export const E2E_ROLES = {
  MANAGER: E2E_USER,
  HEAD: {
    fullName: "Botir Sinovov",
    username: "e2e_head",
    phone: "+998 90 000 99 02",
    role: "HEAD",
    password: PASSWORD,
    branches: [],
  },
  PRINCIPAL: {
    fullName: "Dilnoza Sinovova",
    username: "e2e_principal",
    phone: "+998 90 000 99 03",
    role: "PRINCIPAL",
    password: PASSWORD,
    branches: ["EA"],
  },
  FINANCE: {
    fullName: "Jasur Sinovov",
    username: "e2e_finance",
    phone: "+998 90 000 99 04",
    role: "FINANCE",
    password: PASSWORD,
    branches: ["EA", "EB"],
  },
} as const satisfies Record<string, E2eUser>;

/** One Manager per project for the language test, so a changed language reaches no other test. */
export const E2E_LANGUAGE_USERS = {
  "phone-375": {
    fullName: "Laylo Sinovova",
    username: "e2e_language_phone",
    phone: "+998 90 000 99 05",
    role: "MANAGER",
    password: PASSWORD,
    branches: ["EA"],
  },
  "desktop-1440": {
    fullName: "Nodir Sinovov",
    username: "e2e_language_desktop",
    phone: "+998 90 000 99 06",
    role: "MANAGER",
    password: PASSWORD,
    branches: ["EA"],
  },
} as const satisfies Record<string, E2eUser>;

// A fixed invented moment: the rows' time does not matter to any browser test.
/**
 * One Head per project for the notifications test (plan of 0.11, review of the plan, Must fix 2):
 * the projects run in parallel, and one person's count would be changed by the other's run.
 */
export const E2E_NOTIFICATION_USERS = {
  "phone-375": {
    fullName: "Malika Sinovova",
    username: "e2e_notify_phone",
    phone: "+998 90 000 99 07",
    role: "HEAD",
    password: PASSWORD,
    branches: [],
  },
  "desktop-1440": {
    fullName: "Sardor Sinovov",
    username: "e2e_notify_desktop",
    phone: "+998 90 000 99 08",
    role: "HEAD",
    password: PASSWORD,
    branches: [],
  },
} as const satisfies Record<string, E2eUser>;

const CREATED_AT = new Date("2026-10-01T00:00:00Z");

/** The same server, the e2e database. */
export function e2eDatabaseUrl(serverUrl: string): string {
  if (!URL.canParse(serverUrl)) throw new Error("DATABASE_URL is not a valid database address.");
  const url = new URL(serverUrl);
  url.pathname = `/${E2E_DATABASE}`;
  return url.toString();
}

/** DATABASE_URL of the environment or the local .env (README.md, "Run it"). */
export function serverDatabaseUrl(): string {
  if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");
  const address = process.env.DATABASE_URL;
  if (!address) {
    throw new Error(
      'DATABASE_URL is not set. Put it into the local .env file (README.md, "Run it").',
    );
  }
  return address;
}

async function createDatabaseIfMissing(serverUrl: string): Promise<void> {
  const client = new pg.Client(connectionOptions(serverUrl, process.env.DATABASE_CA_CERT));
  await client.connect();
  try {
    const found = await client.query("select 1 from pg_database where datname = $1", [
      E2E_DATABASE,
    ]);
    if (found.rowCount === 0) await client.query(`create database "${E2E_DATABASE}"`);
  } finally {
    await client.end();
  }
}

async function insertUserIfMissing(
  client: pg.Client,
  user: E2eUser,
  branchIds: Map<string, string>,
): Promise<void> {
  const found = await client.query("select 1 from users where username = $1", [user.username]);
  if (found.rowCount !== 0) return;
  // The Principal's one branch is checked at commit (migration 0002): one transaction.
  await client.query("begin");
  try {
    const { id } = await insertPasswordUser(
      (text, values) => client.query(text, values),
      { ...user, isActive: true },
      user.password,
      CREATED_AT,
    );
    for (const code of user.branches) {
      await client.query(
        `insert into user_branches (user_id, branch_id, user_role, user_is_active, created_at)
         values ($1, $2, $3, true, $4)`,
        [id, branchIds.get(code), user.role, CREATED_AT],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export default async function globalSetup(): Promise<void> {
  // The e2e server's own bucket on the storage of docker-compose.yml (plan of 0.12, review
  // correction 1), by the same script as `npm run storage:bucket`, in its own process as below.
  execFileSync(process.execPath, ["scripts/storage-bucket.mjs"], {
    env: { ...process.env, ...testStorageEnv(E2E_BUCKET) },
    stdio: "inherit",
  });

  const serverUrl = serverDatabaseUrl();
  await createDatabaseIfMissing(serverUrl);
  const address = e2eDatabaseUrl(serverUrl);
  // The same migration script as `npm run db:migrate`, in its own process: Playwright loads this
  // file as CommonJS, which cannot import a module that reads import.meta.
  execFileSync(process.execPath, ["scripts/db-migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: address },
    stdio: "inherit",
  });

  const client = new pg.Client(connectionOptions(address, process.env.DATABASE_CA_CERT));
  await client.connect();
  try {
    const branchIds = new Map<string, string>();
    for (const branch of E2E_BRANCHES) {
      const { rows } = await client.query<{ id: string }>(
        `insert into branches (name, code, address, is_active, created_at)
         values ($1, $2, 'Sinov ko''chasi 1', true, $3)
         on conflict (code) do update set name = excluded.name
         returning id`,
        [branch.name, branch.code, CREATED_AT],
      );
      branchIds.set(branch.code, rows[0]!.id);
    }
    for (const user of [
      ...Object.values(E2E_ROLES),
      ...Object.values(E2E_LANGUAGE_USERS),
      ...Object.values(E2E_NOTIFICATION_USERS),
    ]) {
      await insertUserIfMissing(client, user, branchIds);
    }
    // Every run starts in Uzbek, whatever an earlier run chose (A2: Uzbek is the default).
    await client.query("update users set locale = 'uz' where username like 'e2e\\_%'");
  } finally {
    await client.end();
  }
}
