CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "audit_log_action_check" CHECK ("audit_log"."action" ~ '^[a-z][a-z_]*\.[a-z][a-z_]*$'),
	CONSTRAINT "audit_log_entity_check" CHECK ("audit_log"."entity" ~ '^[a-z][a-z_]*$'),
	CONSTRAINT "audit_log_entity_id_check" CHECK (btrim("audit_log"."entity_id") <> ''),
	CONSTRAINT "audit_log_before_check" CHECK ("audit_log"."before" IS NULL OR jsonb_typeof("audit_log"."before") = 'object'),
	CONSTRAINT "audit_log_after_check" CHECK ("audit_log"."after" IS NULL OR jsonb_typeof("audit_log"."after") = 'object'),
	CONSTRAINT "audit_log_before_or_after_check" CHECK ("audit_log"."before" IS NOT NULL OR "audit_log"."after" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity_entity_id_created_at_idx" ON "audit_log" USING btree ("entity","entity_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_actor_id_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
-- Written by hand (decisions 0.2, style 13): Drizzle cannot express a trigger. audit_log is
-- append-only (plan of 0.9, decision 2, Look first): a row that can be changed or removed cannot
-- show "who changed what and when" (04-catalogs.md rule 9). UPDATE, DELETE and TRUNCATE are
-- refused with check_violation, naming audit_log_append_only as the constraint.
CREATE FUNCTION "audit_log_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'The audit log is append-only: % is refused.', TG_OP
		USING ERRCODE = 'check_violation',
			CONSTRAINT = 'audit_log_append_only',
			TABLE = 'audit_log';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "audit_log_append_only"
	BEFORE UPDATE OR DELETE ON "audit_log"
	FOR EACH ROW EXECUTE FUNCTION "audit_log_append_only"();--> statement-breakpoint
CREATE TRIGGER "audit_log_append_only_truncate"
	BEFORE TRUNCATE ON "audit_log"
	FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_append_only"();
