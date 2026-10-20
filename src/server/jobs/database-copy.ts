import { and, desc, eq } from "drizzle-orm";

import { businessDate } from "@/domain/business-date";
import { copyDue } from "@/domain/database-copy";
import { now } from "@/server/clock";
import { databaseCopies, users } from "@/server/db/schema";
import { reportError } from "@/server/error-report";
import { notify } from "@/server/notify";

import { databaseCopy, dumpDatabase } from "../../../scripts/db-copy.mjs";

import type { Job } from "./job";

// The weekly copy of the database (build-plan 8.2 and 8.2b; 13-technology.md, Running it: "A weekly
// copy is also saved to R2, in a bucket of its own; if it fails, every active Head is told and it
// is tried again the next night"; D55 item 6). The job wakes every night at 04:00 in Tashkent,
// after the nightly check, and copies when copyDue() of src/domain/database-copy.ts says so: on a
// Sunday, the night after a failure, and when the last good copy is 7 days old (plan of 8.2b,
// decided items 3 and 14). The copy itself is databaseCopy() of scripts/db-copy.mjs, which the
// console also runs; the file is named by the tick's day in Tashkent.
//
// Every attempt is one row of `database_copies`. A failed copy does not throw: its row and the
// notice to every active Head must be saved, and a throw would roll them back with the savepoint
// (plan of 8.2b, decided item 4; it reverses 8.2 item 9). It is logged and reported as an alert
// instead. The job holds its row in `scheduled_jobs` while `pg_dump` runs, which keeps a second
// instance from copying at the same time; `pg_dump` takes only ACCESS SHARE locks. It is in JOBS
// only where it can run (copyRuns() of ./registry.ts).

/** A failed copy, for the alert: its line names a variable or an error kind, never a value. */
class DatabaseCopyFailed extends Error {
  name = "DatabaseCopyFailed";
}

export function makeDatabaseCopy(
  dump: typeof dumpDatabase = dumpDatabase,
  env: Record<string, string | undefined> = process.env,
): Job {
  return {
    name: "database_copy",
    schedule: { dailyAt: "04:00" },
    async run({ tx, tick }) {
      const [newest] = await tx
        .select({ tick: databaseCopies.tick, succeeded: databaseCopies.succeeded })
        .from(databaseCopies)
        .orderBy(desc(databaseCopies.tick))
        .limit(1);
      const [good] = await tx
        .select({ tick: databaseCopies.tick })
        .from(databaseCopies)
        .where(eq(databaseCopies.succeeded, true))
        .orderBy(desc(databaseCopies.tick))
        .limit(1);
      const due = copyDue(
        businessDate(tick),
        newest ? { on: businessDate(newest.tick), succeeded: newest.succeeded } : null,
        good ? businessDate(good.tick) : null,
      );
      if (!due) return;

      const result = await databaseCopy(env, tick, { dump });
      await tx.insert(databaseCopies).values({
        tick,
        succeeded: result.ok,
        fileKey: result.ok ? result.key : null,
        sizeBytes: result.ok ? BigInt(result.size) : null,
        createdAt: now(),
      });
      if (result.ok) {
        console.log(`Job database_copy: ${result.line}`);
        return;
      }
      console.error(`Job database_copy: ${result.line}`);
      void reportError(new DatabaseCopyFailed(result.line), "job database_copy");
      // "The weekly copy of the database failed | Every active Head, each night until a copy
      // succeeds" (10 Notifications). No branch: it is of the whole school.
      const heads = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, "HEAD"), eq(users.isActive, true)));
      await notify(
        { tx, userId: null },
        {
          to: heads.map((head) => head.id),
          type: "DATABASE_COPY_FAILED",
          params: {},
          branchId: null,
          link: "/settings",
          at: now(),
        },
      );
    },
  };
}

export const databaseCopyJob = makeDatabaseCopy();
