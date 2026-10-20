import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

import pg from "pg";
import { expect, it } from "vitest";

import { addressOf, refuseUnlessComposeServer } from "../helpers/test-database";
import { SPEED_DATABASE, serverUrl, speedDatabaseUrl } from "./database";
import { SPEED_SIZES, fill } from "./fill";

// The speed database of build plan 9.2 (plan of 9.2, What will exist 1 and 2): created when
// missing, migrated, filled once and kept; SPEED_REFILL=1 drops and rebuilds it. Only the server of
// docker-compose.yml is accepted, so this never writes into a hosted database. After the fill the
// real analytics refresh runs once (its time goes into docs/speed.md, decided item 6) and the real
// nightly stock check must find no mismatch. Every statement on this database is then logged, so
// the measurement can count the statements of each page (What will exist 3).

export const REFRESH_FILE = "test-results/speed-refresh.json";

async function onMaintenance<T>(work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: addressOf(serverUrl(), "postgres") });
  await client.connect();
  try {
    const shown = await client.query<{ cluster_name: string }>("show cluster_name");
    refuseUnlessComposeServer(shown.rows[0]?.cluster_name ?? "");
    return await work(client);
  } finally {
    await client.end();
  }
}

it("the speed database is filled, refreshed and consistent (build plan 9.2)", async () => {
  await onMaintenance(async (client) => {
    if (process.env.SPEED_REFILL === "1") {
      await client.query(`drop database if exists "${SPEED_DATABASE}" with (force)`);
    }
    const found = await client.query("select 1 from pg_database where datname = $1", [
      SPEED_DATABASE,
    ]);
    if (found.rowCount === 0) await client.query(`create database "${SPEED_DATABASE}"`);
  });
  const address = speedDatabaseUrl();
  execFileSync(process.execPath, ["scripts/db-migrate.mjs"], {
    env: { ...process.env, DATABASE_URL: address },
    stdio: "inherit",
  });

  const client = new pg.Client({ connectionString: address, options: "-c timezone=UTC" });
  await client.connect();
  try {
    const { rows } = await client.query<{ n: number }>("select count(*)::int as n from orders");
    if (rows[0]!.n > 0) {
      console.log(`${SPEED_DATABASE} is kept: ${rows[0]!.n} orders (SPEED_REFILL=1 rebuilds it).`);
      return;
    }
    // The statements of the fill are not logged; the measurement's are.
    await client.query(`alter database "${SPEED_DATABASE}" reset log_statement`);
    process.env.DATABASE_URL = address;
    const { now } = await import("@/server/clock");
    const started = Date.now();
    await client.query("begin");
    let counts;
    try {
      counts = await fill((text, values) => client.query(text, values), now(), SPEED_SIZES);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
    console.log(`filled in ${Math.round((Date.now() - started) / 1000)} s:`, counts);
    await client.query("vacuum analyze");

    const { db, closeDatabase } = await import("@/server/db/client");
    const { refreshAnalytics } = await import("@/server/jobs/analytics-refresh");
    const { stockCheck } = await import("@/server/jobs/stock-check");
    try {
      const refreshStarted = Date.now();
      await db.transaction((tx) => refreshAnalytics(tx));
      const refreshMs = Date.now() - refreshStarted;
      mkdirSync("test-results", { recursive: true });
      writeFileSync(REFRESH_FILE, JSON.stringify({ refreshMs, counts }, null, 2));
      console.log(`one analytics refresh: ${refreshMs} ms`);
      await db.transaction((tx) => stockCheck.run({ tx, tick: now() }));
      const told = await client.query<{ n: number }>(
        "select count(*)::int as n from notifications where type = 'STOCK_CHECK_MISMATCH'",
      );
      expect(told.rows[0]!.n).toBe(0);
    } finally {
      await closeDatabase();
    }
    await client.query("vacuum analyze");
  } finally {
    await client.query(`alter database "${SPEED_DATABASE}" set log_statement = 'all'`);
    await client.end();
  }
});
