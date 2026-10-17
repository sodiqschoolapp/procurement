-- Task 3.1, the stock ledger (09-warehouse.md; 14-data-model.md, Warehouse): stock_movements and
-- the average cost of stock_balances. stock_balances is still empty (no code wrote it before), so
-- the default of avg_cost fills no row. Written only by postMovement() of
-- src/server/stock-ledger.ts, which keeps the balance in step with the movements in one
-- transaction (14, Notes for the build, first bullet).
CREATE TYPE "public"."stock_movement_type" AS ENUM('RECEIPT', 'ISSUE', 'RETURN', 'TRANSFER_OUT', 'TRANSFER_IN', 'WRITE_OFF', 'CORRECTION', 'DIRECT_ENTRY', 'REVERSAL');--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "stock_movements_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"type" "stock_movement_type" NOT NULL,
	"qty_delta" numeric(14, 3) NOT NULL,
	"unit_cost" bigint NOT NULL,
	"balance_after" numeric(14, 3) NOT NULL,
	"purchase_id" uuid,
	"document_line_id" uuid,
	"reverses_movement_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "stock_movements_seq_unique" UNIQUE("seq"),
	CONSTRAINT "stock_movements_qty_delta_check" CHECK ("stock_movements"."qty_delta" <> 0),
	CONSTRAINT "stock_movements_balance_after_check" CHECK ("stock_movements"."balance_after" >= 0),
	CONSTRAINT "stock_movements_unit_cost_check" CHECK ("stock_movements"."unit_cost" >= 0),
	CONSTRAINT "stock_movements_direction_check" CHECK (CASE
        WHEN "stock_movements"."type" IN ('RECEIPT', 'RETURN', 'TRANSFER_IN', 'DIRECT_ENTRY') THEN "stock_movements"."qty_delta" > 0
        WHEN "stock_movements"."type" IN ('ISSUE', 'TRANSFER_OUT', 'WRITE_OFF') THEN "stock_movements"."qty_delta" < 0
        ELSE true
      END)
);
--> statement-breakpoint
ALTER TABLE "stock_balances" ADD COLUMN "avg_cost" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reverses_movement_id_stock_movements_id_fk" FOREIGN KEY ("reverses_movement_id") REFERENCES "public"."stock_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movements_branch_variant_seq_idx" ON "stock_movements" USING btree ("branch_id","variant_id","seq");--> statement-breakpoint
CREATE INDEX "stock_movements_variant_id_idx" ON "stock_movements" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "stock_movements_created_by_idx" ON "stock_movements" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "stock_movements_reverses_movement_id_idx" ON "stock_movements" USING btree ("reverses_movement_id");--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_avg_cost_check" CHECK ("stock_balances"."avg_cost" >= 0);--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_empty_avg_check" CHECK ("stock_balances"."qty" > 0 OR "stock_balances"."avg_cost" = 0);--> statement-breakpoint
-- Stock movements are history: UPDATE, DELETE and TRUNCATE are refused, as on the order history
-- (developer-rules.md rule 7). A wrong document is fixed with a new movement (09, Reverse).
CREATE FUNCTION "stock_movements_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'Stock movements are append-only: % is refused.', TG_OP
		USING ERRCODE = 'check_violation',
			CONSTRAINT = 'stock_movements_append_only',
			TABLE = TG_TABLE_NAME;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "stock_movements_append_only"
	BEFORE UPDATE OR DELETE ON "stock_movements"
	FOR EACH ROW EXECUTE FUNCTION "stock_movements_append_only"();--> statement-breakpoint
CREATE TRIGGER "stock_movements_append_only_truncate"
	BEFORE TRUNCATE ON "stock_movements"
	FOR EACH STATEMENT EXECUTE FUNCTION "stock_movements_append_only"();
