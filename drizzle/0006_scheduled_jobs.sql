CREATE TABLE "scheduled_jobs" (
	"name" text PRIMARY KEY NOT NULL,
	"schedule" jsonb NOT NULL,
	"last_tick" timestamp with time zone,
	"last_started_at" timestamp with time zone,
	"last_finished_at" timestamp with time zone,
	"last_failed_tick" timestamp with time zone,
	"last_failed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "scheduled_jobs_name_check" CHECK ("scheduled_jobs"."name" ~ '^[a-z][a-z0-9_]*$'),
	CONSTRAINT "scheduled_jobs_schedule_check" CHECK (jsonb_typeof("scheduled_jobs"."schedule") = 'object'),
	CONSTRAINT "scheduled_jobs_finished_check" CHECK ("scheduled_jobs"."last_finished_at" IS NULL OR ("scheduled_jobs"."last_started_at" IS NOT NULL AND "scheduled_jobs"."last_finished_at" >= "scheduled_jobs"."last_started_at")),
	CONSTRAINT "scheduled_jobs_tick_check" CHECK ("scheduled_jobs"."last_tick" IS NULL OR "scheduled_jobs"."last_finished_at" IS NOT NULL),
	CONSTRAINT "scheduled_jobs_failed_check" CHECK (("scheduled_jobs"."last_failed_tick" IS NULL) = ("scheduled_jobs"."last_failed_at" IS NULL))
);
