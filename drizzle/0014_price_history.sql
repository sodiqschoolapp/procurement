CREATE TYPE "public"."price_source" AS ENUM('HEAD', 'PURCHASE');--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "price_history_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"variant_id" uuid NOT NULL,
	"price" bigint NOT NULL,
	"source" "price_source" NOT NULL,
	"note" text,
	"set_by" uuid NOT NULL,
	"purchase_id" uuid,
	"client_key" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "price_history_seq_key" UNIQUE("seq"),
	CONSTRAINT "price_history_client_key_key" UNIQUE("client_key"),
	CONSTRAINT "price_history_price_check" CHECK ("price_history"."price" > 0),
	CONSTRAINT "price_history_note_check" CHECK ("price_history"."note" IS NULL OR btrim("price_history"."note") <> ''),
	CONSTRAINT "price_history_purchase_check" CHECK (("price_history"."source" = 'HEAD') = ("price_history"."purchase_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_history_variant_id_seq_idx" ON "price_history" USING btree ("variant_id","seq" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "price_history_set_by_idx" ON "price_history" USING btree ("set_by");--> statement-breakpoint
CREATE INDEX "price_history_purchase_id_idx" ON "price_history" USING btree ("purchase_id");--> statement-breakpoint
-- Written by hand (decisions 0.2, style 13). Every price set before this migration gets its HEAD
-- row (progress 1.7 and 1.8, "For 1.9"; plan of 1.9, decision 1, Look first), with no note, as
-- the price typed at creation has none. Who and when come from the audit row that set it: the
-- subtype's own `subtype.create` row when it set the price (a new subtype, or the first subtype
-- that took a price the default did not hold), otherwise the product's `product.create` row (the
-- default's price, kept by a first subtype made from it; plan review of 1.9, Should fix 1). A row
-- that has neither falls back to the subtype's own time and the oldest Head; only when such a row
-- exists and no Head does is the migration refused (Should fix 2). An empty database migrates.
CREATE TEMPORARY TABLE "price_history_backfill" ON COMMIT DROP AS
	SELECT
		"v"."id" AS "variant_id",
		"v"."reference_price" AS "price",
		coalesce("by_subtype"."actor_id", "by_product"."actor_id", (
			SELECT "u"."id" FROM "users" "u" WHERE "u"."role" = 'HEAD'
			ORDER BY "u"."created_at", "u"."id" LIMIT 1
		)) AS "set_by",
		coalesce("by_subtype"."created_at", "by_product"."created_at", "v"."created_at") AS "created_at"
	FROM "product_variants" "v"
	LEFT JOIN LATERAL (
		SELECT "a"."actor_id", "a"."created_at" FROM "audit_log" "a"
		WHERE "a"."entity" = 'product_variants' AND "a"."action" = 'subtype.create'
			AND "a"."entity_id" = "v"."id"::text
			AND ("a"."after"->'fromDefault' IS NULL OR "a"."before"->>'referencePrice' IS NULL)
		ORDER BY "a"."created_at", "a"."id" LIMIT 1
	) "by_subtype" ON true
	LEFT JOIN LATERAL (
		SELECT "a"."actor_id", "a"."created_at" FROM "audit_log" "a"
		WHERE "a"."entity" = 'products' AND "a"."action" = 'product.create'
			AND "a"."entity_id" = "v"."product_id"::text
		ORDER BY "a"."created_at", "a"."id" LIMIT 1
	) "by_product" ON "by_subtype"."actor_id" IS NULL
	WHERE "v"."reference_price" IS NOT NULL;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "price_history_backfill" WHERE "set_by" IS NULL) THEN
		RAISE EXCEPTION 'A price has no audit row and there is no Head to credit it to.'
			USING ERRCODE = 'check_violation',
				CONSTRAINT = 'price_history_backfill',
				TABLE = 'price_history';
	END IF;
END;
$$;--> statement-breakpoint
INSERT INTO "price_history" ("variant_id", "price", "source", "note", "set_by", "created_at")
	SELECT "variant_id", "price", 'HEAD', NULL, "set_by", "created_at" FROM "price_history_backfill"
	ORDER BY "created_at", "variant_id";--> statement-breakpoint
-- The price history is append-only (plan of 1.9, decision 3, Look first; 04-catalogs.md rule 4:
-- "older prices stay in the price history"), as audit_log, notifications and files: UPDATE,
-- DELETE and TRUNCATE are refused with check_violation, naming price_history_append_only.
CREATE FUNCTION "price_history_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'The price history is append-only: % is refused.', TG_OP
		USING ERRCODE = 'check_violation',
			CONSTRAINT = 'price_history_append_only',
			TABLE = 'price_history';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "price_history_append_only"
	BEFORE UPDATE OR DELETE ON "price_history"
	FOR EACH ROW EXECUTE FUNCTION "price_history_append_only"();--> statement-breakpoint
CREATE TRIGGER "price_history_append_only_truncate"
	BEFORE TRUNCATE ON "price_history"
	FOR EACH STATEMENT EXECUTE FUNCTION "price_history_append_only"();--> statement-breakpoint
-- A subtype's reference price is the price of its newest HEAD row, by `seq` (plan of 1.9,
-- decision 2, Look first; CLAUDE.md rule 5): a price changed without its row, a HEAD row written
-- without the price change, and a price set back to empty are each refused. Deferred, checked at
-- commit, so the price and its row are written in one transaction in either order. Fires on
-- `reference_price` only, so renaming or deactivating a subtype is not checked. Refuses with
-- check_violation and names price_recorded as the constraint.
CREATE FUNCTION "price_recorded_of"("checked_variant" uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
	"current_price" bigint;
	"newest_price" bigint;
	"has_row" boolean;
BEGIN
	SELECT "reference_price" INTO "current_price" FROM "product_variants" WHERE "id" = "checked_variant";
	IF NOT FOUND THEN
		RETURN;
	END IF;
	SELECT "price" INTO "newest_price" FROM "price_history"
		WHERE "variant_id" = "checked_variant" AND "source" = 'HEAD'
		ORDER BY "seq" DESC LIMIT 1;
	"has_row" := FOUND;
	IF ("current_price" IS NULL AND "has_row")
		OR ("current_price" IS NOT NULL AND (NOT "has_row" OR "newest_price" <> "current_price")) THEN
		RAISE EXCEPTION 'A subtype''s reference price is the price of its newest HEAD history row (subtype %).', "checked_variant"
			USING ERRCODE = 'check_violation',
				CONSTRAINT = 'price_recorded',
				TABLE = 'product_variants';
	END IF;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "price_recorded"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF TG_TABLE_NAME = 'price_history' THEN
		PERFORM "price_recorded_of"(NEW."variant_id");
	ELSE
		PERFORM "price_recorded_of"(NEW."id");
	END IF;
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "price_recorded"
	AFTER INSERT OR UPDATE OF "reference_price" ON "product_variants"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION "price_recorded"();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "price_recorded"
	AFTER INSERT ON "price_history"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW WHEN (NEW."source" = 'HEAD')
	EXECUTE FUNCTION "price_recorded"();
