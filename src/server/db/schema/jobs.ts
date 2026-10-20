import { sql } from "drizzle-orm";
import { bigint, boolean, check, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// scheduled_jobs: the state of each job of the scheduler (build-plan 0.13: "a job registry with
// name, schedule and last run"). Not a table of 14-data-model.md (plan of 0.13, decision 2, Look
// first). The jobs themselves, their schedules and their code, are the registry in
// src/server/jobs/registry.ts; this row holds what happened. One row per job, made by the
// scheduler the first time it sees the job and taken with FOR UPDATE SKIP LOCKED as the job's
// lock (decision 3).
// - `last_tick` is the tick of the last finished run; `last_failed_tick` that of the last failed
//   one. A job runs only for a tick later than both (decision 9).
// - Every time comes from the injected clock: no database default (decisions 0.2, style 3).
// The row is state, updated in place, not history (rule 7); it is never deleted (rule 11).
export const scheduledJobs = pgTable(
  "scheduled_jobs",
  {
    name: text("name").primaryKey(),
    schedule: jsonb("schedule").notNull(),
    lastTick: timestamp("last_tick", { withTimezone: true }),
    lastStartedAt: timestamp("last_started_at", { withTimezone: true }),
    lastFinishedAt: timestamp("last_finished_at", { withTimezone: true }),
    lastFailedTick: timestamp("last_failed_tick", { withTimezone: true }),
    lastFailedAt: timestamp("last_failed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("scheduled_jobs_name_check", sql`${table.name} ~ '^[a-z][a-z0-9_]*$'`),
    check("scheduled_jobs_schedule_check", sql`jsonb_typeof(${table.schedule}) = 'object'`),
    check(
      "scheduled_jobs_finished_check",
      sql`${table.lastFinishedAt} IS NULL OR (${table.lastStartedAt} IS NOT NULL AND ${table.lastFinishedAt} >= ${table.lastStartedAt})`,
    ),
    check(
      "scheduled_jobs_tick_check",
      sql`${table.lastTick} IS NULL OR ${table.lastFinishedAt} IS NOT NULL`,
    ),
    check(
      "scheduled_jobs_failed_check",
      sql`(${table.lastFailedTick} IS NULL) = (${table.lastFailedAt} IS NULL)`,
    ),
  ],
);

// database_copies: one row per attempt of the job `database_copy` (13-technology.md, Running it;
// D55 item 6; plan of 8.2b, decided items 3, 6 and 13). Not a table of 14-data-model.md, as
// scheduled_jobs. `copyDue()` of src/domain/database-copy.ts reads the newest rows; the Head's
// Settings page shows the Tashkent date of the newest good one. A console copy (`npm run
// db:copy`) writes no row. Written only by the job, never updated, never deleted.
// - `tick` is the job's tick, one row per tick; `file_key` and `size_bytes` are the file of a
//   good copy and are empty for a failed one.
export const databaseCopies = pgTable(
  "database_copies",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tick: timestamp("tick", { withTimezone: true }).notNull().unique("database_copies_tick_key"),
    succeeded: boolean("succeeded").notNull(),
    fileKey: text("file_key"),
    sizeBytes: bigint("size_bytes", { mode: "bigint" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check(
      "database_copies_outcome_check",
      sql`CASE WHEN ${table.succeeded}
            THEN ${table.fileKey} IS NOT NULL AND ${table.sizeBytes} IS NOT NULL AND ${table.sizeBytes} > 0
            ELSE ${table.fileKey} IS NULL AND ${table.sizeBytes} IS NULL
          END`,
    ),
  ],
);
