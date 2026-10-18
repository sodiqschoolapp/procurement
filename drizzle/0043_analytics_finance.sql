-- Task 6.6a (plan of 6.6a, Database changes; decided items 2, 4, 5 and 11, Look first).
-- analytics_money: one row per Cash given, Cash returned or Paid back row whose action is not
-- cancelled, for Finance's Cash block. analytics_orders gains each order's planned cash, the cash
-- handed to its Manager and its Cash needed soon, from src/domain/money-ledger.ts. The rows are
-- derived (plan of 6.3, decided item 8): analytics_orders is cleared so its new columns can be
-- NOT NULL, and the next run of analytics_refresh, at most 5 minutes later, rewrites both. Its
-- last_finished_at is cleared (and last_tick, which its CHECK ties to it; a cleared tick also
-- makes the job due), as migrations 0038 to 0042 do.
DELETE FROM "analytics_orders";--> statement-breakpoint
UPDATE "scheduled_jobs" SET "last_tick" = NULL, "last_finished_at" = NULL WHERE "name" = 'analytics_refresh';--> statement-breakpoint
CREATE TABLE "analytics_money" (
	"money_row_id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"manager_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"kind" "money_row_kind" NOT NULL,
	"amount" bigint NOT NULL,
	"occurred_on" date NOT NULL,
	CONSTRAINT "analytics_money_kind_check" CHECK ("analytics_money"."kind" IN ('CASH_GIVEN', 'CASH_RETURNED', 'PAID_BACK')),
	CONSTRAINT "analytics_money_amount_check" CHECK ("analytics_money"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "analytics_orders" ADD COLUMN "planned_cash" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_orders" ADD COLUMN "cash_handed" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_orders" ADD COLUMN "cash_needed" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_money" ADD CONSTRAINT "analytics_money_money_row_id_money_rows_id_fk" FOREIGN KEY ("money_row_id") REFERENCES "public"."money_rows"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_money" ADD CONSTRAINT "analytics_money_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_money" ADD CONSTRAINT "analytics_money_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_money" ADD CONSTRAINT "analytics_money_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_money" ADD CONSTRAINT "analytics_money_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_money" ADD CONSTRAINT "analytics_money_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_money" ADD CONSTRAINT "analytics_money_order_branch_fk" FOREIGN KEY ("order_id","branch_id") REFERENCES "public"."orders"("id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_money" ADD CONSTRAINT "analytics_money_department_branch_fk" FOREIGN KEY ("department_id","branch_id") REFERENCES "public"."departments"("id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_money_branch_id_occurred_on_idx" ON "analytics_money" USING btree ("branch_id","occurred_on");--> statement-breakpoint
CREATE INDEX "analytics_money_order_id_idx" ON "analytics_money" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "analytics_money_manager_id_idx" ON "analytics_money" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "analytics_money_category_id_idx" ON "analytics_money" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "analytics_money_department_id_idx" ON "analytics_money" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "analytics_orders_branch_id_cash_needed_idx" ON "analytics_orders" USING btree ("branch_id") WHERE "analytics_orders"."cash_needed" > 0;--> statement-breakpoint
ALTER TABLE "analytics_orders" ADD CONSTRAINT "analytics_orders_cash_needed_check" CHECK ("analytics_orders"."cash_needed" >= 0);