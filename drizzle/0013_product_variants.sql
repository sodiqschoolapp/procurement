CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"photo_file_id" uuid,
	"reference_price" bigint,
	"last_purchase_price" bigint,
	"last_purchase_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"client_key" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "product_variants_client_key_key" UNIQUE("client_key"),
	CONSTRAINT "product_variants_photo_file_id_key" UNIQUE("photo_file_id"),
	CONSTRAINT "product_variants_name_check" CHECK (btrim("product_variants"."name") <> ''),
	CONSTRAINT "product_variants_reference_price_check" CHECK ("product_variants"."reference_price" IS NULL OR "product_variants"."reference_price" > 0),
	CONSTRAINT "product_variants_last_purchase_price_check" CHECK ("product_variants"."last_purchase_price" IS NULL OR "product_variants"."last_purchase_price" > 0)
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "has_variants" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_photo_file_id_files_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_product_name_key" ON "product_variants" USING btree ("product_id",lower(regexp_replace(btrim("name"), '\s+', ' ', 'g')));--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_default_key" ON "product_variants" USING btree ("product_id") WHERE "product_variants"."is_default";--> statement-breakpoint
CREATE INDEX "product_variants_product_id_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_variants_is_active_idx" ON "product_variants" USING btree ("is_active");--> statement-breakpoint
-- Written by hand (decisions 0.2, style 13). Every product made before this migration gets its
-- hidden default subtype holding its reference price (04-catalogs.md rule 1; plan of 1.8,
-- decision 2), so the shape trigger below holds for the rows already there.
INSERT INTO "product_variants" ("product_id", "name", "is_default", "reference_price", "created_at")
	SELECT "id", 'default', true, "reference_price", "created_at" FROM "products";--> statement-breakpoint
-- "Inside the database every product has at least one subtype. A product without subtypes gets
-- one hidden subtype called 'default'" (04 rule 1). Deferred, checked at commit, so a product and
-- its default row, or the default made real and `has_variants`, are written in one transaction.
-- With has_variants false the product has exactly one row and it is the default; with true it
-- has no default row (plan of 1.8, decisions 1, 3, 7). Refuses with check_violation and names
-- itself as the constraint. Subtypes are never deleted (the guard below), so no DELETE branch.
CREATE FUNCTION "product_variants_shape_of"("checked_product" uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
	"variant_count" integer;
	"default_count" integer;
	"with_variants" boolean;
BEGIN
	SELECT "has_variants" INTO "with_variants" FROM "products" WHERE "id" = "checked_product";
	IF NOT FOUND THEN
		RETURN;
	END IF;
	SELECT count(*), count(*) FILTER (WHERE "is_default")
		INTO "variant_count", "default_count"
		FROM "product_variants" WHERE "product_id" = "checked_product";
	IF "variant_count" = 0
		OR (NOT "with_variants" AND ("variant_count" <> 1 OR "default_count" <> 1))
		OR ("with_variants" AND "default_count" <> 0) THEN
		RAISE EXCEPTION 'A product has one hidden default subtype or only real subtypes (product %).', "checked_product"
			USING ERRCODE = 'check_violation',
				CONSTRAINT = 'product_variants_shape',
				TABLE = 'product_variants';
	END IF;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "product_variants_shape"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF TG_TABLE_NAME = 'products' THEN
		PERFORM "product_variants_shape_of"(NEW."id");
	ELSE
		IF TG_OP = 'UPDATE' AND OLD."product_id" <> NEW."product_id" THEN
			PERFORM "product_variants_shape_of"(OLD."product_id");
		END IF;
		PERFORM "product_variants_shape_of"(NEW."product_id");
	END IF;
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "product_variants_shape"
	AFTER INSERT OR UPDATE OF "has_variants" ON "products"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION "product_variants_shape"();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "product_variants_shape"
	AFTER INSERT OR UPDATE OF "product_id", "is_default" ON "product_variants"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION "product_variants_shape"();--> statement-breakpoint
-- A subtype is never deleted, only deactivated (CLAUDE.md rule 11; 04 rule 2). It never moves to
-- another product and a real subtype never becomes the hidden default again, so every line, stock
-- row and price that points at a subtype stays with its product (07-purchasing.md, Substitution:
-- "It must belong to the same product"; plan review of 1.8, Must fix 1).
CREATE FUNCTION "product_variants_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'A subtype is never deleted; it is deactivated.'
			USING ERRCODE = 'check_violation',
				CONSTRAINT = 'product_variants_no_delete',
				TABLE = 'product_variants';
	END IF;
	IF NEW."product_id" <> OLD."product_id" THEN
		RAISE EXCEPTION 'A subtype never moves to another product.'
			USING ERRCODE = 'check_violation',
				CONSTRAINT = 'product_variants_product_fixed',
				TABLE = 'product_variants';
	END IF;
	IF NEW."is_default" AND NOT OLD."is_default" THEN
		RAISE EXCEPTION 'A real subtype never becomes the hidden default.'
			USING ERRCODE = 'check_violation',
				CONSTRAINT = 'product_variants_default_once',
				TABLE = 'product_variants';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "product_variants_guard"
	BEFORE UPDATE OF "product_id", "is_default" OR DELETE ON "product_variants"
	FOR EACH ROW EXECUTE FUNCTION "product_variants_guard"();
