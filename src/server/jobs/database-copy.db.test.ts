import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { scheduledJobs } from "@/server/db/schema";

import { databaseCopy } from "../../../scripts/db-copy.mjs";
import { s3ClientOf, storageConfigOf } from "../../../scripts/ensure-bucket.mjs";
import { readObject } from "../../../scripts/storage-check.mjs";
import { setClock } from "../../../tests/helpers/clock";
import { TEST_BUCKET, testStorageEnv } from "../../../tests/helpers/local-storage";
import { makeDatabaseCopy } from "./database-copy";
import { runDueJobs } from "./run-due";

// The weekly copy (build-plan 8.2: "a weekly job saves a copy of the database to R2"; 13-technology.md,
// Running it). Against the local SeaweedFS bucket of the tests, with an invented dump in place of
// pg_dump: the real pg_dump 17 is the image's, proven on the test copy by hand (Done when; review of
// the plan, correction 1). No line may hold the endpoint or a key (CLAUDE.md, secrets convention).

const ENV = testStorageEnv(TEST_BUCKET);

/** Invented bytes that start as a custom-format dump does. */
function inventedDump(seed: string): Uint8Array {
  return new Uint8Array(Buffer.from(`PGDMP invented copy ${seed}`, "latin1"));
}

async function stored(key: string): Promise<Uint8Array | null> {
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

describe("databaseCopy (build-plan 8.2; plan of 8.2, decided items 4 and 6)", () => {
  it("writes the dump under backups/, named by the day in Tashkent, and reads its size back", async () => {
    const bytes = inventedDump("one");
    const line = await databaseCopy(ENV, new Date("2031-05-03T23:00:00Z"), {
      dump: async () => bytes,
    });
    expect(line).toBe(`copy ok backups/database-2031-05-04.dump (${bytes.length} bytes)`);
    expect(Buffer.from((await stored("backups/database-2031-05-04.dump"))!)).toEqual(
      Buffer.from(bytes),
    );
  });

  it("a second run for the same day writes the same file again (decided item 6)", async () => {
    const moment = new Date("2031-05-10T23:00:00Z");
    await databaseCopy(ENV, moment, { dump: async () => inventedDump("first") });
    const again = inventedDump("second, longer");
    expect(await databaseCopy(ENV, moment, { dump: async () => again })).toMatch(/^copy ok /);
    expect(Buffer.from((await stored("backups/database-2031-05-11.dump"))!)).toEqual(
      Buffer.from(again),
    );
  });

  it("refuses a dump that is not a custom-format file and writes nothing", async () => {
    const line = await databaseCopy(ENV, new Date("2031-05-17T23:00:00Z"), {
      dump: async () => new Uint8Array(Buffer.from("-- plain SQL", "latin1")),
    });
    expect(line).toBe("copy failed: the dump is not a pg_dump custom-format file.");
    expect(await stored("backups/database-2031-05-18.dump")).toBeNull();
  });

  it("says pg_dump failed, with its code only, and writes nothing", async () => {
    const line = await databaseCopy(ENV, new Date("2031-05-24T23:00:00Z"), {
      dump: async () => {
        throw new Error("pg_dump ended with code 1");
      },
    });
    expect(line).toBe("copy failed: pg_dump ended with code 1.");
    expect(await stored("backups/database-2031-05-25.dump")).toBeNull();
  });

  it("names a missing variable, never a value, and a storage error by its kind", async () => {
    const noBucket = { ...ENV, S3_BUCKET: "" };
    const missing = await databaseCopy(noBucket, new Date("2031-05-31T23:00:00Z"), {
      dump: async () => inventedDump("x"),
    });
    expect(missing).toBe("copy failed: S3_BUCKET is not set.");
    const wrongKey = await databaseCopy(
      { ...ENV, S3_SECRET_ACCESS_KEY: "invented-wrong-secret" },
      new Date("2031-05-31T23:00:00Z"),
      { dump: async () => inventedDump("x") },
    );
    expect(wrongKey).toMatch(/^copy failed: \w+( \(HTTP \d+\))?\.$/);
    holdsNoValue(wrongKey);
  });
});

describe("the job database_copy (13-technology.md, Scheduled jobs; 0.13 decision 9)", () => {
  it("runs at the Sunday 04:00 tick in Tashkent and writes that Sunday's file", async () => {
    const job = makeDatabaseCopy(async () => inventedDump("job"));
    setClock("2031-06-08T09:00:00Z");
    expect(await runDueJobs([job])).toEqual({ database_copy: "ran" });
    // Sunday 8 June 2031, 04:00 in Tashkent.
    const [row] = await db.select().from(scheduledJobs).where(eq(scheduledJobs.name, job.name));
    expect(row!.lastTick).toEqual(new Date("2031-06-07T23:00:00Z"));
    expect(await stored("backups/database-2031-06-08.dump")).not.toBeNull();
    setClock("2031-06-14T22:59:00Z");
    expect(await runDueJobs([job])).toEqual({ database_copy: "not_due" });
  });

  it("a failed copy is a failed tick, not tried again in it, and writes no file", async () => {
    const job = makeDatabaseCopy(async () => {
      throw new Error("pg_dump ended with code 1");
    });
    setClock("2031-06-15T09:00:00Z");
    expect(await runDueJobs([job])).toEqual({ database_copy: "failed" });
    const [row] = await db.select().from(scheduledJobs).where(eq(scheduledJobs.name, job.name));
    expect(row!.lastFailedTick).toEqual(new Date("2031-06-14T23:00:00Z"));
    expect(await stored("backups/database-2031-06-15.dump")).toBeNull();
    expect(await runDueJobs([job])).toEqual({ database_copy: "not_due" });
  });
});
