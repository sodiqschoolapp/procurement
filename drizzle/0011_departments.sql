CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" text NOT NULL,
	"responsible_name" text,
	"responsible_phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"client_key" uuid,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "departments_client_key_key" UNIQUE("client_key"),
	CONSTRAINT "departments_name_check" CHECK (btrim("departments"."name") <> ''),
	CONSTRAINT "departments_responsible_name_check" CHECK ("departments"."responsible_name" IS NULL OR btrim("departments"."responsible_name") <> ''),
	CONSTRAINT "departments_responsible_phone_check" CHECK ("departments"."responsible_phone" IS NULL OR btrim("departments"."responsible_phone") <> '')
);
--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "departments_branch_name_key" ON "departments" USING btree ("branch_id",lower(regexp_replace(btrim("name"), '\s+', ' ', 'g')));--> statement-breakpoint
CREATE INDEX "departments_is_active_idx" ON "departments" USING btree ("is_active");