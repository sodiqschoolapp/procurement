import { afterAll, afterEach, inject } from "vitest";

import { resetClock } from "./clock";
import { TEST_BUCKET, testStorageEnv } from "./local-storage";
import { createTestDatabase, dropTestDatabase } from "./test-database";

// Runs before each `db` test file, before the file's own imports.
// The file gets a new database, and DATABASE_URL points at it, so the file uses the real client
// of src/server/db/client.ts with nothing mocked.

const serverUrl = inject("databaseServerUrl");
const database = await createTestDatabase(serverUrl, { fromTemplate: true });

process.env.DATABASE_URL = database.url;
// The storage of docker-compose.yml, in the tests' own bucket (plan of 0.12, review correction 1).
Object.assign(process.env, testStorageEnv(TEST_BUCKET));

// A clock fixed by one test never leaks into the next.
afterEach(() => {
  resetClock();
});

afterAll(async () => {
  // The login library has a pool of its own (src/server/auth/auth.ts), made on first use; it
  // closes first. A file that never signed in does not load the library just to close it.
  if ("procurementAuth" in globalThis) {
    const { closeAuth } = await import("@/server/auth/auth");
    await closeAuth();
  }
  const { closeDatabase } = await import("@/server/db/client");
  await closeDatabase();
  await dropTestDatabase(serverUrl, database.name);
});
