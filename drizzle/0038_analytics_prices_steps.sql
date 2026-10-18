-- Task 6.4b (plan of 6.4b, Database changes; decided item 13). The rows of analytics_spending are
-- derived (plan of 6.3, decided item 8): the new goods column is actualGoods() of each record,
-- which SQL must not write a second time (developer-rules.md rule 1), so the rows are cleared and
-- the next run of analytics_refresh, at most 5 minutes later, rewrites them all. Its
-- last_finished_at is cleared with them (and last_tick, which its CHECK ties to it; a cleared tick
-- also makes the job due), so the page says the summary is being prepared rather than showing a
-- rebuild time over empty tables (plan of 6.3, decided item 14).
DELETE FROM "analytics_spending_payments";--> statement-breakpoint
DELETE FROM "analytics_spending";--> statement-breakpoint
UPDATE "scheduled_jobs" SET "last_tick" = NULL, "last_finished_at" = NULL WHERE "name" = 'analytics_refresh';--> statement-breakpoint
CREATE TABLE "analytics_steps" (
	"order_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"step" "request_status" NOT NULL,
	"entered_at" timestamp with time zone NOT NULL,
	"left_at" timestamp with time zone,
	"left_on" date,
	"seconds" bigint,
	"decision" "order_event_type",
	"reason" text,
	"reason_key" text,
	"category_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	CONSTRAINT "analytics_steps_order_id_step_entered_at_pk" PRIMARY KEY("order_id","step","entered_at"),
	CONSTRAINT "analytics_steps_step_check" CHECK ("analytics_steps"."step" IN ('PENDING_HEAD', 'PENDING_PRINCIPAL', 'PENDING_FINANCE')),
	CONSTRAINT "analytics_steps_decision_check" CHECK ("analytics_steps"."decision" IS NULL OR "analytics_steps"."decision" IN ('APPROVE', 'SEND_BACK', 'REJECT')),
	CONSTRAINT "analytics_steps_left_check" CHECK (("analytics_steps"."left_at" IS NULL AND "analytics_steps"."left_on" IS NULL AND "analytics_steps"."seconds" IS NULL AND "analytics_steps"."decision" IS NULL)
          OR ("analytics_steps"."left_at" IS NOT NULL AND "analytics_steps"."left_on" IS NOT NULL AND "analytics_steps"."seconds" IS NOT NULL AND "analytics_steps"."decision" IS NOT NULL
              AND "analytics_steps"."left_at" >= "analytics_steps"."entered_at" AND "analytics_steps"."seconds" >= 0)),
	CONSTRAINT "analytics_steps_reason_check" CHECK (CASE WHEN "analytics_steps"."decision" IN ('SEND_BACK', 'REJECT')
        THEN "analytics_steps"."reason" IS NOT NULL AND "analytics_steps"."reason_key" IS NOT NULL
        ELSE "analytics_steps"."reason" IS NULL AND "analytics_steps"."reason_key" IS NULL
      END)
);
--> statement-breakpoint
ALTER TABLE "analytics_spending" ADD COLUMN "variant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_spending" ADD COLUMN "qty" numeric(14, 3) NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_spending" ADD COLUMN "unit_price" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_spending" ADD COLUMN "goods" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_spending" ADD COLUMN "created_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_steps" ADD CONSTRAINT "analytics_steps_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_steps" ADD CONSTRAINT "analytics_steps_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_steps" ADD CONSTRAINT "analytics_steps_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_steps" ADD CONSTRAINT "analytics_steps_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_steps" ADD CONSTRAINT "analytics_steps_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_steps_branch_id_left_on_idx" ON "analytics_steps" USING btree ("branch_id","left_on");--> statement-breakpoint
CREATE INDEX "analytics_steps_open_idx" ON "analytics_steps" USING btree ("branch_id","step") WHERE "analytics_steps"."left_at" IS NULL;--> statement-breakpoint
CREATE INDEX "analytics_steps_category_id_idx" ON "analytics_steps" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "analytics_steps_department_id_idx" ON "analytics_steps" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "analytics_steps_owner_id_idx" ON "analytics_steps" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "analytics_steps_decision_reason_key_idx" ON "analytics_steps" USING btree ("decision","reason_key");--> statement-breakpoint
ALTER TABLE "analytics_spending" ADD CONSTRAINT "analytics_spending_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_spending_variant_id_purchased_on_idx" ON "analytics_spending" USING btree ("variant_id","purchased_on");--> statement-breakpoint
ALTER TABLE "analytics_spending" ADD CONSTRAINT "analytics_spending_qty_check" CHECK ("analytics_spending"."qty" > 0);--> statement-breakpoint
ALTER TABLE "analytics_spending" ADD CONSTRAINT "analytics_spending_unit_price_check" CHECK ("analytics_spending"."unit_price" >= 0);--> statement-breakpoint
ALTER TABLE "analytics_spending" ADD CONSTRAINT "analytics_spending_goods_check" CHECK ("analytics_spending"."goods" >= 0);