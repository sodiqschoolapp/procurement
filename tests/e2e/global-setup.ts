import { existsSync } from "node:fs";

import pg from "pg";

import { insertPasswordUser } from "../../src/server/auth/password-user.mjs";
import { connectionOptions } from "../../src/server/db/connection-options.mjs";

// The invented user the browser tests sign in with (build-plan 0.6, Done when: "open a deep
// link signed out, sign in, land on that page"). Written into the local database once, only if
// missing; no real person (CLAUDE.md, Conventions). A Manager, not a Head, so `npm run
// user:first-head` still works on the same database (spec review of 0.6).

export const E2E_USER = {
  fullName: "Kamola Sinovova",
  username: "e2e_manager",
  phone: "+998 90 000 99 01",
  role: "MANAGER",
  password: "invented-e2e-password",
} as const;

// A fixed invented moment: the row's time does not matter to any browser test.
const CREATED_AT = new Date("2026-10-01T00:00:00Z");

export default async function globalSetup(): Promise<void> {
  if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");
  const address = process.env.DATABASE_URL;
  if (!address)
    throw new Error(
      'DATABASE_URL is not set. Put it into the local .env file (README.md, "Run it").',
    );

  const client = new pg.Client(connectionOptions(address, process.env.DATABASE_CA_CERT));
  await client.connect();
  try {
    const found = await client.query("select 1 from users where username = $1", [
      E2E_USER.username,
    ]);
    if (found.rowCount === 0) {
      await insertPasswordUser(
        (text, values) => client.query(text, values),
        E2E_USER,
        E2E_USER.password,
        CREATED_AT,
      );
    }
  } finally {
    await client.end();
  }
}
