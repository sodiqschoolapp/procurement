import { afterAll, afterEach, inject } from "vitest";

import { resetClock } from "./clock";
import { createTestDatabase, dropTestDatabase } from "./test-database";

// Runs before each `db` test file, before the file's own imports.
// The file gets a new database, and DATABASE_URL points at it, so the file uses the real client
// of src/server/db/client.ts with nothing mocked.

const serverUrl = inject("databaseServerUrl");
const database = await createTestDatabase(serverUrl, { fromTemplate: true });

process.env.DATABASE_URL = database.url;

// A clock fixed by one test never leaks into the next.
afterEach(() => {
  resetClock();
});

afterAll(async () => {
  const { closeDatabase } = await import("@/server/db/client");
  await closeDatabase();
  await dropTestDatabase(serverUrl, database.name);
});
