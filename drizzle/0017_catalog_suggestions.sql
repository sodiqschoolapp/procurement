CREATE TYPE "public"."suggestion_status" AS ENUM('PENDING', 'ADDED', 'DECLINED');--> statement-breakpoint
CREATE TABLE "catalog_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"suggested_by" uuid NOT NULL,
	"name" text NOT NULL,
	"unit_text" text NOT NULL,
	"photo_file_id" uuid,
	"note" text,
	"status" "suggestion_status" NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"product_id" uuid,
	"client_key" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "catalog_suggestions_client_key_key" UNIQUE("client_key"),
	CONSTRAINT "catalog_suggestions_photo_file_id_key" UNIQUE("photo_file_id"),
	CONSTRAINT "catalog_suggestions_product_id_key" UNIQUE("product_id"),
	CONSTRAINT "catalog_suggestions_name_check" CHECK (btrim("catalog_suggestions"."name") <> ''),
	CONSTRAINT "catalog_suggestions_unit_text_check" CHECK (btrim("catalog_suggestions"."unit_text") <> ''),
	CONSTRAINT "catalog_suggestions_note_check" CHECK ("catalog_suggestions"."note" IS NULL OR btrim("catalog_suggestions"."note") <> ''),
	CONSTRAINT "catalog_suggestions_decision_note_check" CHECK ("catalog_suggestions"."decision_note" IS NULL OR btrim("catalog_suggestions"."decision_note") <> ''),
	CONSTRAINT "catalog_suggestions_decision_check" CHECK (CASE "catalog_suggestions"."status"
        WHEN 'PENDING' THEN "catalog_suggestions"."decided_by" IS NULL AND "catalog_suggestions"."decided_at" IS NULL
          AND "catalog_suggestions"."decision_note" IS NULL AND "catalog_suggestions"."product_id" IS NULL
        WHEN 'ADDED' THEN "catalog_suggestions"."decided_by" IS NOT NULL AND "catalog_suggestions"."decided_at" IS NOT NULL
          AND "catalog_suggestions"."product_id" IS NOT NULL
        ELSE "catalog_suggestions"."decided_by" IS NOT NULL AND "catalog_suggestions"."decided_at" IS NOT NULL
          AND "catalog_suggestions"."decision_note" IS NOT NULL AND "catalog_suggestions"."product_id" IS NULL
      END)
);
--> statement-breakpoint
ALTER TABLE "catalog_suggestions" ADD CONSTRAINT "catalog_suggestions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_suggestions" ADD CONSTRAINT "catalog_suggestions_suggested_by_users_id_fk" FOREIGN KEY ("suggested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_suggestions" ADD CONSTRAINT "catalog_suggestions_photo_file_id_files_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_suggestions" ADD CONSTRAINT "catalog_suggestions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_suggestions" ADD CONSTRAINT "catalog_suggestions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_suggestions_branch_status_idx" ON "catalog_suggestions" USING btree ("branch_id","status","created_at");--> statement-breakpoint
CREATE INDEX "catalog_suggestions_status_idx" ON "catalog_suggestions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "catalog_suggestions_suggested_by_idx" ON "catalog_suggestions" USING btree ("suggested_by");--> statement-breakpoint
CREATE INDEX "catalog_suggestions_decided_by_idx" ON "catalog_suggestions" USING btree ("decided_by");--> statement-breakpoint
-- Written by hand (decisions 0.2, style 13). A suggestion is never deleted (CLAUDE.md rule 11: it
-- is never a draft) and is decided once: only PENDING moves, to ADDED or DECLINED, and only the
-- decision columns change with it; a decided row never changes again (04-catalogs.md rule 8; plan
-- of 1.12, decision 9). The shape CHECK above says which decision columns each status carries.
CREATE FUNCTION "catalog_suggestions_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'A product suggestion is never deleted.'
			USING ERRCODE = 'check_violation',
				CONSTRAINT = 'catalog_suggestions_no_delete',
				TABLE = 'catalog_suggestions';
	END IF;
	IF OLD."status" <> 'PENDING' OR NEW."status" = 'PENDING' THEN
		RAISE EXCEPTION 'A product suggestion is decided once, from PENDING to ADDED or DECLINED.'
			USING ERRCODE = 'check_violation',
				CONSTRAINT = 'catalog_suggestions_decided_once',
				TABLE = 'catalog_suggestions';
	END IF;
	IF NEW."id" <> OLD."id"
		OR NEW."branch_id" <> OLD."branch_id"
		OR NEW."suggested_by" <> OLD."suggested_by"
		OR NEW."name" <> OLD."name"
		OR NEW."unit_text" <> OLD."unit_text"
		OR NEW."photo_file_id" IS DISTINCT FROM OLD."photo_file_id"
		OR NEW."note" IS DISTINCT FROM OLD."note"
		OR NEW."client_key" IS DISTINCT FROM OLD."client_key"
		OR NEW."created_at" <> OLD."created_at" THEN
		RAISE EXCEPTION 'A product suggestion keeps what was sent; only the decision is written.'
			USING ERRCODE = 'check_violation',
				CONSTRAINT = 'catalog_suggestions_sent_fixed',
				TABLE = 'catalog_suggestions';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "catalog_suggestions_guard"
	BEFORE UPDATE OR DELETE ON "catalog_suggestions"
	FOR EACH ROW EXECUTE FUNCTION "catalog_suggestions_guard"();
