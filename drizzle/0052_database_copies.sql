-- Task 8.2b: the weekly copy is retried the next night after a failure, and every active Head is
-- told (13-technology.md, Running it; 10 Notifications; D55 item 6). One row per attempt of the
-- job database_copy; the Settings page shows the date of the newest good one. No statement of
-- this migration uses the new enum value, so ADD VALUE may run inside the migration's transaction.
ALTER TYPE "public"."notification_type" ADD VALUE 'DATABASE_COPY_FAILED';--> statement-breakpoint
CREATE TABLE "database_copies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tick" timestamp with time zone NOT NULL,
	"succeeded" boolean NOT NULL,
	"file_key" text,
	"size_bytes" bigint,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "database_copies_tick_key" UNIQUE("tick"),
	CONSTRAINT "database_copies_outcome_check" CHECK (CASE WHEN "database_copies"."succeeded"
            THEN "database_copies"."file_key" IS NOT NULL AND "database_copies"."size_bytes" IS NOT NULL AND "database_copies"."size_bytes" > 0
            ELSE "database_copies"."file_key" IS NULL AND "database_copies"."size_bytes" IS NULL
          END)
);
