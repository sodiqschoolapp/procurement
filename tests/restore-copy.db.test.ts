import { readFile } from "node:fs/promises";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { afterAll, describe, expect, inject, it } from "vitest";

import { applyMigrations } from "../scripts/apply-migrations.mjs";
import { backupStorageConfigOf, ensureBucket, s3ClientOf } from "../scripts/ensure-bucket.mjs";
import { restoreCopy } from "../scripts/restore-copy.mjs";
import { TEST_BUCKET, testStorageEnv } from "./helpers/local-storage";
import {
  TEST_DATABASE_PREFIX,
  addressOf,
  createTestDatabase,
  dropTestDatabase,
  testDatabaseExists,
} from "./helpers/test-database";

// The restore of a weekly copy (build-plan 9.6: "the newest weekly copy from `ombor-copies`
// restored the same way", "into a new, empty database, never over the live one"; 13-technology.md
// Running it; 16-build-order.md phase 8 row; plan of 9.6, decided items 1, 5 and 7). Against the
// local SeaweedFS of the tests, in buckets of this file's own, with the test's restore in place of
// pg_restore (as databaseCopy()'s `dump` is replaced in 8.2): the real pg_restore 17 is the image's,
// run by hand (the report). No line may hold the endpoint or a key (CLAUDE.md, secrets convention).

const serverUrl = inject("databaseServerUrl");
const made: string[] = [];

afterAll(async () => {
  for (const name of made) await dropTestDatabase(serverUrl, name);
}, 60_000);

/** The storage env with a bucket of copies of its own, made if missing. */
async function storageWith(bucket: string): Promise<Record<string, string>> {
  const env = { ...testStorageEnv(TEST_BUCKET), BACKUP_S3_BUCKET: bucket };
  await ensureBucket(backupStorageConfigOf(env));
  return env;
}

async function put(env: Record<string, string>, key: string, body: string): Promise<void> {
  const client = s3ClientOf(backupStorageConfigOf(env));
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: env.BACKUP_S3_BUCKET,
        Key: key,
        Body: Buffer.from(body, "latin1"),
      }),
    );
  } finally {
    client.destroy();
  }
}

/** The app's database: a test database of its own, as `defaultdb` is on the live cluster. */
async function appDatabase(): Promise<{ name: string; url: string }> {
  const database = await createTestDatabase(serverUrl, { fromTemplate: true });
  made.push(database.name);
  return database;
}

/** A name for the new database that the helpers may drop afterwards. */
function newName(): string {
  const name = `${TEST_DATABASE_PREFIX}drill${Math.random().toString(36).slice(2, 10)}`;
  made.push(name);
  return name;
}

/** No line names the storage's endpoint or keys, nor the database's address or password. */
function holdsNoValue(line: string, env: Record<string, string | undefined>): void {
  const values = [
    env.S3_ENDPOINT,
    env.S3_ACCESS_KEY_ID,
    env.S3_SECRET_ACCESS_KEY,
    env.DATABASE_URL,
  ];
  if (env.DATABASE_URL) {
    const password = decodeURIComponent(new URL(env.DATABASE_URL).password);
    if (password) values.push(password);
  }
  for (const value of values) if (value) expect(line).not.toContain(value);
}

/** restoreCopy(), with every line it gives checked for values (permission review, should fix 1). */
async function checked(...args: Parameters<typeof restoreCopy>): ReturnType<typeof restoreCopy> {
  const result = await restoreCopy(...args);
  holdsNoValue(result.line, args[0]);
  return result;
}

const COPIES = "procurement-test-restore";
const EMPTY = "procurement-test-restore-empty";
const OLDER = "backups/database-2031-06-15.dump";
const NEWEST = "backups/database-2031-06-22.dump";

describe("restoreCopy (build-plan 9.6; 16 phase 8 row: into a new, empty database)", () => {
  it("restores the newest copy into a new database and counts it", async () => {
    const storage = await storageWith(COPIES);
    await put(storage, OLDER, "PGDMP invented older copy");
    await put(storage, NEWEST, "PGDMP invented newest copy");
    await put(storage, "backups/notes.txt", "PGDMP not a copy");
    const app = await appDatabase();
    const name = newName();
    const env = { ...storage, DATABASE_URL: app.url, PATH: process.env.PATH ?? "" };
    const seen: { name: string; bytes: string; env: Record<string, string | undefined> }[] = [];

    const result = await checked(env, name, undefined, {
      async restore(given, target, file) {
        seen.push({ name: target, bytes: (await readFile(file)).toString("latin1"), env: given });
        // What pg_restore would leave: the app's tables, here from the migrations.
        await applyMigrations(addressOf(serverUrl, target));
      },
    });

    expect(result.line).toBe(`restore ok ${NEWEST} into database "${name}"`);
    expect(result.ok && result.counts).toMatchObject({ orders: 0, users: 0, stockLines: 0 });
    expect(seen).toEqual([{ name, bytes: "PGDMP invented newest copy", env }]);
    expect(await testDatabaseExists(serverUrl, name)).toBe(true);
  });

  it("restores the copy named, when one is given (decided item 5)", async () => {
    const storage = await storageWith(COPIES);
    await put(storage, OLDER, "PGDMP invented older copy");
    const app = await appDatabase();
    const name = newName();
    let bytes = "";

    const result = await checked({ ...storage, DATABASE_URL: app.url }, name, OLDER, {
      async restore(_env, target, file) {
        bytes = (await readFile(file)).toString("latin1");
        await applyMigrations(addressOf(serverUrl, target));
      },
    });

    expect(result.line).toBe(`restore ok ${OLDER} into database "${name}"`);
    expect(bytes).toBe("PGDMP invented older copy");
  });

  it("refuses a database that already exists, the app's own included, creating nothing (decided item 1)", async () => {
    const storage = await storageWith(COPIES);
    await put(storage, NEWEST, "PGDMP invented newest copy");
    const app = await appDatabase();
    const other = await appDatabase();
    let restored = false;
    const restore = async () => {
      restored = true;
    };

    const own = await checked({ ...storage, DATABASE_URL: app.url }, app.name, undefined, {
      restore,
    });
    const existing = await checked({ ...storage, DATABASE_URL: app.url }, other.name, undefined, {
      restore,
    });

    expect(own.line).toMatch(/^Refused: ".*" is the app's database .*Nothing was written\.$/);
    expect(existing.line).toBe(
      `Refused: database "${other.name}" already exists; a copy is restored only into a new database. Nothing was written.`,
    );
    expect(restored).toBe(false);
  });

  it("refuses before creating any database when the bucket holds no copy, or not the one named", async () => {
    const empty = await storageWith(EMPTY);
    const storage = await storageWith(COPIES);
    await put(storage, NEWEST, "PGDMP invented newest copy");
    const app = await appDatabase();
    const name = newName();

    const none = await checked({ ...empty, DATABASE_URL: app.url }, name);
    const missing = await checked(
      { ...storage, DATABASE_URL: app.url },
      name,
      "backups/database-2001-01-01.dump",
    );

    expect(none.line).toBe("Refused: no copy is in the bucket of the copies. Nothing was written.");
    expect(missing.line).toBe(
      'Refused: the copy "backups/database-2001-01-01.dump" is not in the bucket of the copies. Nothing was written.',
    );
    expect(await testDatabaseExists(serverUrl, name)).toBe(false);
  });

  it("refuses a file that is not a custom-format dump, creating nothing", async () => {
    const storage = await storageWith(`${COPIES}-bad`);
    const key = "backups/database-2031-06-29.dump";
    await put(storage, key, "not a dump");
    const app = await appDatabase();
    const name = newName();

    const result = await checked({ ...storage, DATABASE_URL: app.url }, name, key);

    expect(result.line).toBe(
      `Refused: "${key}" is not a pg_dump custom-format file. Nothing was written.`,
    );
    expect(await testDatabaseExists(serverUrl, name)).toBe(false);
  });

  it("a failed pg_restore says the new database was made and is to be deleted, and touches no other", async () => {
    const storage = await storageWith(COPIES);
    await put(storage, NEWEST, "PGDMP invented newest copy");
    const app = await appDatabase();
    const name = newName();

    const result = await checked({ ...storage, DATABASE_URL: app.url }, name, undefined, {
      async restore() {
        throw new Error("pg_restore ended with code 1");
      },
    });

    expect(result).toEqual({
      ok: false,
      line:
        `restore failed: pg_restore ended with code 1. Database "${name}" was created and is left ` +
        "as it is: delete it in the dashboard (docs/restore.md).",
    });
    expect(await testDatabaseExists(serverUrl, app.name)).toBe(true);
  });

  it("names a missing BACKUP_S3_* variable, and never its value", async () => {
    const storage = await storageWith(COPIES);
    const app = await appDatabase();
    const name = newName();
    const env: Record<string, string | undefined> = { ...storage, DATABASE_URL: app.url };
    delete env.BACKUP_S3_SECRET_ACCESS_KEY;

    const result = await checked(env, name);

    expect(result.line).toBe("restore failed: BACKUP_S3_SECRET_ACCESS_KEY is not set.");
    expect(await testDatabaseExists(serverUrl, name)).toBe(false);
  });
});
