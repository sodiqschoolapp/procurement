import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

import type { TestProject } from "vitest/node";

import { applyMigrations } from "../../scripts/apply-migrations.mjs";
import {
  backupStorageConfigOf,
  ensureBucket,
  storageConfigOf,
} from "../../scripts/ensure-bucket.mjs";
import { TEST_BUCKET, testStorageEnv } from "./local-storage";
import {
  TEMPLATE_DATABASE,
  assertServerAnswers,
  createTestDatabase,
  dropTestDatabase,
  listTestDatabases,
} from "./test-database";

// Runs once per `db` test run, before any test file.
// It builds the template database from the migrations, so every run also proves that the
// migrations apply to an empty database.

declare module "vitest" {
  export interface ProvidedContext {
    /** The address of the PostgreSQL server the tests may create their databases on. */
    databaseServerUrl: string;
  }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  // Only this one name is read from .env, and it is not put into the environment: the test
  // files of the `unit` project must never inherit the address of the developer's database.
  const fromFile = existsSync(".env") ? parseEnv(readFileSync(".env", "utf8")).DATABASE_URL : "";
  const serverUrl = process.env.DATABASE_URL || fromFile;
  if (!serverUrl) {
    throw new Error(
      'DATABASE_URL is not set. Put it into the local .env file (README.md, "Run it"). ' +
        "The database tests need it to find the PostgreSQL server; they never touch that database itself.",
    );
  }

  // Before anything is dropped or created: the server answers, and it is the one of
  // docker-compose.yml. Every later step checks the server again by itself.
  await assertServerAnswers(serverUrl);

  for (const leftover of await listTestDatabases(serverUrl)) {
    await dropTestDatabase(serverUrl, leftover);
  }

  const template = await createTestDatabase(serverUrl, {
    name: TEMPLATE_DATABASE,
    fromTemplate: false,
  });
  await applyMigrations(template.url);

  // The bucket of the tests that store files (plan of 0.12, decision 13): made by the setup, never
  // by the app.
  await ensureBucket(storageConfigOf(testStorageEnv(TEST_BUCKET)));
  // The bucket of the weekly copies, of its own (build-plan 8.2b).
  await ensureBucket(backupStorageConfigOf(testStorageEnv(TEST_BUCKET)));

  project.provide("databaseServerUrl", serverUrl);

  return async () => {
    await dropTestDatabase(serverUrl, TEMPLATE_DATABASE);
  };
}
