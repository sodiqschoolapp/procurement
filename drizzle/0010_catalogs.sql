CREATE TYPE "public"."company_kind" AS ENUM('BRAND', 'SUPPLIER', 'BOTH');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"client_key" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "categories_client_key_key" UNIQUE("client_key"),
	CONSTRAINT "categories_name_check" CHECK (btrim("categories"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "company_kind" NOT NULL,
	"tax_id" text,
	"phone" text,
	"note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"client_key" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "companies_client_key_key" UNIQUE("client_key"),
	CONSTRAINT "companies_name_check" CHECK (btrim("companies"."name") <> ''),
	CONSTRAINT "companies_tax_id_check" CHECK ("companies"."tax_id" IS NULL OR btrim("companies"."tax_id") <> ''),
	CONSTRAINT "companies_phone_check" CHECK ("companies"."phone" IS NULL OR btrim("companies"."phone") <> ''),
	CONSTRAINT "companies_note_check" CHECK ("companies"."note" IS NULL OR btrim("companies"."note") <> '')
);
--> statement-breakpoint
CREATE TABLE "extra_cost_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"client_key" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "extra_cost_types_client_key_key" UNIQUE("client_key"),
	CONSTRAINT "extra_cost_types_name_check" CHECK (btrim("extra_cost_types"."name") <> '')
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"allow_decimal" boolean NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"client_key" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "units_client_key_key" UNIQUE("client_key"),
	CONSTRAINT "units_name_check" CHECK (btrim("units"."name") <> ''),
	CONSTRAINT "units_short_name_check" CHECK (btrim("units"."short_name") <> '')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "categories_name_key" ON "categories" USING btree (lower(regexp_replace(btrim("name"), '\s+', ' ', 'g')));--> statement-breakpoint
CREATE INDEX "categories_is_active_idx" ON "categories" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "companies_name_key" ON "companies" USING btree (lower(regexp_replace(btrim("name"), '\s+', ' ', 'g')));--> statement-breakpoint
CREATE INDEX "companies_is_active_kind_idx" ON "companies" USING btree ("is_active","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "extra_cost_types_name_key" ON "extra_cost_types" USING btree (lower(regexp_replace(btrim("name"), '\s+', ' ', 'g')));--> statement-breakpoint
CREATE INDEX "extra_cost_types_is_active_idx" ON "extra_cost_types" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "units_name_key" ON "units" USING btree (lower(regexp_replace(btrim("name"), '\s+', ' ', 'g')));--> statement-breakpoint
CREATE UNIQUE INDEX "units_short_name_key" ON "units" USING btree (lower(regexp_replace(btrim("short_name"), '\s+', ' ', 'g')));--> statement-breakpoint
CREATE INDEX "units_is_active_idx" ON "units" USING btree ("is_active");