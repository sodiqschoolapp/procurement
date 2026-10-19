import { databaseCopy, dumpDatabase } from "../../../scripts/db-copy.mjs";

import type { Job } from "./job";

// The weekly copy of the database (build-plan 8.2; 13-technology.md, Running it: "A weekly copy is
// also saved to R2"). Every Sunday at 04:00 in Tashkent, after the nightly check (plan of 8.2,
// decided item 5). The copy itself is databaseCopy() of scripts/db-copy.mjs, which the console of
// the test copy also runs; the file is named by the tick's day in Tashkent, so a run repeated for
// one tick writes the same file again (decided item 6).
//
// It keeps the Job shape of 0.13 and writes nothing through `tx`: holding its row in
// `scheduled_jobs` while `pg_dump` runs is what keeps a second instance from copying at the same
// time, and `pg_dump` takes only ACCESS SHARE locks. A failure throws, so the scheduler records the
// failed tick and logs it, as for every job (0.13 decision 9; decided item 9). It is in JOBS only
// where it can run (copyRuns() of ./registry.ts; decided item 8).

export function makeDatabaseCopy(dump: typeof dumpDatabase = dumpDatabase): Job {
  return {
    name: "database_copy",
    schedule: { weeklyOn: 7, dailyAt: "04:00" },
    async run({ tick }) {
      const line = await databaseCopy(process.env, tick, { dump });
      if (!line.startsWith("copy ok")) throw new Error(line);
      console.log(`Job database_copy: ${line}`);
    },
  };
}

export const databaseCopyJob = makeDatabaseCopy();
