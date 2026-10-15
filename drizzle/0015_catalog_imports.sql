CREATE TYPE "public"."import_kind" AS ENUM('PRODUCTS', 'DEPARTMENTS');--> statement-breakpoint
CREATE TABLE "catalog_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "import_kind" NOT NULL,
	"file_name" text NOT NULL,
	"row_count" integer NOT NULL,
	"created_by" uuid NOT NULL,
	"client_key" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "catalog_imports_client_key_key" UNIQUE("client_key"),
	CONSTRAINT "catalog_imports_row_count_check" CHECK ("catalog_imports"."row_count" > 0),
	CONSTRAINT "catalog_imports_file_name_check" CHECK (btrim("catalog_imports"."file_name") <> '' AND char_length("catalog_imports"."file_name") <= 255)
);
--> statement-breakpoint
ALTER TABLE "catalog_imports" ADD CONSTRAINT "catalog_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_imports_created_by_idx" ON "catalog_imports" USING btree ("created_by");