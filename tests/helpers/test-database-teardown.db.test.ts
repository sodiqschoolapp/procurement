import { Pool } from "pg";
import { describe, expect, inject, it } from "vitest";

import { createTestDatabase, dropTestDatabase } from "./test-database";

// build-plan 0.2: every test file's database is dropped at its end (tests/helpers/db-file-setup.ts:
// closeDatabase, then dropTestDatabase). pg's pool.end() resolves before its connections have
// closed on the server; a drop `with (force)` at that moment terminates them (57P01), and the
// error of such a connection ends the test run as an unhandled error although every test passed
// (CI of pull request #14, src/server/db/client.db.test.ts). The drop waits for them to leave.

const serverUrl = inject("databaseServerUrl");

describe("dropping a test database right after its pool ends (build-plan 0.2)", () => {
  it("does not terminate connections that are still closing", { timeout: 60_000 }, async () => {
    for (let round = 0; round < 10; round += 1) {
      const database = await createTestDatabase(serverUrl, { fromTemplate: true });
      const pool = new Pool({ connectionString: database.url, max: 10 });
      const errors: unknown[] = [];
      pool.on("connect", (client) => client.on("error", (error) => errors.push(error)));

      await Promise.all(Array.from({ length: 10 }, () => pool.query("select pg_sleep(0.02)")));
      await pool.end();
      await dropTestDatabase(serverUrl, database.name);
      // A terminated connection reports its error on the next turns of the event loop.
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(errors).toEqual([]);
    }
  });
});
