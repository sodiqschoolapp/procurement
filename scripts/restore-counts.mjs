// The counts of the restore drill (build-plan 9.6; 16-build-order.md, phase 8 row: "restore
// yesterday's copy of the database into a new, empty database"). `npm run db:counts`
// (scripts/db-counts.mjs) and `npm run db:restore` (scripts/db-restore.mjs) print them, so a
// restored copy is "counted against the live one" (Done when; docs/restore.md). Plain .mjs, so the
// image's console runs it with Node.js alone.
//
// The live database keeps working after the copy, so both sides are counted as of one moment
// (plan of 9.6, decided item 3, Look first): the rows created up to it. Orders and users are never
// deleted (one exception: a draft never submitted) and stock movements are append-only (CLAUDE.md
// rules 7 and 11), so these counts are fixed once the moment has passed. The stock lines are
// rebuilt from the movements, the `balance_after` of the last one by `seq` of each branch and item
// (09-warehouse.md), because `stock_balances` changes in place.
import pg from "pg";

import { connectionOptions } from "../src/server/db/connection-options.mjs";

/** A database name the scripts accept: a plain lower-case identifier, never quoted text. */
const DATABASE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * Whether `name` is a database name the restore scripts accept.
 * @param {unknown} name
 */
export function isDatabaseName(name) {
  return typeof name === "string" && DATABASE_NAME.test(name);
}

/**
 * The address of another database on the same server: only the name changes.
 * @param {string} connectionString
 * @param {string} name
 */
export function withDatabase(connectionString, name) {
  // The error of `new URL` can repeat the whole text, password included. This one does not.
  if (!URL.canParse(connectionString)) {
    throw new Error("DATABASE_URL is not a valid database address.");
  }
  const address = new URL(connectionString);
  address.pathname = `/${name}`;
  return address.toString();
}

/**
 * The options of `pg` for the database to count (plan of 9.6, decided item 8): the app's own, one
 * of the same server by name, or an address typed at the prompt. Always through
 * connectionOptions(): with a CA certificate the server is verified against it, whatever the
 * address says; verification is never switched off.
 * @param {Record<string, string | undefined>} env where DATABASE_URL and DATABASE_CA_CERT are read
 * @param {{ database?: string, address?: string, ca?: string }} [target]
 */
export function countTarget(env, target = {}) {
  if (target.address) {
    // A typed address is never read unverified, whatever its own sslmode says (permission review
    // of 9.6, nit 1): without a CA of the app or a pasted one it is refused.
    const ca = target.ca || env.DATABASE_CA_CERT;
    if (!ca) {
      throw new Error(
        "Refused: no CA certificate to verify that server; DATABASE_CA_CERT is not set. Run it again with --ask --own-ca.",
      );
    }
    return connectionOptions(target.address, ca);
  }
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  if (target.database !== undefined) {
    if (!isDatabaseName(target.database)) {
      throw new Error(`Refused: "${target.database}" is not a plain lower-case database name.`);
    }
    return connectionOptions(withDatabase(env.DATABASE_URL, target.database), env.DATABASE_CA_CERT);
  }
  return connectionOptions(env.DATABASE_URL, env.DATABASE_CA_CERT);
}

/**
 * @typedef {{ orders: number, users: number, stockLines: number, stockQty: string,
 *   movements: number, newest: Date | null }} Counts
 */

/**
 * The counts of one database as of `until` (null: everything).
 * @param {(text: string, values?: unknown[]) => Promise<import("pg").QueryResult>} query
 * @param {Date | null} until
 * @returns {Promise<Counts>}
 */
export async function countAt(query, until) {
  const found = await query(
    `with moved as (
       select * from stock_movements where $1::timestamptz is null or created_at <= $1
     ),
     last as (
       select distinct on (branch_id, variant_id) balance_after
       from moved order by branch_id, variant_id, seq desc
     )
     select
       (select count(*)::int from orders where $1::timestamptz is null or created_at <= $1) as orders,
       (select count(*)::int from users where $1::timestamptz is null or created_at <= $1) as users,
       (select count(*)::int from last where balance_after > 0) as stock_lines,
       (select coalesce(sum(balance_after), 0)::numeric(20, 3)::text from last) as stock_qty,
       (select count(*)::int from moved) as movements,
       greatest(
         (select max(created_at) from orders where $1::timestamptz is null or created_at <= $1),
         (select max(created_at) from users where $1::timestamptz is null or created_at <= $1),
         (select max(created_at) from moved)
       ) as newest`,
    [until],
  );
  const row = found.rows[0];
  return {
    orders: row.orders,
    users: row.users,
    stockLines: row.stock_lines,
    stockQty: row.stock_qty,
    movements: row.movements,
    newest: row.newest,
  };
}

/**
 * The one line a person compares between the two sides (docs/restore.md).
 * @param {Counts} counts
 */
export function countsLine(counts) {
  const newest = counts.newest ? counts.newest.toISOString() : "none";
  return (
    `orders ${counts.orders}, users ${counts.users}, ` +
    `stock lines ${counts.stockLines} (quantity ${counts.stockQty}), ` +
    `stock movements ${counts.movements}, newest row ${newest}`
  );
}

/**
 * Counts one database in one read-only snapshot (plan of 9.6, decided item 9), so the live side
 * is counted at one instant while the app writes.
 * @param {ReturnType<typeof countTarget>} options
 * @param {Date | null} until
 * @returns {Promise<Counts>}
 */
export async function readCounts(options, until) {
  const client = new pg.Client({ ...options, options: "-c timezone=UTC" });
  await client.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    const counts = await countAt((text, values) => client.query(text, values), until);
    await client.query("commit");
    return counts;
  } finally {
    await client.end();
  }
}
