CREATE TYPE "public"."product_type" AS ENUM('GOODS', 'SERVICE');--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "product_type" DEFAULT 'GOODS' NOT NULL,
	"category_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"photo_file_id" uuid,
	"default_company_id" uuid,
	"reference_price" bigint,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"client_key" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "products_client_key_key" UNIQUE("client_key"),
	CONSTRAINT "products_photo_file_id_key" UNIQUE("photo_file_id"),
	CONSTRAINT "products_name_check" CHECK (btrim("products"."name") <> ''),
	CONSTRAINT "products_description_check" CHECK ("products"."description" IS NULL OR btrim("products"."description") <> ''),
	CONSTRAINT "products_reference_price_check" CHECK ("products"."reference_price" IS NULL OR "products"."reference_price" > 0)
);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_photo_file_id_files_id_fk" FOREIGN KEY ("photo_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_default_company_id_companies_id_fk" FOREIGN KEY ("default_company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "products_name_key" ON "products" USING btree (lower(regexp_replace(btrim("name"), '\s+', ' ', 'g')));--> statement-breakpoint
CREATE INDEX "products_category_id_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_unit_id_idx" ON "products" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "products_default_company_id_idx" ON "products" USING btree ("default_company_id");--> statement-breakpoint
CREATE INDEX "products_is_active_idx" ON "products" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "products_type_idx" ON "products" USING btree ("type");