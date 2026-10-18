-- Task 6.4d (plan of 6.4d, Database changes; decided item 9). Two new summary tables, written by
-- the next run of analytics_refresh, at most 5 minutes later. Its last_finished_at is cleared
-- (and last_tick, which its CHECK ties to it; a cleared tick also makes the job due), so the page
-- says the summary is being prepared rather than showing a rebuild time over empty tables, as
-- migrations 0038 and 0039 do. The unique (id, branch_id) of stock_documents comes first: it is
-- the target of analytics_stock_moves' composite key (id is already unique, so no row breaks it).
UPDATE "scheduled_jobs" SET "last_tick" = NULL, "last_finished_at" = NULL WHERE "name" = 'analytics_refresh';--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_id_branch_id_key" UNIQUE("id","branch_id");--> statement-breakpoint
CREATE TABLE "analytics_stock" (
	"branch_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"avg_cost" bigint NOT NULL,
	"value" bigint NOT NULL,
	"min_qty" numeric(14, 3),
	"low" boolean NOT NULL,
	"last_moved_on" date,
	CONSTRAINT "analytics_stock_pkey" PRIMARY KEY("branch_id","variant_id"),
	CONSTRAINT "analytics_stock_qty_check" CHECK ("analytics_stock"."qty" >= 0),
	CONSTRAINT "analytics_stock_avg_cost_check" CHECK ("analytics_stock"."avg_cost" >= 0),
	CONSTRAINT "analytics_stock_value_check" CHECK ("analytics_stock"."value" >= 0),
	CONSTRAINT "analytics_stock_min_qty_check" CHECK ("analytics_stock"."min_qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "analytics_stock_moves" (
	"movement_id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"department_id" uuid,
	"category_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"type" "stock_movement_type" NOT NULL,
	"moved_on" date NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"value" bigint NOT NULL,
	CONSTRAINT "analytics_stock_moves_type_check" CHECK ("analytics_stock_moves"."type" IN ('ISSUE', 'RETURN', 'WRITE_OFF')),
	CONSTRAINT "analytics_stock_moves_department_check" CHECK (("analytics_stock_moves"."type" IN ('ISSUE', 'RETURN')) = ("analytics_stock_moves"."department_id" IS NOT NULL)),
	CONSTRAINT "analytics_stock_moves_qty_check" CHECK ("analytics_stock_moves"."qty" > 0),
	CONSTRAINT "analytics_stock_moves_value_check" CHECK ("analytics_stock_moves"."value" >= 0)
);
--> statement-breakpoint
ALTER TABLE "analytics_stock" ADD CONSTRAINT "analytics_stock_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_stock" ADD CONSTRAINT "analytics_stock_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_stock" ADD CONSTRAINT "analytics_stock_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_stock" ADD CONSTRAINT "analytics_stock_balance_fk" FOREIGN KEY ("branch_id","variant_id") REFERENCES "public"."stock_balances"("branch_id","variant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_stock_moves" ADD CONSTRAINT "analytics_stock_moves_movement_id_stock_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."stock_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_stock_moves" ADD CONSTRAINT "analytics_stock_moves_document_id_stock_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."stock_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_stock_moves" ADD CONSTRAINT "analytics_stock_moves_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_stock_moves" ADD CONSTRAINT "analytics_stock_moves_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_stock_moves" ADD CONSTRAINT "analytics_stock_moves_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_stock_moves" ADD CONSTRAINT "analytics_stock_moves_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_stock_moves" ADD CONSTRAINT "analytics_stock_moves_document_branch_fk" FOREIGN KEY ("document_id","branch_id") REFERENCES "public"."stock_documents"("id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_stock_variant_id_idx" ON "analytics_stock" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "analytics_stock_category_id_idx" ON "analytics_stock" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "analytics_stock_moves_branch_id_moved_on_idx" ON "analytics_stock_moves" USING btree ("branch_id","moved_on");--> statement-breakpoint
CREATE INDEX "analytics_stock_moves_document_id_idx" ON "analytics_stock_moves" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "analytics_stock_moves_department_id_idx" ON "analytics_stock_moves" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "analytics_stock_moves_category_id_idx" ON "analytics_stock_moves" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "analytics_stock_moves_variant_id_idx" ON "analytics_stock_moves" USING btree ("variant_id");
