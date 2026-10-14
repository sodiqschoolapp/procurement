ALTER TABLE "users" ADD COLUMN "client_key" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_client_key_key" UNIQUE("client_key");--> statement-breakpoint
-- Written by hand (decisions 0.2, style 13): Drizzle cannot express a constraint trigger.
-- "At least one active Head must always exist. The last one cannot be deactivated" (03 rule 4;
-- plan of 1.3, Look first 4). Deferred to commit, so an action may deactivate and activate in one
-- transaction. It first takes the advisory lock every user action takes (users_active_head), so
-- two transactions that each deactivate a different Head count one after the other: the second
-- counts after the first's commit and is refused (review of the plan of 1.3, Must fix 1). Only an
-- update is guarded: users are never deleted (CLAUDE.md rule 11), and the first-Head script starts
-- from an empty table.
CREATE FUNCTION "users_keep_one_active_head"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	PERFORM pg_advisory_xact_lock(hashtextextended('users_active_head', 0));
	IF NOT EXISTS (SELECT 1 FROM "users" WHERE "role" = 'HEAD' AND "is_active") THEN
		RAISE EXCEPTION 'At least one active Head must exist.'
			USING ERRCODE = 'check_violation',
				CONSTRAINT = 'users_keep_one_active_head',
				TABLE = 'users';
	END IF;
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "users_keep_one_active_head"
	AFTER UPDATE OF "is_active", "role" ON "users"
	DEFERRABLE INITIALLY DEFERRED
	FOR EACH ROW
	WHEN (OLD."role" = 'HEAD' AND OLD."is_active" AND (NEW."role" <> 'HEAD' OR NOT NEW."is_active"))
	EXECUTE FUNCTION "users_keep_one_active_head"();
