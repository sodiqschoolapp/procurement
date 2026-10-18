-- Task 6.5b (plan of 6.5b, Database changes; decided item 1, Look first). analytics_orders gains
-- the first entry into Open of each order, its Tashkent date and the whole seconds from the first
-- submit, all null until the order is fully approved. The rows are derived (plan of 6.3, decided
-- item 8): they are cleared, and the next run of analytics_refresh, at most 5 minutes later,
-- rewrites them all. Its last_finished_at is cleared (and last_tick, which its CHECK ties to it;
-- a cleared tick also makes the job due), as migrations 0038 to 0041 do.
DELETE FROM "analytics_orders";--> statement-breakpoint
UPDATE "scheduled_jobs" SET "last_tick" = NULL, "last_finished_at" = NULL WHERE "name" = 'analytics_refresh';--> statement-breakpoint
ALTER TABLE "analytics_orders" ADD COLUMN "opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "analytics_orders" ADD COLUMN "opened_on" date;--> statement-breakpoint
ALTER TABLE "analytics_orders" ADD COLUMN "approval_seconds" bigint;--> statement-breakpoint
CREATE INDEX "analytics_orders_branch_id_opened_on_idx" ON "analytics_orders" USING btree ("branch_id","opened_on");--> statement-breakpoint
ALTER TABLE "analytics_orders" ADD CONSTRAINT "analytics_orders_opened_check" CHECK (("analytics_orders"."opened_at" IS NULL AND "analytics_orders"."opened_on" IS NULL AND "analytics_orders"."approval_seconds" IS NULL)
          OR ("analytics_orders"."opened_at" IS NOT NULL AND "analytics_orders"."opened_on" IS NOT NULL AND "analytics_orders"."approval_seconds" IS NOT NULL
              AND "analytics_orders"."approval_seconds" >= 0));