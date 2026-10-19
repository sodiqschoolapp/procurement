// The weekly copy of the database (build-plan 8.2; 13-technology.md, Running it: "A weekly copy is
// also saved to R2"). The job `database_copy` of src/server/jobs/database-copy.ts calls
// databaseCopy() every Sunday at 04:00 in Tashkent; `npm run db:copy`, and `node
// scripts/db-copy.mjs` in the console of the test copy's component `web` (docs/deploy.md), make one
// at once. Plain .mjs, so the image runs it with production packages only (0.16).
//
// `pg_dump` 17 of the image (Dockerfile; plan of 8.2, decided item 3, Look first) writes the
// custom format that `pg_restore` reads back whole. The address reaches it through PG* variables,
// never as an argument, so the password is not in the process list (review of the plan, nit 4);
// with DATABASE_CA_CERT the server is verified against it (verify-full), as the app's pool does
// (src/server/db/connection-options.mjs; decided item 10). The file goes to the files bucket under
// backups/ (decided item 4); no route serves that prefix. It prints "copy ok …" or one line
// "copy failed: …" that names a variable or an error kind, never a value.
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

import { s3ClientOf, storageConfigOf } from "./ensure-bucket.mjs";

/** Where the copies are kept in the bucket. */
export const COPY_PREFIX = "backups/";

/** The first bytes of every custom-format dump. */
const DUMP_MAGIC = "PGDMP";

const tashkentDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tashkent",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The key of the copy made for a moment: the calendar day in Tashkent (developer-rules.md rule 10),
 * so the copy of one Sunday's tick has one key and a second run of it writes the same file.
 * @param {Date} moment
 */
export function copyKeyOf(moment) {
  return `${COPY_PREFIX}database-${tashkentDate.format(moment)}.dump`;
}

/**
 * The environment of `pg_dump` for DATABASE_URL: PG* variables, never an argument.
 * @param {Record<string, string | undefined>} env
 * @param {string | null} caFile the file holding DATABASE_CA_CERT, or null when there is none
 * @returns {Record<string, string>}
 */
export function pgDumpEnv(env, caFile) {
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  // The error of `new URL` can repeat the whole text, password included. This one does not.
  if (!URL.canParse(env.DATABASE_URL))
    throw new Error("DATABASE_URL is not a valid database address.");
  const address = new URL(env.DATABASE_URL);
  const result = {
    PATH: env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    PGHOST: decodeURIComponent(address.hostname),
    PGPORT: address.port || "5432",
    PGUSER: decodeURIComponent(address.username),
    PGDATABASE: decodeURIComponent(address.pathname.replace(/^\//, "")),
  };
  if (address.password) result.PGPASSWORD = decodeURIComponent(address.password);
  if (caFile) {
    // The address's own TLS settings are left out, as connectionOptions() does; never weaker.
    result.PGSSLMODE = "verify-full";
    result.PGSSLROOTCERT = caFile;
  } else {
    const mode = address.searchParams.get("sslmode");
    if (mode) result.PGSSLMODE = mode;
  }
  return result;
}

/** The arguments of `pg_dump`: the custom format, and never a password prompt. */
export const PG_DUMP_ARGS = ["--format=custom", "--no-password"];

/**
 * Runs `pg_dump` of DATABASE_URL and returns the file's bytes.
 * @param {Record<string, string | undefined>} env
 * @returns {Promise<Uint8Array>}
 */
export async function dumpDatabase(env) {
  const folder = env.DATABASE_CA_CERT ? await mkdtemp(join(tmpdir(), "db-copy-")) : null;
  try {
    let caFile = null;
    if (folder) {
      caFile = join(folder, "ca.crt");
      await writeFile(caFile, env.DATABASE_CA_CERT, { mode: 0o600 });
    }
    const childEnv = pgDumpEnv(env, caFile);
    return await new Promise((resolve, reject) => {
      const child = spawn("pg_dump", PG_DUMP_ARGS, {
        env: childEnv,
        stdio: ["ignore", "pipe", "ignore"],
      });
      const chunks = [];
      child.stdout.on("data", (chunk) => chunks.push(chunk));
      child.on("error", (error) =>
        reject(new Error(`pg_dump did not start (${error.code ?? error.name})`)),
      );
      // pg_dump's own message can name the server; only its exit code is told.
      child.on("close", (code) => {
        if (code === 0) resolve(new Uint8Array(Buffer.concat(chunks)));
        else reject(new Error(`pg_dump ended with code ${code}`));
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

/**
 * Makes one copy.
 * @param {Record<string, string | undefined>} env where DATABASE_URL, DATABASE_CA_CERT and S3_* are read
 * @param {Date} moment names the file (CLAUDE.md rule 10: the caller gives the time)
 * @param {{ dump?: typeof dumpDatabase }} [options] `dump` replaces pg_dump, for the tests
 * @returns {Promise<string>} "copy ok <key> (<bytes> bytes)" or "copy failed: …"
 */
export async function databaseCopy(env, moment, options = {}) {
  let config;
  try {
    config = storageConfigOf(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const missing = /^(S3_[A-Z_]+) is not set\./.exec(message);
    return `copy failed: ${missing ? `${missing[1]} is not set.` : message}`;
  }
  const dump = options.dump ?? dumpDatabase;
  const key = copyKeyOf(moment);
  let bytes;
  try {
    bytes = await dump(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Only the messages of this file are told; anything else by its kind.
    const known = /^(pg_dump |DATABASE_URL )/.test(message);
    return `copy failed: ${known ? message : kindOf(error)}.`;
  }
  if (Buffer.from(bytes.subarray(0, DUMP_MAGIC.length)).toString("latin1") !== DUMP_MAGIC) {
    return "copy failed: the dump is not a pg_dump custom-format file.";
  }
  const client = s3ClientOf(config);
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: bytes,
        ContentType: "application/octet-stream",
      }),
    );
    const head = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
    if (head.ContentLength !== bytes.length) {
      return "copy failed: the file read back has another size than the one written.";
    }
    return `copy ok ${key} (${bytes.length} bytes)`;
  } catch (error) {
    return `copy failed: ${kindOf(error)}.`;
  } finally {
    client.destroy();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // eslint-disable-next-line no-restricted-syntax -- the one moment of this script (rule 10)
  const line = await databaseCopy(process.env, new Date());
  console.log(line);
  if (!line.startsWith("copy ok")) process.exitCode = 1;
}
