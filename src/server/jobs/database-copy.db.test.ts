import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { getLastDatabaseCopy } from "@/features/settings/queries/settings";
import { AuthorizationError } from "@/server/authorize";
import { db } from "@/server/db/client";
import { databaseCopies, notifications, scheduledJobs } from "@/server/db/schema";

import { databaseCopy } from "../../../scripts/db-copy.mjs";
import {
  backupStorageConfigOf,
  s3ClientOf,
  storageConfigOf,
} from "../../../scripts/ensure-bucket.mjs";
import { readObject } from "../../../scripts/storage-check.mjs";
import { setClock } from "../../../tests/helpers/clock";
import { TEST_BUCKET, testStorageEnv } from "../../../tests/helpers/local-storage";
import { insertBranch } from "../../../tests/helpers/branches";
import { insertUser } from "../../../tests/helpers/users";
import { makeDatabaseCopy } from "./database-copy";
import { runDueJobs } from "./run-due";

// The weekly copy (build-plan 8.2: "a weekly job saves a copy of the database to R2"; build-plan
// 8.2b; 13-technology.md, Running it: "in a bucket of its own; if it fails, every active Head is
// told and it is tried again the next night, and the Head's Settings page shows the date of the
// last copy"; D55 item 6). Against the local SeaweedFS buckets of the tests, with an invented dump in place of
// pg_dump: the real pg_dump 17 is the image's, proven on the test copy by hand (Done when; review of
// the plan, correction 1). No line may hold the endpoint or a key (CLAUDE.md, secrets convention).

const ENV = testStorageEnv(TEST_BUCKET);

/** Invented bytes that start as a custom-format dump does. */
function inventedDump(seed: string): Uint8Array {
  return new Uint8Array(Buffer.from(`PGDMP invented copy ${seed}`, "latin1"));
}

/** A file of the bucket of the copies (BACKUP_S3_*, build-plan 8.2b). */
async function stored(key: string): Promise<Uint8Array | null> {
  const client = s3ClientOf(backupStorageConfigOf(ENV));
  try {
    return await readObject(client, ENV.BACKUP_S3_BUCKET!, key);
  } finally {
    client.destroy();
  }
}

/** A file of the files bucket, which never holds a copy (13 Running it: "a bucket of its own"). */
async function inFiles(key: string): Promise<Uint8Array | null> {
  const client = s3ClientOf(storageConfigOf(ENV));
  try {
    return await readObject(client, ENV.S3_BUCKET, key);
  } finally {
    client.destroy();
  }
}

function holdsNoValue(line: string): void {
  expect(line).not.toContain(ENV.S3_ENDPOINT);
  expect(line).not.toContain(ENV.S3_ACCESS_KEY_ID);
  expect(line).not.toContain(ENV.S3_SECRET_ACCESS_KEY);
}

describe("databaseCopy (build-plan 8.2; plan of 8.2, decided items 4 and 6; plan of 8.2b)", () => {
  it("writes the dump under backups/ of the bucket of the copies, never the files bucket, named by the day in Tashkent", async () => {
    const bytes = inventedDump("one");
    const result = await databaseCopy(ENV, new Date("2031-05-03T23:00:00Z"), {
      dump: async () => bytes,
    });
    expect(result).toEqual({
      ok: true,
      key: "backups/database-2031-05-04.dump",
      size: bytes.length,
      line: `copy ok backups/database-2031-05-04.dump (${bytes.length} bytes)`,
    });
    expect(Buffer.from((await stored("backups/database-2031-05-04.dump"))!)).toEqual(
      Buffer.from(bytes),
    );
    expect(await inFiles("backups/database-2031-05-04.dump")).toBeNull();
  });

  it("a second run for the same day writes the same file again (decided item 6)", async () => {
    const moment = new Date("2031-05-10T23:00:00Z");
    await databaseCopy(ENV, moment, { dump: async () => inventedDump("first") });
    const again = inventedDump("second, longer");
    expect((await databaseCopy(ENV, moment, { dump: async () => again })).line).toMatch(
      /^copy ok /,
    );
    expect(Buffer.from((await stored("backups/database-2031-05-11.dump"))!)).toEqual(
      Buffer.from(again),
    );
  });

  it("refuses a dump that is not a custom-format file and writes nothing", async () => {
    const result = await databaseCopy(ENV, new Date("2031-05-17T23:00:00Z"), {
      dump: async () => new Uint8Array(Buffer.from("-- plain SQL", "latin1")),
    });
    expect(result).toEqual({
      ok: false,
      line: "copy failed: the dump is not a pg_dump custom-format file.",
    });
    expect(await stored("backups/database-2031-05-18.dump")).toBeNull();
  });

  it("says pg_dump failed, with its code only, and writes nothing", async () => {
    const result = await databaseCopy(ENV, new Date("2031-05-24T23:00:00Z"), {
      dump: async () => {
        throw new Error("pg_dump ended with code 1");
      },
    });
    expect(result.line).toBe("copy failed: pg_dump ended with code 1.");
    expect(await stored("backups/database-2031-05-25.dump")).toBeNull();
  });

  it("names a missing variable of the bucket of the copies, never a value, and a storage error by its kind", async () => {
    for (const name of [
      "BACKUP_S3_BUCKET",
      "BACKUP_S3_ACCESS_KEY_ID",
      "BACKUP_S3_SECRET_ACCESS_KEY",
      "S3_ENDPOINT",
    ]) {
      const missing = await databaseCopy({ ...ENV, [name]: "" }, new Date("2031-05-31T23:00:00Z"), {
        dump: async () => inventedDump("x"),
      });
      expect(missing).toEqual({ ok: false, line: `copy failed: ${name} is not set.` });
    }
    // The files bucket's own keys are not those of the copies: a wrong one changes nothing.
    const filesKeyWrong = await databaseCopy(
      { ...ENV, S3_SECRET_ACCESS_KEY: "invented-wrong-secret" },
      new Date("2031-05-31T23:00:00Z"),
      { dump: async () => inventedDump("x") },
    );
    expect(filesKeyWrong.ok).toBe(true);
    const wrongKey = await databaseCopy(
      { ...ENV, BACKUP_S3_SECRET_ACCESS_KEY: "invented-wrong-secret" },
      new Date("2031-05-31T23:00:00Z"),
      { dump: async () => inventedDump("x") },
    );
    expect(wrongKey.line).toMatch(/^copy failed: \w+( \(HTTP \d+\))?\.$/);
    holdsNoValue(wrongKey.line);
  });
});

/** The DATABASE_COPY_FAILED notices of each user, in order. */
async function noticesOf(userIds: string[]) {
  const rows = await db
    .select({ userId: notifications.userId, link: notifications.link })
    .from(notifications)
    .where(
      and(inArray(notifications.userId, userIds), eq(notifications.type, "DATABASE_COPY_FAILED")),
    );
  return Object.fromEntries(
    userIds.map((id) => [id, rows.filter((row) => row.userId === id).length]),
  );
}

async function attempts() {
  return db
    .select({
      tick: databaseCopies.tick,
      succeeded: databaseCopies.succeeded,
      fileKey: databaseCopies.fileKey,
    })
    .from(databaseCopies)
    .orderBy(databaseCopies.tick);
}

const failing = makeDatabaseCopy(async () => {
  throw new Error("pg_dump ended with code 1");
}, ENV);
const working = makeDatabaseCopy(async () => inventedDump("job"), ENV);

// The job's ticks follow each other in this file: its rows in scheduled_jobs and database_copies
// are shared, as on a server. June 2031: Sundays the 8th, 15th and 22nd; 04:00 in Tashkent is
// 23:00 UTC the day before.
describe("the job database_copy (13 Running it; 10 Notifications; D55 item 6; plan of 8.2b)", () => {
  it("a failed copy tells every active Head and is tried again the next night until one succeeds; the Settings page shows its date (Done when)", async () => {
    setClock("2031-06-08T09:00:00Z");
    const heads = [(await insertUser("HEAD")).id, (await insertUser("HEAD")).id];
    const branch = await insertBranch();
    const others = [
      (await insertUser("HEAD", { isActive: false })).id,
      (await insertUser("MANAGER", { branches: [branch.id] })).id,
      (await insertUser("PRINCIPAL", { branches: [branch.id] })).id,
      (await insertUser("FINANCE", { branches: [branch.id] })).id,
    ];
    const told = async () => noticesOf([...heads, ...others]);
    const none = Object.fromEntries(others.map((id) => [id, 0]));
    expect(await getLastDatabaseCopy(heads[0]!)).toBeNull();

    // Sunday: the copy fails. The tick is a run, not a failed tick: the row and the notices stay.
    expect(await runDueJobs([failing])).toEqual({ database_copy: "ran" });
    const [job] = await db
      .select()
      .from(scheduledJobs)
      .where(eq(scheduledJobs.name, "database_copy"));
    expect(job).toMatchObject({
      schedule: { dailyAt: "04:00" },
      lastTick: new Date("2031-06-07T23:00:00Z"),
    });
    expect(await told()).toEqual({ [heads[0]!]: 1, [heads[1]!]: 1, ...none });
    expect(await stored("backups/database-2031-06-08.dump")).toBeNull();
    // Not tried again within the same tick.
    expect(await runDueJobs([failing])).toEqual({ database_copy: "not_due" });
    expect(await told()).toEqual({ [heads[0]!]: 1, [heads[1]!]: 1, ...none });

    // Monday night: tried again, fails again: a second notice to each Head.
    setClock("2031-06-09T09:00:00Z");
    expect(await runDueJobs([failing])).toEqual({ database_copy: "ran" });
    expect(await told()).toEqual({ [heads[0]!]: 2, [heads[1]!]: 2, ...none });

    // Tuesday night: it succeeds, in the bucket of the copies; nobody is told.
    setClock("2031-06-10T09:00:00Z");
    expect(await runDueJobs([working])).toEqual({ database_copy: "ran" });
    expect(await stored("backups/database-2031-06-10.dump")).not.toBeNull();
    expect(await inFiles("backups/database-2031-06-10.dump")).toBeNull();
    expect(await told()).toEqual({ [heads[0]!]: 2, [heads[1]!]: 2, ...none });
    expect(await getLastDatabaseCopy(heads[0]!)).toBe("2031-06-10");

    // Wednesday night: nothing to copy, no row.
    setClock("2031-06-11T09:00:00Z");
    expect(await runDueJobs([failing])).toEqual({ database_copy: "ran" });
    expect(await attempts()).toEqual([
      { tick: new Date("2031-06-07T23:00:00Z"), succeeded: false, fileKey: null },
      { tick: new Date("2031-06-08T23:00:00Z"), succeeded: false, fileKey: null },
      {
        tick: new Date("2031-06-09T23:00:00Z"),
        succeeded: true,
        fileKey: "backups/database-2031-06-10.dump",
      },
    ]);
    expect(await told()).toEqual({ [heads[0]!]: 2, [heads[1]!]: 2, ...none });
    const links = await db
      .select({ link: notifications.link, branchId: notifications.branchId })
      .from(notifications)
      .where(eq(notifications.userId, heads[0]!));
    expect(links).toContainEqual({ link: "/settings", branchId: null });

    // The next Sunday copies again.
    setClock("2031-06-15T09:00:00Z");
    expect(await runDueJobs([working])).toEqual({ database_copy: "ran" });
    expect(await getLastDatabaseCopy(heads[0]!)).toBe("2031-06-15");
  });

  it("a Sunday missed while the app was down is copied the next night after 7 days (plan of 8.2b, decided item 14)", async () => {
    // The app was down at 04:00 on Sunday the 22nd; on Saturday the 21st 6 days had passed.
    setClock("2031-06-21T09:00:00Z");
    expect(await runDueJobs([working])).toEqual({ database_copy: "ran" });
    expect(await stored("backups/database-2031-06-21.dump")).toBeNull();
    setClock("2031-06-23T09:00:00Z");
    expect(await runDueJobs([working])).toEqual({ database_copy: "ran" });
    expect(await stored("backups/database-2031-06-23.dump")).not.toBeNull();
  });

  it("the date of the last copy is the Head's only (03 Permission matrix, settings)", async () => {
    const branch = await insertBranch();
    for (const role of ["MANAGER", "PRINCIPAL", "FINANCE"] as const) {
      const user = await insertUser(role, { branches: [branch.id] });
      await expect(getLastDatabaseCopy(user.id)).rejects.toBeInstanceOf(AuthorizationError);
    }
  });
});
