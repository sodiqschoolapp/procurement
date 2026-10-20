-- Task 2.3b: a notification carries its branch, and three notices of 10 Notifications ("Cancelled
-- by someone other than its owner", "Orders moved to another Manager", for the new and the old
-- owner). `branch_id` is empty for a notice of no branch and for every row written before this
-- migration, which always show (14 notifications; plan of 2.3b, decided item 7). No statement of
-- this migration uses the new enum values, so ADD VALUE may run inside the migration's transaction.
ALTER TYPE "public"."notification_type" ADD VALUE 'REQUEST_CANCELLED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'REQUEST_MOVED_IN';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'REQUEST_MOVED_OUT';--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_branch_id_idx" ON "notifications" USING btree ("branch_id");--> statement-breakpoint
-- notifications_guard of 0004 lets an update set read_at only; it now also holds branch_id, so
-- marking a row read can never move it to another branch (CLAUDE.md rule 5).
CREATE OR REPLACE FUNCTION "notifications_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'UPDATE'
		AND OLD.read_at IS NULL
		AND NEW.read_at IS NOT NULL
		AND NEW.id = OLD.id
		AND NEW.user_id = OLD.user_id
		AND NEW.type = OLD.type
		AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id
		AND NEW.params = OLD.params
		AND NEW.link = OLD.link
		AND NEW.created_at = OLD.created_at
	THEN
		RETURN NEW;
	END IF;
	RAISE EXCEPTION 'A notification is only marked read once: % is refused.', TG_OP
		USING ERRCODE = 'check_violation',
			CONSTRAINT = 'notifications_guard',
			TABLE = 'notifications';
END;
$$;
