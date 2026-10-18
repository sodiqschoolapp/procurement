-- Task 6.5a (plan of 6.5a, Database changes; decided items 3 and 6). A new summary table,
-- analytics_orders, and the decider of each decided stay, analytics_steps.decided_by. The steps
-- are derived rows (plan of 6.3, decided item 8): they are cleared, so the left check can require
-- decided_by on every decided stay, and the next run of analytics_refresh, at most 5 minutes
-- later, rewrites them all. Its last_finished_at is cleared (and last_tick, which its CHECK ties
-- to it; a cleared tick also makes the job due), as migrations 0038 to 0040 do. The left check is
-- dropped and added again with decided_by in it: Drizzle writes a changed CHECK so; the new one
-- refuses everything the old one refused.
DELETE FROM "analytics_steps";--> statement-breakpoint
UPDATE "scheduled_jobs" SET "last_tick" = NULL, "last_finished_at" = NULL WHERE "name" = 'analytics_refresh';--> statement-breakpoint
CREATE TABLE "analytics_orders" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"status" "request_status" NOT NULL,
	"progress" "order_progress" NOT NULL,
	"submitted_on" date NOT NULL,
	"needed_by" date NOT NULL,
	"category_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	CONSTRAINT "analytics_orders_status_check" CHECK ("analytics_orders"."status" <> 'DRAFT')
);
--> statement-breakpoint
ALTER TABLE "analytics_steps" DROP CONSTRAINT "analytics_steps_left_check";--> statement-breakpoint
ALTER TABLE "analytics_steps" ADD COLUMN "decided_by" uuid;--> statement-breakpoint
ALTER TABLE "analytics_orders" ADD CONSTRAINT "analytics_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_orders" ADD CONSTRAINT "analytics_orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_orders" ADD CONSTRAINT "analytics_orders_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_orders" ADD CONSTRAINT "analytics_orders_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_orders" ADD CONSTRAINT "analytics_orders_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_orders" ADD CONSTRAINT "analytics_orders_order_branch_fk" FOREIGN KEY ("order_id","branch_id") REFERENCES "public"."orders"("id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_orders" ADD CONSTRAINT "analytics_orders_department_branch_fk" FOREIGN KEY ("department_id","branch_id") REFERENCES "public"."departments"("id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_orders_branch_id_submitted_on_idx" ON "analytics_orders" USING btree ("branch_id","submitted_on");--> statement-breakpoint
CREATE INDEX "analytics_orders_branch_id_needed_by_idx" ON "analytics_orders" USING btree ("branch_id","needed_by");--> statement-breakpoint
CREATE INDEX "analytics_orders_category_id_idx" ON "analytics_orders" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "analytics_orders_department_id_idx" ON "analytics_orders" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "analytics_orders_owner_id_idx" ON "analytics_orders" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "analytics_steps" ADD CONSTRAINT "analytics_steps_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_steps_decided_by_idx" ON "analytics_steps" USING btree ("decided_by");--> statement-breakpoint
ALTER TABLE "analytics_steps" ADD CONSTRAINT "analytics_steps_left_check" CHECK (("analytics_steps"."left_at" IS NULL AND "analytics_steps"."left_on" IS NULL AND "analytics_steps"."seconds" IS NULL AND "analytics_steps"."decision" IS NULL AND "analytics_steps"."decided_by" IS NULL)
          OR ("analytics_steps"."left_at" IS NOT NULL AND "analytics_steps"."left_on" IS NOT NULL AND "analytics_steps"."seconds" IS NOT NULL AND "analytics_steps"."decision" IS NOT NULL AND "analytics_steps"."decided_by" IS NOT NULL
              AND "analytics_steps"."left_at" >= "analytics_steps"."entered_at" AND "analytics_steps"."seconds" >= 0));