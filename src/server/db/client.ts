import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

// The one database client of the app. Server code imports `db` from here and from nowhere else.

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // The message names the variable and never shows a value.
  throw new Error(
    'DATABASE_URL is not set. Put it into the local .env file (README.md, "Run it").',
  );
}

function createPool(): Pool {
  return new Pool({
    connectionString,
    max: 10,
    // Every connection speaks UTC, whatever the server's default is
    // (developer-rules.md rule 10: "Timestamps are stored in UTC").
    options: "-c timezone=UTC",
  });
}

// `next dev` loads this file again on every save. Without this, each save would open a new pool
// and the old connections would stay open until PostgreSQL has none left.
const keptAcrossReloads = globalThis as typeof globalThis & { procurementDatabasePool?: Pool };

const pool = keptAcrossReloads.procurementDatabasePool ?? createPool();

if (process.env.NODE_ENV === "development") {
  keptAcrossReloads.procurementDatabasePool = pool;
}

export const db = drizzle({ client: pool, schema });

/** Closes every connection. For scripts and tests that must end; the running app never calls it. */
export async function closeDatabase(): Promise<void> {
  if (keptAcrossReloads.procurementDatabasePool === pool) {
    delete keptAcrossReloads.procurementDatabasePool;
  }
  await pool.end();
}
