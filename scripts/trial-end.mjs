// The core of `npm run trial:reset`, the end of the live app's trial (build-plan 9.4; D52). The
// command line is scripts/trial-reset.mjs. Plain .mjs, so the image's console runs it with Node.js
// alone. The seed reads `trialHasEnded()` too (plan of 9.4, decided item 3).
import pg from "pg";

import { connectionOptions } from "../src/server/db/connection-options.mjs";
import { applyMigrations, databaseTarget } from "./apply-migrations.mjs";
import { FIRST_HEAD_LOCK } from "./first-head.mjs";

/**
 * Whether the database records the end of the trial (the one row of `trial_end`, migration 0053).
 * @param {(text: string, values?: unknown[]) => Promise<import("pg").QueryResult>} query
 * @returns {Promise<boolean>}
 */
export async function trialHasEnded(query) {
  const found = await query("select 1 from trial_end");
  return (found.rowCount ?? 0) > 0;
}

/**
 * Empties the database of `connectionString` and records that the trial has ended: the schemas
 * `public` and `drizzle` dropped, the migrations applied from zero, then the one row of
 * `trial_end`. Refuses, writing nothing, when `typed` (trimmed) is not exactly the database's name,
 * and once the database records the end of the trial (build-plan 9.4).
 *
 * The whole run holds the session-level advisory lock `FIRST_HEAD_LOCK`, which `seed()` and
 * `createFirstHead()` take first: neither can write between the drops and the record, and two
 * resets take turns (plan of 9.4, decided item 5; review of the plan, Must fix 1). The drops are
 * one transaction; the migrations are the deploy's own code, in their own transaction; a failure
 * between leaves an empty database without the record, and the reset can simply run again.
 * @param {string} connectionString
 * @param {string} typed the confirmation typed at the prompt
 * @param {Date} moment the time of the record, from the caller (CLAUDE.md rule 10)
 * @returns {Promise<{ database: string, migrations: number }>}
 */
export async function endTrial(connectionString, typed, moment) {
  const { database } = databaseTarget(connectionString);
  if (typeof typed !== "string" || typed.trim() !== database) {
    throw new Error(
      `Refused: the confirmation is not the database's name "${database}". Nothing was written.`,
    );
  }

  const client = new pg.Client({
    ...connectionOptions(connectionString, process.env.DATABASE_CA_CERT),
    options: "-c timezone=UTC",
  });
  await client.connect();
  try {
    await client.query("select pg_advisory_lock($1, 0)", [FIRST_HEAD_LOCK]);
    // A database migrated before 0053 has no table yet: it records nothing.
    const table = await client.query("select to_regclass('public.trial_end') as found");
    const query = (text, values) => client.query(text, values);
    if (table.rows[0].found !== null && (await trialHasEnded(query))) {
      throw new Error(
        `Refused: the trial of database "${database}" has already ended; ` +
          "it may hold the real data. Nothing was written.",
      );
    }

    await client.query("begin");
    try {
      await client.query("drop schema if exists drizzle cascade");
      await client.query("drop schema public cascade");
      await client.query("create schema public");
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }

    const applied = await applyMigrations(connectionString);
    await client.query("insert into trial_end (ended_at) values ($1)", [moment]);
    return { database, migrations: applied.length };
  } finally {
    // Ending the session releases the advisory lock.
    await client.end();
  }
}
