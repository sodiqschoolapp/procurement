CREATE TABLE "stock_minimums" (
	"branch_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"min_qty" numeric(14, 3),
	"low_notified_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "stock_minimums_pkey" PRIMARY KEY("branch_id","variant_id"),
	CONSTRAINT "stock_minimums_min_qty_check" CHECK ("stock_minimums"."min_qty" > 0)
);
--> statement-breakpoint
ALTER TABLE "stock_minimums" ADD CONSTRAINT "stock_minimums_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_minimums" ADD CONSTRAINT "stock_minimums_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_minimums_variant_id_idx" ON "stock_minimums" USING btree ("variant_id");