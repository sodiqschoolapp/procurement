import { existsSync } from "node:fs";

import type { TestProject } from "vitest/node";

import { applyMigrations } from "../../scripts/apply-migrations.mjs";
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
  if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");

  const serverUrl = process.env.DATABASE_URL;
  if (!serverUrl) {
    throw new Error(
      'DATABASE_URL is not set. Put it into the local .env file (README.md, "Run it"). ' +
        "The database tests need it to find the PostgreSQL server; they never touch that database itself.",
    );
  }

  await assertServerAnswers(serverUrl);

  for (const leftover of await listTestDatabases(serverUrl)) {
    await dropTestDatabase(serverUrl, leftover);
  }

  const template = await createTestDatabase(serverUrl, {
    name: TEMPLATE_DATABASE,
    fromTemplate: false,
  });
  await applyMigrations(template.url);

  project.provide("databaseServerUrl", serverUrl);

  return async () => {
    await dropTestDatabase(serverUrl, TEMPLATE_DATABASE);
  };
}
