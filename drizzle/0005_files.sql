CREATE TYPE "public"."file_mime" AS ENUM('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf');--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime" "file_mime" NOT NULL,
	"size_bytes" bigint NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"client_key" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "files_storage_key_key" UNIQUE("storage_key"),
	CONSTRAINT "files_client_key_key" UNIQUE("client_key"),
	CONSTRAINT "files_original_name_check" CHECK (char_length("files"."original_name") BETWEEN 1 AND 255),
	CONSTRAINT "files_size_bytes_check" CHECK ("files"."size_bytes" > 0 AND "files"."size_bytes" <= 10485760)
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_uploaded_by_idx" ON "files" USING btree ("uploaded_by");--> statement-breakpoint
-- Written by hand (decisions 0.2, style 13): Drizzle cannot express a trigger. A file row never
-- changes and is never deleted (CLAUDE.md rule 11; plan of 0.12): the objects it names stay what
-- was uploaded. UPDATE, DELETE and TRUNCATE are refused with check_violation, naming files_guard
-- as the constraint.
CREATE FUNCTION "files_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'A file row is never changed or deleted: % is refused.', TG_OP
		USING ERRCODE = 'check_violation',
			CONSTRAINT = 'files_guard',
			TABLE = 'files';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "files_guard"
	BEFORE UPDATE OR DELETE ON "files"
	FOR EACH ROW EXECUTE FUNCTION "files_guard"();--> statement-breakpoint
CREATE TRIGGER "files_guard_truncate"
	BEFORE TRUNCATE ON "files"
	FOR EACH STATEMENT EXECUTE FUNCTION "files_guard"();
