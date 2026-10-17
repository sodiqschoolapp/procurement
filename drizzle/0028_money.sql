-- Task 4.1, the money tables (14-data-model.md, Purchasing and money: money_actions, money_rows,
-- order_settlements). Nothing wrote money before, so the new tables meet no old row. Drizzle writes
-- the tables; the guards it cannot express are added by hand at the end (plan of 4.1).
CREATE TYPE "public"."money_row_kind" AS ENUM('CASH_GIVEN', 'CASH_RETURNED', 'PAID_BACK', 'BANK_TRANSFER', 'CARD_TOPUP', 'CARD_RETURNED');--> statement-breakpoint
CREATE TABLE "money_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_key" uuid NOT NULL,
	"order_action_id" uuid,
	"manager_id" uuid NOT NULL,
	"occurred_on" date NOT NULL,
	"supplier_id" uuid,
	"document_no" text,
	"file_id" uuid,
	"comment" text,
	"is_cancelled" boolean DEFAULT false NOT NULL,
	"cancel_reason" text,
	"cancelled_by" uuid,
	"cancelled_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "money_actions_client_key_manager_key" UNIQUE("client_key","manager_id"),
	CONSTRAINT "money_actions_file_id_key" UNIQUE("file_id"),
	CONSTRAINT "money_actions_document_no_check" CHECK (char_length("money_actions"."document_no") <= 100),
	CONSTRAINT "money_actions_comment_check" CHECK (char_length("money_actions"."comment") <= 1000),
	CONSTRAINT "money_actions_cancel_check" CHECK (CASE WHEN "money_actions"."is_cancelled"
        THEN btrim(coalesce("money_actions"."cancel_reason", '')) <> '' AND "money_actions"."cancelled_by" IS NOT NULL AND "money_actions"."cancelled_at" IS NOT NULL
        ELSE "money_actions"."cancel_reason" IS NULL AND "money_actions"."cancelled_by" IS NULL AND "money_actions"."cancelled_at" IS NULL
      END)
);
--> statement-breakpoint
CREATE TABLE "money_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"money_action_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"kind" "money_row_kind" NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "money_rows_action_order_key" UNIQUE("money_action_id","order_id"),
	CONSTRAINT "money_rows_amount_check" CHECK ("money_rows"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_settlements" (
	"order_id" uuid PRIMARY KEY NOT NULL,
	"transfer_confirmed_by" uuid,
	"transfer_confirmed_at" timestamp with time zone,
	"transfer_note" text,
	"card_confirmed_by" uuid,
	"card_confirmed_at" timestamp with time zone,
	"overspend_ack_by" uuid,
	"overspend_ack_at" timestamp with time zone,
	"overspend_ack_comment" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "order_settlements_transfer_check" CHECK (("order_settlements"."transfer_confirmed_by" IS NULL) = ("order_settlements"."transfer_confirmed_at" IS NULL)),
	CONSTRAINT "order_settlements_card_check" CHECK (("order_settlements"."card_confirmed_by" IS NULL) = ("order_settlements"."card_confirmed_at" IS NULL)),
	CONSTRAINT "order_settlements_ack_check" CHECK (CASE WHEN "order_settlements"."overspend_ack_by" IS NOT NULL
        THEN "order_settlements"."overspend_ack_at" IS NOT NULL AND btrim(coalesce("order_settlements"."overspend_ack_comment", '')) <> ''
        ELSE "order_settlements"."overspend_ack_at" IS NULL AND "order_settlements"."overspend_ack_comment" IS NULL
      END),
	CONSTRAINT "order_settlements_transfer_note_check" CHECK (char_length("order_settlements"."transfer_note") <= 1000),
	CONSTRAINT "order_settlements_ack_comment_check" CHECK (char_length("order_settlements"."overspend_ack_comment") <= 1000)
);
--> statement-breakpoint
ALTER TABLE "money_actions" ADD CONSTRAINT "money_actions_order_action_id_order_actions_id_fk" FOREIGN KEY ("order_action_id") REFERENCES "public"."order_actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_actions" ADD CONSTRAINT "money_actions_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_actions" ADD CONSTRAINT "money_actions_supplier_id_companies_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_actions" ADD CONSTRAINT "money_actions_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_actions" ADD CONSTRAINT "money_actions_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_actions" ADD CONSTRAINT "money_actions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_rows" ADD CONSTRAINT "money_rows_money_action_id_money_actions_id_fk" FOREIGN KEY ("money_action_id") REFERENCES "public"."money_actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_rows" ADD CONSTRAINT "money_rows_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_settlements" ADD CONSTRAINT "order_settlements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_settlements" ADD CONSTRAINT "order_settlements_transfer_confirmed_by_users_id_fk" FOREIGN KEY ("transfer_confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_settlements" ADD CONSTRAINT "order_settlements_card_confirmed_by_users_id_fk" FOREIGN KEY ("card_confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_settlements" ADD CONSTRAINT "order_settlements_overspend_ack_by_users_id_fk" FOREIGN KEY ("overspend_ack_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "money_actions_order_action_id_idx" ON "money_actions" USING btree ("order_action_id");--> statement-breakpoint
CREATE INDEX "money_actions_manager_id_idx" ON "money_actions" USING btree ("manager_id");--> statement-breakpoint
CREATE INDEX "money_actions_supplier_id_idx" ON "money_actions" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "money_actions_created_by_idx" ON "money_actions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "money_actions_cancelled_by_idx" ON "money_actions" USING btree ("cancelled_by");--> statement-breakpoint
CREATE INDEX "money_rows_order_id_idx" ON "money_rows" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_settlements_transfer_confirmed_by_idx" ON "order_settlements" USING btree ("transfer_confirmed_by");--> statement-breakpoint
CREATE INDEX "order_settlements_card_confirmed_by_idx" ON "order_settlements" USING btree ("card_confirmed_by");--> statement-breakpoint
CREATE INDEX "order_settlements_overspend_ack_by_idx" ON "order_settlements" USING btree ("overspend_ack_by");--> statement-breakpoint
-- A money action changes once, by its cancel (Decided ahead, question 3; developer-rules.md rule
-- 7): is_cancelled from false to true with cancel_reason, cancelled_by and cancelled_at
-- (money_actions_cancel_check holds the three together), every other column as it was written. Any
-- other UPDATE, a second cancel, an un-cancel, DELETE and TRUNCATE are refused. A cancelled
-- action's rows are left out of every count (08-money-and-settlement.md, Order's cash count).
CREATE FUNCTION "money_actions_cancel_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'UPDATE' AND NOT OLD."is_cancelled" AND NEW."is_cancelled"
		AND (to_jsonb(NEW) - ARRAY['is_cancelled', 'cancel_reason', 'cancelled_by', 'cancelled_at'])
			= (to_jsonb(OLD) - ARRAY['is_cancelled', 'cancel_reason', 'cancelled_by', 'cancelled_at'])
	THEN
		RETURN NEW;
	END IF;
	RAISE EXCEPTION 'A money action changes only by its one cancel: % is refused.', TG_OP
		USING ERRCODE = 'check_violation',
			CONSTRAINT = 'money_actions_cancel_only',
			TABLE = TG_TABLE_NAME;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "money_actions_cancel_only"
	BEFORE UPDATE OR DELETE ON "money_actions"
	FOR EACH ROW EXECUTE FUNCTION "money_actions_cancel_only"();--> statement-breakpoint
CREATE TRIGGER "money_actions_cancel_only_truncate"
	BEFORE TRUNCATE ON "money_actions"
	FOR EACH STATEMENT EXECUTE FUNCTION "money_actions_cancel_only"();--> statement-breakpoint
-- Money rows are append-only (developer-rules.md rule 7): a wrong row is undone by cancelling its
-- action whole (08 Money ledger).
CREATE FUNCTION "money_rows_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'Money rows are append-only: % is refused.', TG_OP
		USING ERRCODE = 'check_violation',
			CONSTRAINT = 'money_rows_append_only',
			TABLE = TG_TABLE_NAME;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "money_rows_append_only"
	BEFORE UPDATE OR DELETE ON "money_rows"
	FOR EACH ROW EXECUTE FUNCTION "money_rows_append_only"();--> statement-breakpoint
CREATE TRIGGER "money_rows_append_only_truncate"
	BEFORE TRUNCATE ON "money_rows"
	FOR EACH STATEMENT EXECUTE FUNCTION "money_rows_append_only"();--> statement-breakpoint
-- One Manager per action (08 Money ledger 1; plan of 4.1, decided items 4 and 12, Look first): a
-- row's order is owned by its action's Manager. Checked on the row's insert only: rows are never
-- updated, an action's Manager never changes, and an order's owner moves (4.10) only at a cash
-- balance of 0. The writers lock the orders in the wrapper's lock step before writing.
CREATE FUNCTION "money_rows_one_manager"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
	manager uuid;
	owner uuid;
BEGIN
	SELECT "manager_id" INTO manager FROM "money_actions" WHERE "id" = NEW."money_action_id";
	SELECT "owner_id" INTO owner FROM "orders" WHERE "id" = NEW."order_id";
	-- An unknown action or order is left to its foreign key.
	IF manager IS NULL OR owner IS NULL OR manager = owner THEN
		RETURN NEW;
	END IF;
	RAISE EXCEPTION 'A money row''s order belongs to another owner than its action''s Manager.'
		USING ERRCODE = 'check_violation',
			CONSTRAINT = 'money_rows_one_manager',
			TABLE = TG_TABLE_NAME;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "money_rows_one_manager"
	BEFORE INSERT ON "money_rows"
	FOR EACH ROW EXECUTE FUNCTION "money_rows_one_manager"();
