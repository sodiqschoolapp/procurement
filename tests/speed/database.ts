import { existsSync } from "node:fs";

// The address of the speed database (plan of 9.2, What will exist 1): `procurement_speed` on the
// server of DATABASE_URL, which must be the PostgreSQL of docker-compose.yml.

export const SPEED_DATABASE = "procurement_speed";

/** DATABASE_URL of the environment or the local .env (README.md, "Run it"). */
export function serverUrl(): string {
  if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");
  const address = process.env.DATABASE_URL;
  if (!address) {
    throw new Error(
      'DATABASE_URL is not set. Put it into the local .env file (README.md, "Run it").',
    );
  }
  return address;
}

/** The same server, another database (as addressOf() of tests/helpers/test-database.ts, which
 * Playwright's CommonJS loader cannot import: it reads import.meta). */
export function databaseUrl(server: string, database: string): string {
  if (!URL.canParse(server)) throw new Error("DATABASE_URL is not a valid database address.");
  const url = new URL(server);
  url.pathname = `/${database}`;
  return url.toString();
}

export function speedDatabaseUrl(server: string = serverUrl()): string {
  return databaseUrl(server, SPEED_DATABASE);
}
