-- Task 3.2, the purchases (14-data-model.md, Purchasing and money: purchase_trips, purchases,
-- purchase_extras, trip_files) and the keys of stock_movements.purchase_id and
-- price_history.purchase_id. No code wrote a PURCHASE price row or a movement with a purchase
-- before, so the new keys meet no old row. The key of orders (id, branch_id) comes first: a
-- purchase names it, so a record's order is of its trip's branch (plan of 3.2, decided item 1).
ALTER TABLE "orders" ADD CONSTRAINT "orders_id_branch_key" UNIQUE("id","branch_id");--> statement-breakpoint
CREATE TABLE "purchase_extras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_id" uuid NOT NULL,
	"extra_cost_type_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"payment_type" "payment_type" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "purchase_extras_amount_check" CHECK ("purchase_extras"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_key" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"purchased_on" date NOT NULL,
	"supplier_id" uuid,
	"payment_type" "payment_type" NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "purchase_trips_client_key_key" UNIQUE("client_key"),
	CONSTRAINT "purchase_trips_id_branch_key" UNIQUE("id","branch_id")
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"unit_price" bigint NOT NULL,
	"comment" text,
	"give_to_requester" boolean DEFAULT false NOT NULL,
	"is_cancelled" boolean DEFAULT false NOT NULL,
	"cancel_reason" text,
	"cancelled_by" uuid,
	"cancelled_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "purchases_id_branch_variant_key" UNIQUE("id","branch_id","variant_id"),
	CONSTRAINT "purchases_qty_check" CHECK ("purchases"."qty" > 0),
	CONSTRAINT "purchases_unit_price_check" CHECK ("purchases"."unit_price" >= 0),
	CONSTRAINT "purchases_comment_check" CHECK (char_length("purchases"."comment") <= 1000),
	CONSTRAINT "purchases_cancel_check" CHECK (CASE WHEN "purchases"."is_cancelled"
        THEN btrim(coalesce("purchases"."cancel_reason", '')) <> '' AND "purchases"."cancelled_by" IS NOT NULL AND "purchases"."cancelled_at" IS NOT NULL
        ELSE "purchases"."cancel_reason" IS NULL AND "purchases"."cancelled_by" IS NULL AND "purchases"."cancelled_at" IS NULL
      END)
);
--> statement-breakpoint
CREATE TABLE "trip_files" (
	"trip_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "trip_files_pkey" PRIMARY KEY("trip_id","file_id"),
	CONSTRAINT "trip_files_file_id_key" UNIQUE("file_id")
);
--> statement-breakpoint
ALTER TABLE "purchase_extras" ADD CONSTRAINT "purchase_extras_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_extras" ADD CONSTRAINT "purchase_extras_extra_cost_type_id_extra_cost_types_id_fk" FOREIGN KEY ("extra_cost_type_id") REFERENCES "public"."extra_cost_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_trips" ADD CONSTRAINT "purchase_trips_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_trips" ADD CONSTRAINT "purchase_trips_supplier_id_companies_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_trips" ADD CONSTRAINT "purchase_trips_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_trip_branch_fk" FOREIGN KEY ("trip_id","branch_id") REFERENCES "public"."purchase_trips"("id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_order_branch_fk" FOREIGN KEY ("order_id","branch_id") REFERENCES "public"."orders"("id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_files" ADD CONSTRAINT "trip_files_trip_id_purchase_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."purchase_trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_files" ADD CONSTRAINT "trip_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_extras_purchase_id_idx" ON "purchase_extras" USING btree ("purchase_id");--> statement-breakpoint
CREATE INDEX "purchase_extras_extra_cost_type_id_idx" ON "purchase_extras" USING btree ("extra_cost_type_id");--> statement-breakpoint
CREATE INDEX "purchase_trips_branch_id_purchased_on_idx" ON "purchase_trips" USING btree ("branch_id","purchased_on");--> statement-breakpoint
CREATE INDEX "purchase_trips_supplier_id_idx" ON "purchase_trips" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "purchase_trips_created_by_idx" ON "purchase_trips" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "purchases_trip_id_idx" ON "purchases" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "purchases_order_id_idx" ON "purchases" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "purchases_branch_id_idx" ON "purchases" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "purchases_variant_id_idx" ON "purchases" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "purchases_created_by_idx" ON "purchases" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "purchases_cancelled_by_idx" ON "purchases" USING btree ("cancelled_by");--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_fk" FOREIGN KEY ("purchase_id","branch_id","variant_id") REFERENCES "public"."purchases"("id","branch_id","variant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movements_purchase_id_idx" ON "stock_movements" USING btree ("purchase_id");--> statement-breakpoint
-- A purchase record changes once, by its cancel (Decided ahead, question 3): is_cancelled from
-- false to true with cancel_reason, cancelled_by and cancelled_at (purchases_cancel_check holds the
-- three together), every other column as it was written. Any other UPDATE, a second cancel, an
-- un-cancel, DELETE and TRUNCATE are refused. Stock is undone by a new movement (3.7).
CREATE FUNCTION "purchases_cancel_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'UPDATE' AND NOT OLD."is_cancelled" AND NEW."is_cancelled"
		AND (to_jsonb(NEW) - ARRAY['is_cancelled', 'cancel_reason', 'cancelled_by', 'cancelled_at'])
			= (to_jsonb(OLD) - ARRAY['is_cancelled', 'cancel_reason', 'cancelled_by', 'cancelled_at'])
	THEN
		RETURN NEW;
	END IF;
	RAISE EXCEPTION 'A purchase record changes only by its one cancel: % is refused.', TG_OP
		USING ERRCODE = 'check_violation',
			CONSTRAINT = 'purchases_cancel_only',
			TABLE = TG_TABLE_NAME;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "purchases_cancel_only"
	BEFORE UPDATE OR DELETE ON "purchases"
	FOR EACH ROW EXECUTE FUNCTION "purchases_cancel_only"();--> statement-breakpoint
CREATE TRIGGER "purchases_cancel_only_truncate"
	BEFORE TRUNCATE ON "purchases"
	FOR EACH STATEMENT EXECUTE FUNCTION "purchases_cancel_only"();--> statement-breakpoint
-- A trip, its extras and its files are written once (plan of 3.2, decided item 7): a trip holds the
-- date, supplier and payment type of its records, and the extras are money spent. A wrong trip is
-- undone by cancelling its records (07-purchasing.md, Fixing a mistake).
CREATE FUNCTION "purchasing_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'Purchases are append-only: % is refused.', TG_OP
		USING ERRCODE = 'check_violation',
			CONSTRAINT = TG_TABLE_NAME || '_append_only',
			TABLE = TG_TABLE_NAME;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "purchase_trips_append_only"
	BEFORE UPDATE OR DELETE ON "purchase_trips"
	FOR EACH ROW EXECUTE FUNCTION "purchasing_append_only"();--> statement-breakpoint
CREATE TRIGGER "purchase_extras_append_only"
	BEFORE UPDATE OR DELETE ON "purchase_extras"
	FOR EACH ROW EXECUTE FUNCTION "purchasing_append_only"();--> statement-breakpoint
CREATE TRIGGER "trip_files_append_only"
	BEFORE UPDATE OR DELETE ON "trip_files"
	FOR EACH ROW EXECUTE FUNCTION "purchasing_append_only"();--> statement-breakpoint
CREATE TRIGGER "purchase_trips_append_only_truncate"
	BEFORE TRUNCATE ON "purchase_trips"
	FOR EACH STATEMENT EXECUTE FUNCTION "purchasing_append_only"();--> statement-breakpoint
CREATE TRIGGER "purchase_extras_append_only_truncate"
	BEFORE TRUNCATE ON "purchase_extras"
	FOR EACH STATEMENT EXECUTE FUNCTION "purchasing_append_only"();--> statement-breakpoint
CREATE TRIGGER "trip_files_append_only_truncate"
	BEFORE TRUNCATE ON "trip_files"
	FOR EACH STATEMENT EXECUTE FUNCTION "purchasing_append_only"();
