// The restore of a weekly copy (build-plan 9.6; 16-build-order.md, phase 8 row: "restore
// yesterday's copy of the database into a new, empty database"; 13-technology.md, Running it).
// `npm run db:restore -- <new database> [<copy key>]` (scripts/db-restore.mjs), in the console of
// the app's component `web` (docs/restore.md). Plain .mjs, so the image runs it with production
// packages only (0.16).
//
// It restores only into a database that does not exist yet, on the server of DATABASE_URL, and
// refuses the app's own database and PostgreSQL's own ones before anything is written: "never over
// the live one" (build-plan 9.6; plan of 9.6, decided item 1, Look first). It creates that one
// database and never drops anything. The copy comes from the bucket of the copies (BACKUP_S3_*,
// 8.2b); `pg_restore` 17 of the image reads it, the address as PG* variables, never as an
// argument (pgDumpEnv() of 8.2). It prints one line that names a variable or an error kind, never
// a value.
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import pg from "pg";

import { connectionOptions } from "../src/server/db/connection-options.mjs";
import { databaseTarget, failureReason } from "./apply-migrations.mjs";
import { COPY_PREFIX, pgDumpEnv } from "./db-copy.mjs";
import { backupStorageConfigOf, s3ClientOf } from "./ensure-bucket.mjs";
import { countTarget, isDatabaseName, readCounts, withDatabase } from "./restore-counts.mjs";

/** PostgreSQL's own databases and DigitalOcean's database of the app (docs/deploy.md). */
export const RESERVED_DATABASES = ["defaultdb", "postgres", "template0", "template1"];

/** The key of a copy, as copyKeyOf() of 8.2 writes it. */
const COPY_KEY = /^backups\/database-(\d{4}-\d{2}-\d{2})\.dump$/;

/** The first bytes of every custom-format dump. */
const DUMP_MAGIC = "PGDMP";

/**
 * Refuses a target that is not a new database of its own (plan of 9.6, decided item 1).
 * @param {unknown} name the database to restore into
 * @param {string} appDatabase the name in DATABASE_URL
 */
export function refuseTarget(name, appDatabase) {
  if (!isDatabaseName(name)) {
    throw new Error(
      `Refused: "${String(name)}" is not a plain lower-case database name, such as drill_20261019. Nothing was written.`,
    );
  }
  if (name === appDatabase || RESERVED_DATABASES.includes(name)) {
    throw new Error(
      `Refused: "${name}" is the app's database or one of PostgreSQL's own; a copy is restored only into a new database. Nothing was written.`,
    );
  }
}

/**
 * The newest copy of a listing, by the date in its name; null when there is none.
 * @param {string[]} keys
 */
export function newestCopyKey(keys) {
  const copies = keys.filter((key) => COPY_KEY.test(key)).sort();
  return copies.at(-1) ?? null;
}

/** The arguments of `pg_restore`, before the database name and the file (decided item 7). */
export const PG_RESTORE_ARGS = [
  "--no-owner",
  "--no-privileges",
  "--exit-on-error",
  "--no-password",
];

/**
 * The environment of `pg_restore` for the new database: PG* variables of DATABASE_URL with only
 * the database name replaced, never an argument.
 * @param {Record<string, string | undefined>} env
 * @param {string} name
 * @param {string | null} caFile
 */
export function restoreEnv(env, name, caFile) {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  return pgDumpEnv({ ...env, DATABASE_URL: withDatabase(env.DATABASE_URL, name) }, caFile);
}

/**
 * Runs `pg_restore` 17 of `file` into the database `name`.
 * @param {Record<string, string | undefined>} env
 * @param {string} name
 * @param {string} file
 */
export async function runPgRestore(env, name, file) {
  const folder = env.DATABASE_CA_CERT ? await mkdtemp(join(tmpdir(), "db-restore-ca-")) : null;
  try {
    let caFile = null;
    if (folder) {
      caFile = join(folder, "ca.crt");
      await writeFile(caFile, env.DATABASE_CA_CERT, { mode: 0o600 });
    }
    const childEnv = restoreEnv(env, name, caFile);
    await new Promise((resolve, reject) => {
      const child = spawn("pg_restore", [...PG_RESTORE_ARGS, `--dbname=${name}`, file], {
        env: childEnv,
        stdio: ["ignore", "ignore", "ignore"],
      });
      child.on("error", (error) =>
        reject(new Error(`pg_restore did not start (${error.code ?? error.name})`)),
      );
      // pg_restore's own message can name the server; only its exit code is told.
      child.on("close", (code) => {
        if (code === 0) resolve(undefined);
        else reject(new Error(`pg_restore ended with code ${code}`));
      });
    });
  } finally {
    if (folder) await rm(folder, { recursive: true, force: true });
  }
}

/** The error's kind and HTTP status: an SDK message can name the bucket or the endpoint. */
function kindOf(error) {
  const status = error?.$metadata?.httpStatusCode;
  const name = error instanceof Error ? error.name : "Error";
  return status ? `${name} (HTTP ${status})` : name;
}

/** Every key under backups/ of the bucket of the copies. */
async function listCopies(client, bucket) {
  const keys = [];
  let token;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: COPY_PREFIX, ContinuationToken: token }),
    );
    for (const item of page.Contents ?? []) if (item.Key) keys.push(item.Key);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

/**
 * @typedef {{ ok: true, key: string, line: string, counts: import("./restore-counts.mjs").Counts }
 *   | { ok: false, line: string }} RestoreResult
 */

/** @param {string} line @returns {RestoreResult} */
const failed = (line) => ({ ok: false, line });

/**
 * Restores one weekly copy into the new database `name`.
 * @param {Record<string, string | undefined>} env where DATABASE_URL, DATABASE_CA_CERT, S3_ENDPOINT, S3_REGION and BACKUP_S3_* are read
 * @param {string} name the new database
 * @param {string} [key] the copy; the newest when not given
 * @param {{ restore?: typeof runPgRestore }} [options] `restore` replaces pg_restore, for the tests
 * @returns {Promise<RestoreResult>} `line` is "restore ok …", "Refused: …" or "restore failed: …"
 */
export async function restoreCopy(env, name, key, options = {}) {
  if (!env.DATABASE_URL) return failed("restore failed: DATABASE_URL is not set.");
  let appDatabase;
  try {
    appDatabase = databaseTarget(env.DATABASE_URL).database;
    refuseTarget(name, appDatabase);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failed(message.startsWith("Refused:") ? message : `restore failed: ${message}`);
  }
  if (key !== undefined && !COPY_KEY.test(key)) {
    return failed(
      `Refused: "${key}" is not the key of a copy, such as backups/database-2026-10-18.dump. Nothing was written.`,
    );
  }
  let config;
  try {
    config = backupStorageConfigOf(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const missing = /^((?:BACKUP_)?S3_[A-Z_]+) is not set\./.exec(message);
    return failed(`restore failed: ${missing ? `${missing[1]} is not set.` : message}`);
  }

  // The app's own server, verified as the app's pool is (connection-options.mjs).
  const server = new pg.Client(connectionOptions(env.DATABASE_URL, env.DATABASE_CA_CERT));
  const storage = s3ClientOf(config);
  const folder = await mkdtemp(join(tmpdir(), "db-restore-"));
  let created = false;
  try {
    await server.connect();
    const exists = await server.query("select 1 from pg_database where datname = $1", [name]);
    if ((exists.rowCount ?? 0) > 0) {
      return failed(
        `Refused: database "${name}" already exists; a copy is restored only into a new database. Nothing was written.`,
      );
    }

    let chosen;
    let bytes;
    try {
      const keys = await listCopies(storage, config.bucket);
      chosen = key ?? newestCopyKey(keys);
      if (!chosen || !keys.includes(chosen)) {
        return failed(
          `Refused: ${key ? `the copy "${key}" is not` : "no copy is"} in the bucket of the copies. Nothing was written.`,
        );
      }
      const found = await storage.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: chosen }),
      );
      bytes = found.Body
        ? new Uint8Array(await found.Body.transformToByteArray())
        : new Uint8Array();
    } catch (error) {
      return failed(`restore failed: ${kindOf(error)}.`);
    }
    if (Buffer.from(bytes.subarray(0, DUMP_MAGIC.length)).toString("latin1") !== DUMP_MAGIC) {
      return failed(
        `Refused: "${chosen}" is not a pg_dump custom-format file. Nothing was written.`,
      );
    }
    const file = join(folder, "copy.dump");
    await writeFile(file, bytes, { mode: 0o600 });

    // The name passed refuseTarget(), so it holds nothing that could end the quoted identifier.
    await server.query(`create database "${name}"`);
    created = true;
    await (options.restore ?? runPgRestore)(env, name, file);
    const counts = await readCounts(countTarget(env, { database: name }), null);
    return { ok: true, key: chosen, counts, line: `restore ok ${chosen} into database "${name}"` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // pg_restore's own lines, the storage's kind, or PostgreSQL's reason (as db:migrate tells it).
    const known = /^pg_restore /.test(message)
      ? message
      : error?.$metadata
        ? kindOf(error)
        : failureReason(error);
    const left = created
      ? ` Database "${name}" was created and is left as it is: delete it in the dashboard (docs/restore.md).`
      : "";
    return failed(`restore failed: ${known}.${left}`);
  } finally {
    storage.destroy();
    await server.end().catch(() => undefined);
    await rm(folder, { recursive: true, force: true });
  }
}
