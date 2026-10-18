CREATE TABLE "analytics_spending" (
	"purchase_id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"purchased_on" date NOT NULL,
	"category_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"supplier_id" uuid,
	"amount" bigint NOT NULL,
	CONSTRAINT "analytics_spending_amount_check" CHECK ("analytics_spending"."amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "analytics_spending" ADD CONSTRAINT "analytics_spending_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_spending" ADD CONSTRAINT "analytics_spending_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_spending" ADD CONSTRAINT "analytics_spending_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_spending" ADD CONSTRAINT "analytics_spending_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_spending" ADD CONSTRAINT "analytics_spending_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_spending" ADD CONSTRAINT "analytics_spending_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_spending" ADD CONSTRAINT "analytics_spending_supplier_id_companies_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_spending_branch_id_purchased_on_idx" ON "analytics_spending" USING btree ("branch_id","purchased_on");--> statement-breakpoint
CREATE INDEX "analytics_spending_order_id_idx" ON "analytics_spending" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "analytics_spending_category_id_idx" ON "analytics_spending" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "analytics_spending_department_id_idx" ON "analytics_spending" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "analytics_spending_owner_id_idx" ON "analytics_spending" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "analytics_spending_supplier_id_idx" ON "analytics_spending" USING btree ("supplier_id");