-- Task 6.4c (plan of 6.4c, Database changes; decided item 8). Two new summary tables, written by
-- the next run of analytics_refresh, at most 5 minutes later. Its last_finished_at is cleared
-- (and last_tick, which its CHECK ties to it; a cleared tick also makes the job due), so the page
-- says the summary is being prepared rather than showing a rebuild time over empty tables, as
-- migration 0038 does (plan of 6.3, decided item 14).
UPDATE "scheduled_jobs" SET "last_tick" = NULL, "last_finished_at" = NULL WHERE "name" = 'analytics_refresh';--> statement-breakpoint
CREATE TABLE "analytics_cancelled" (
	"purchase_id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"cancelled_on" date NOT NULL,
	"category_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"supplier_id" uuid,
	"amount" bigint NOT NULL,
	CONSTRAINT "analytics_cancelled_amount_check" CHECK ("analytics_cancelled"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "analytics_cash" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"cash_count" bigint NOT NULL,
	"since" date NOT NULL,
	CONSTRAINT "analytics_cash_cash_count_check" CHECK ("analytics_cash"."cash_count" <> 0)
);
--> statement-breakpoint
ALTER TABLE "analytics_cancelled" ADD CONSTRAINT "analytics_cancelled_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_cancelled" ADD CONSTRAINT "analytics_cancelled_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_cancelled" ADD CONSTRAINT "analytics_cancelled_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_cancelled" ADD CONSTRAINT "analytics_cancelled_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_cancelled" ADD CONSTRAINT "analytics_cancelled_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_cancelled" ADD CONSTRAINT "analytics_cancelled_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_cancelled" ADD CONSTRAINT "analytics_cancelled_supplier_id_companies_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_cancelled" ADD CONSTRAINT "analytics_cancelled_order_branch_fk" FOREIGN KEY ("order_id","branch_id") REFERENCES "public"."orders"("id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_cash" ADD CONSTRAINT "analytics_cash_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_cash" ADD CONSTRAINT "analytics_cash_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_cash" ADD CONSTRAINT "analytics_cash_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_cash" ADD CONSTRAINT "analytics_cash_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_cash" ADD CONSTRAINT "analytics_cash_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_cash" ADD CONSTRAINT "analytics_cash_order_branch_fk" FOREIGN KEY ("order_id","branch_id") REFERENCES "public"."orders"("id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_cancelled_branch_id_cancelled_on_idx" ON "analytics_cancelled" USING btree ("branch_id","cancelled_on");--> statement-breakpoint
CREATE INDEX "analytics_cancelled_order_id_idx" ON "analytics_cancelled" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "analytics_cancelled_category_id_idx" ON "analytics_cancelled" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "analytics_cancelled_department_id_idx" ON "analytics_cancelled" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "analytics_cancelled_owner_id_idx" ON "analytics_cancelled" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "analytics_cancelled_supplier_id_idx" ON "analytics_cancelled" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "analytics_cash_branch_id_idx" ON "analytics_cash" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "analytics_cash_owner_id_idx" ON "analytics_cash" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "analytics_cash_category_id_idx" ON "analytics_cash" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "analytics_cash_department_id_idx" ON "analytics_cash" USING btree ("department_id");