CREATE TYPE "public"."outcome_colour" AS ENUM('green', 'amber', 'red');--> statement-breakpoint
CREATE TABLE "analytics_outcomes" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"branch_id" uuid NOT NULL,
	"ended_on" date NOT NULL,
	"category_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"colour" "outcome_colour" NOT NULL,
	"planned" bigint NOT NULL,
	"actual" bigint NOT NULL,
	"difference" bigint NOT NULL,
	CONSTRAINT "analytics_outcomes_planned_check" CHECK ("analytics_outcomes"."planned" >= 0),
	CONSTRAINT "analytics_outcomes_actual_check" CHECK ("analytics_outcomes"."actual" >= 0),
	CONSTRAINT "analytics_outcomes_difference_check" CHECK ("analytics_outcomes"."difference" = "analytics_outcomes"."planned" - "analytics_outcomes"."actual"),
	CONSTRAINT "analytics_outcomes_colour_check" CHECK (("analytics_outcomes"."colour" = 'green') = ("analytics_outcomes"."difference" = 0)
          AND ("analytics_outcomes"."colour" = 'amber') = ("analytics_outcomes"."difference" > 0)
          AND ("analytics_outcomes"."colour" = 'red') = ("analytics_outcomes"."difference" < 0))
);
--> statement-breakpoint
CREATE TABLE "analytics_spending_payments" (
	"purchase_id" uuid NOT NULL,
	"payment_type" "payment_type" NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "analytics_spending_payments_purchase_id_payment_type_pk" PRIMARY KEY("purchase_id","payment_type"),
	CONSTRAINT "analytics_spending_payments_amount_check" CHECK ("analytics_spending_payments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "analytics_outcomes" ADD CONSTRAINT "analytics_outcomes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_outcomes" ADD CONSTRAINT "analytics_outcomes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_outcomes" ADD CONSTRAINT "analytics_outcomes_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_outcomes" ADD CONSTRAINT "analytics_outcomes_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_outcomes" ADD CONSTRAINT "analytics_outcomes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_spending_payments" ADD CONSTRAINT "analytics_spending_payments_purchase_id_analytics_spending_purchase_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."analytics_spending"("purchase_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_outcomes_branch_id_ended_on_idx" ON "analytics_outcomes" USING btree ("branch_id","ended_on");--> statement-breakpoint
CREATE INDEX "analytics_outcomes_category_id_idx" ON "analytics_outcomes" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "analytics_outcomes_department_id_idx" ON "analytics_outcomes" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "analytics_outcomes_owner_id_idx" ON "analytics_outcomes" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "analytics_spending_payments_payment_type_idx" ON "analytics_spending_payments" USING btree ("payment_type");