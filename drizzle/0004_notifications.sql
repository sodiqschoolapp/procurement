CREATE TYPE "public"."notification_type" AS ENUM('REQUEST_SUBMITTED', 'REQUEST_HEAD_APPROVED', 'REQUEST_PRINCIPAL_APPROVED', 'REQUEST_FINANCE_APPROVED', 'REQUEST_SENT_BACK', 'REQUEST_REJECTED', 'CASH_GIVEN', 'CASH_RETURNED', 'CASH_PAID_BACK', 'REQUEST_SENT_TO_SETTLEMENT', 'OVERSPEND_ABOVE_GUARD', 'OVERSPEND_ACKNOWLEDGED', 'REQUEST_CLOSED', 'REQUEST_REOPENED', 'REQUEST_WAITING_24H', 'REQUEST_WAITING_48H', 'NEEDED_BY_NEAR', 'PRODUCT_SUGGESTED', 'PRODUCT_SUGGESTION_DECIDED', 'STOCK_CHANGE_ASKED', 'STOCK_CHANGE_DECIDED', 'TRANSFER_SENT', 'MINIMUM_STOCK_REACHED', 'BRANCH_ROLE_VACANT', 'PURCHASE_CANCELLED', 'PRICE_DIFFERS', 'MANAGER_RIGHT_SWITCHED');--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"link" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "notifications_params_check" CHECK (jsonb_typeof("notifications"."params") = 'object'),
	CONSTRAINT "notifications_link_check" CHECK ("notifications"."link" ~ '^/([^/\\]|$)' AND "notifications"."link" !~ '[[:space:][:cntrl:]]'),
	CONSTRAINT "notifications_read_at_check" CHECK ("notifications"."read_at" IS NULL OR "notifications"."read_at" >= "notifications"."created_at")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_user_id_unread_idx" ON "notifications" USING btree ("user_id") WHERE "notifications"."read_at" IS NULL;--> statement-breakpoint
-- Written by hand (decisions 0.2, style 13): Drizzle cannot express a trigger. A notification is
-- never deleted and changes only once, `read_at` from NULL to a moment (plan of 0.11, decision 3,
-- Look first; CLAUDE.md rule 11): what the person was told stays as it was told. DELETE,
-- TRUNCATE and any other UPDATE are refused with check_violation, naming notifications_guard as
-- the constraint.
CREATE FUNCTION "notifications_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'UPDATE'
		AND OLD.read_at IS NULL
		AND NEW.read_at IS NOT NULL
		AND NEW.id = OLD.id
		AND NEW.user_id = OLD.user_id
		AND NEW.type = OLD.type
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
$$;--> statement-breakpoint
CREATE TRIGGER "notifications_guard"
	BEFORE UPDATE OR DELETE ON "notifications"
	FOR EACH ROW EXECUTE FUNCTION "notifications_guard"();--> statement-breakpoint
CREATE TRIGGER "notifications_guard_truncate"
	BEFORE TRUNCATE ON "notifications"
	FOR EACH STATEMENT EXECUTE FUNCTION "notifications_guard"();
