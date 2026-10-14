CREATE TYPE "public"."manager_right" AS ENUM('CREATE_REQUESTS', 'RECORD_PURCHASES', 'CANCEL_PURCHASES', 'CLOSE_ALONE', 'ISSUE_STOCK', 'RETURN_REVERSE', 'TRANSFER_STOCK', 'WRITE_OFF_COUNT', 'SET_MINIMUMS');--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"address" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "branches_code_key" UNIQUE("code"),
	CONSTRAINT "branches_code_check" CHECK ("branches"."code" ~ '^[A-Z]{2,4}$'),
	CONSTRAINT "branches_name_check" CHECK (btrim("branches"."name") <> ''),
	CONSTRAINT "branches_address_check" CHECK (btrim("branches"."address") <> '')
);
--> statement-breakpoint
CREATE TABLE "manager_rights" (
	"user_id" uuid NOT NULL,
	"right" "manager_right" NOT NULL,
	"enabled" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "manager_rights_pkey" PRIMARY KEY("user_id","right")
);
--> statement-breakpoint
CREATE TABLE "user_branches" (
	"user_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"user_role" "user_role" NOT NULL,
	"user_is_active" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_branches_pkey" PRIMARY KEY("user_id","branch_id"),
	CONSTRAINT "user_branches_user_role_check" CHECK ("user_branches"."user_role" <> 'HEAD')
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_role_is_active_key" UNIQUE("id","role","is_active");--> statement-breakpoint
ALTER TABLE "manager_rights" ADD CONSTRAINT "manager_rights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_user_fk" FOREIGN KEY ("user_id","user_role","user_is_active") REFERENCES "public"."users"("id","role","is_active") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "branches_name_key" ON "branches" USING btree (lower(regexp_replace(btrim("name"), '\s+', ' ', 'g')));--> statement-breakpoint
CREATE INDEX "user_branches_branch_id_idx" ON "user_branches" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_branches_principal_user_id_key" ON "user_branches" USING btree ("user_id") WHERE "user_branches"."user_role" = 'PRINCIPAL';--> statement-breakpoint
CREATE UNIQUE INDEX "user_branches_active_principal_branch_id_key" ON "user_branches" USING btree ("branch_id") WHERE "user_branches"."user_role" = 'PRINCIPAL' AND "user_branches"."user_is_active";--> statement-breakpoint
-- Written by hand (decisions 0.2, style 13): Drizzle cannot express a constraint trigger.
-- "exactly one row for PRINCIPAL" (14-data-model.md, user_branches). At most one is the partial
-- unique index user_branches_principal_user_id_key; this deferred trigger is the "at least one"
-- half, checked at commit, so a Principal and its row can be written in one transaction. It
-- refuses with check_violation and names itself as the constraint (review of the plan of 0.7,
-- correction 2), whatever the user's is_active.
CREATE FUNCTION "user_branches_principal_has_one_branch_of"("checked_user" uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
	IF EXISTS (SELECT 1 FROM "users" WHERE "id" = "checked_user" AND "role" = 'PRINCIPAL')
		AND (SELECT count(*) FROM "user_branches" WHERE "user_id" = "checked_user") <> 1 THEN
		RAISE EXCEPTION 'A Principal has exactly one branch (user %).', "checked_user"
			USING ERRCODE = 'check_violation',
				CONSTRAINT = 'user_branches_principal_has_one_branch',
				TABLE = 'user_branches';
	END IF;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "user_branches_principal_has_one_branch"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF TG_TABLE_NAME = 'users' THEN
		PERFORM "user_branches_principal_has_one_branch_of"(NEW."id");
	ELSE
		IF TG_OP IN ('UPDATE', 'DELETE') THEN
			PERFORM "user_branches_principal_has_one_branch_of"(OLD."user_id");
		END IF;
		IF TG_OP IN ('INSERT', 'UPDATE') THEN
			PERFORM "user_branches_principal_has_one_branch_of"(NEW."user_id");
		END IF;
	END IF;
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "user_branches_principal_has_one_branch"
	AFTER INSERT OR UPDATE OF "role" ON "users"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION "user_branches_principal_has_one_branch"();--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "user_branches_principal_has_one_branch"
	AFTER INSERT OR UPDATE OR DELETE ON "user_branches"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW EXECUTE FUNCTION "user_branches_principal_has_one_branch"();
