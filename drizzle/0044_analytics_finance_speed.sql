-- Task 6.6b (plan of 6.6b, Database changes; decided items 3, 4 and 9, Look first).
-- analytics_spending gains has_receipt, whether the record's trip has a receipt file, for
-- Finance's purchases without a receipt. analytics_settlements: one row per settlement that ended
-- in Closed, settlementStays() of src/domain/approval-stays.ts, for Settlement speed. The rows are
-- derived (plan of 6.3, decided item 8): analytics_spending and its payment parts are cleared so
-- the new column can be NOT NULL, and the next run of analytics_refresh, at most 5 minutes later,
-- rewrites them and fills the new table. Its last_finished_at is cleared (and last_tick, which its
-- CHECK ties to it; a cleared tick also makes the job due), as migrations 0038 to 0043 do (spec
-- review of the plan, Should fix 2).
DELETE FROM "analytics_spending_payments";--> statement-breakpoint
DELETE FROM "analytics_spending";--> statement-breakpoint
UPDATE "scheduled_jobs" SET "last_tick" = NULL, "last_finished_at" = NULL WHERE "name" = 'analytics_refresh';--> statement-breakpoint
CREATE TABLE "analytics_settlements" (
	"order_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone NOT NULL,
	"closed_on" date NOT NULL,
	"seconds" bigint NOT NULL,
	"category_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	CONSTRAINT "analytics_settlements_order_id_closed_at_pk" PRIMARY KEY("order_id","closed_at"),
	CONSTRAINT "analytics_settlements_seconds_check" CHECK ("analytics_settlements"."closed_at" >= "analytics_settlements"."sent_at" AND "analytics_settlements"."seconds" >= 0)
);
--> statement-breakpoint
ALTER TABLE "analytics_spending" ADD COLUMN "has_receipt" boolean NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_settlements" ADD CONSTRAINT "analytics_settlements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_settlements" ADD CONSTRAINT "analytics_settlements_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_settlements" ADD CONSTRAINT "analytics_settlements_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_settlements" ADD CONSTRAINT "analytics_settlements_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_settlements" ADD CONSTRAINT "analytics_settlements_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_settlements" ADD CONSTRAINT "analytics_settlements_order_branch_fk" FOREIGN KEY ("order_id","branch_id") REFERENCES "public"."orders"("id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_settlements" ADD CONSTRAINT "analytics_settlements_department_branch_fk" FOREIGN KEY ("department_id","branch_id") REFERENCES "public"."departments"("id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_settlements_branch_id_closed_on_idx" ON "analytics_settlements" USING btree ("branch_id","closed_on");--> statement-breakpoint
CREATE INDEX "analytics_settlements_category_id_idx" ON "analytics_settlements" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "analytics_settlements_department_id_idx" ON "analytics_settlements" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "analytics_settlements_owner_id_idx" ON "analytics_settlements" USING btree ("owner_id");