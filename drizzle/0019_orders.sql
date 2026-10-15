CREATE TYPE "public"."number_scope" AS ENUM('ORD', 'ISS', 'RET', 'TRF', 'WOF', 'CNT', 'ENT');--> statement-breakpoint
CREATE TYPE "public"."order_action_type" AS ENUM('SUBMIT', 'APPROVE', 'SEND_BACK', 'REJECT', 'TAKE_BACK', 'SUBMIT_AGAIN', 'CANCEL', 'CLOSE_EXACT', 'SEND_TO_SETTLEMENT', 'SEND_BACK_FOR_CORRECTION', 'CLOSE', 'REOPEN');--> statement-breakpoint
CREATE TYPE "public"."order_event_type" AS ENUM('SUBMIT', 'APPROVE', 'SEND_BACK', 'REJECT', 'TAKE_BACK', 'SUBMIT_AGAIN', 'CANCEL', 'CLOSE_EXACT', 'SEND_TO_SETTLEMENT', 'SEND_BACK_FOR_CORRECTION', 'CLOSE', 'REOPEN');--> statement-breakpoint
CREATE TYPE "public"."order_priority" AS ENUM('NORMAL', 'URGENT');--> statement-breakpoint
CREATE TYPE "public"."order_progress" AS ENUM('OPEN', 'DONE', 'DONE_SHORT', 'NOT_BOUGHT');--> statement-breakpoint
CREATE TYPE "public"."payment_type" AS ENUM('CASH', 'TRANSFER', 'CARD');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('DRAFT', 'PENDING_HEAD', 'PENDING_PRINCIPAL', 'PENDING_FINANCE', 'RETURNED', 'PURCHASING', 'SETTLEMENT', 'CLOSED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "number_counters" (
	"scope" "number_scope" NOT NULL,
	"branch_id" uuid NOT NULL,
	"year" smallint NOT NULL,
	"last_value" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "number_counters_pkey" PRIMARY KEY("scope","branch_id","year"),
	CONSTRAINT "number_counters_year_check" CHECK ("number_counters"."year" BETWEEN 2000 AND 9999),
	CONSTRAINT "number_counters_last_value_check" CHECK ("number_counters"."last_value" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_key" uuid NOT NULL,
	"type" "order_action_type" NOT NULL,
	"actor_id" uuid NOT NULL,
	"reason" text,
	"order_count" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "order_actions_client_key_key" UNIQUE("client_key"),
	CONSTRAINT "order_actions_reason_check" CHECK ("order_actions"."reason" IS NULL OR char_length("order_actions"."reason") BETWEEN 5 AND 500),
	CONSTRAINT "order_actions_order_count_check" CHECK ("order_actions"."order_count" BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"type" "order_event_type" NOT NULL,
	"from_status" "request_status" NOT NULL,
	"to_status" "request_status" NOT NULL,
	"actor_id" uuid NOT NULL,
	"comment" text,
	"note" text,
	"payload" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_extras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"extra_cost_type_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "order_extras_amount_check" CHECK ("order_extras"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "order_revisions_order_id_revision_key" UNIQUE("order_id","revision"),
	CONSTRAINT "order_revisions_revision_check" CHECK ("order_revisions"."revision" >= 1)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"branch_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"status" "request_status" DEFAULT 'DRAFT' NOT NULL,
	"priority" "order_priority" DEFAULT 'NORMAL' NOT NULL,
	"urgent_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"variant_id" uuid,
	"company_id" uuid,
	"department_id" uuid,
	"requester_name" text,
	"needed_by" date,
	"planned_qty" numeric(14, 3),
	"planned_price" bigint,
	"payment_type" "payment_type" NOT NULL,
	"comment" text,
	"reference_photo_file_id" uuid,
	"stock_at_submit" numeric(14, 3),
	"progress" "order_progress" DEFAULT 'OPEN' NOT NULL,
	"finish_reason" text,
	"planned_total" bigint,
	"actual_total" bigint,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"client_key" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "orders_number_key" UNIQUE("number"),
	CONSTRAINT "orders_client_key_key" UNIQUE("client_key"),
	CONSTRAINT "orders_reference_photo_file_id_key" UNIQUE("reference_photo_file_id"),
	CONSTRAINT "orders_number_check" CHECK ("orders"."number" ~ '^[A-Z]{2,4}-[0-9]{2}-[0-9]{4,}$'),
	CONSTRAINT "orders_number_status_check" CHECK ("orders"."number" IS NOT NULL OR "orders"."status" = 'DRAFT'),
	CONSTRAINT "orders_revision_check" CHECK ("orders"."revision" >= 1),
	CONSTRAINT "orders_version_check" CHECK ("orders"."version" >= 1),
	CONSTRAINT "orders_planned_qty_check" CHECK ("orders"."planned_qty" > 0),
	CONSTRAINT "orders_planned_price_check" CHECK ("orders"."planned_price" > 0),
	CONSTRAINT "orders_planned_total_check" CHECK ("orders"."planned_total" >= 0),
	CONSTRAINT "orders_actual_total_check" CHECK ("orders"."actual_total" >= 0),
	CONSTRAINT "orders_stock_at_submit_check" CHECK ("orders"."stock_at_submit" >= 0),
	CONSTRAINT "orders_comment_check" CHECK (char_length("orders"."comment") <= 1000),
	CONSTRAINT "orders_submitted_plan_check" CHECK ("orders"."status" = 'DRAFT' OR ("orders"."variant_id" IS NOT NULL AND "orders"."department_id" IS NOT NULL AND "orders"."needed_by" IS NOT NULL AND "orders"."planned_qty" IS NOT NULL AND "orders"."planned_price" IS NOT NULL AND "orders"."planned_total" IS NOT NULL AND "orders"."submitted_at" IS NOT NULL)),
	CONSTRAINT "orders_urgent_reason_check" CHECK ("orders"."priority" = 'NORMAL' OR "orders"."status" = 'DRAFT' OR btrim(coalesce("orders"."urgent_reason", '')) <> '')
);
--> statement-breakpoint
CREATE TABLE "stock_balances" (
	"branch_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"qty" numeric(14, 3) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "stock_balances_pkey" PRIMARY KEY("branch_id","variant_id"),
	CONSTRAINT "stock_balances_qty_check" CHECK ("stock_balances"."qty" >= 0)
);
--> statement-breakpoint
ALTER TABLE "number_counters" ADD CONSTRAINT "number_counters_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_actions" ADD CONSTRAINT "order_actions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_action_id_order_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."order_actions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_extras" ADD CONSTRAINT "order_extras_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_extras" ADD CONSTRAINT "order_extras_extra_cost_type_id_extra_cost_types_id_fk" FOREIGN KEY ("extra_cost_type_id") REFERENCES "public"."extra_cost_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_revisions" ADD CONSTRAINT "order_revisions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_reference_photo_file_id_files_id_fk" FOREIGN KEY ("reference_photo_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_id_branch_id_key" UNIQUE("id","branch_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_department_branch_fk" FOREIGN KEY ("department_id","branch_id") REFERENCES "public"."departments"("id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "number_counters_branch_id_idx" ON "number_counters" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "order_actions_actor_id_idx" ON "order_actions" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "order_events_order_id_idx" ON "order_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_events_action_id_idx" ON "order_events" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "order_events_actor_id_idx" ON "order_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "order_extras_order_id_idx" ON "order_extras" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_extras_extra_cost_type_id_idx" ON "order_extras" USING btree ("extra_cost_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_one_draft_key" ON "orders" USING btree ("owner_id","branch_id","variant_id","department_id") WHERE "orders"."number" IS NULL;--> statement-breakpoint
CREATE INDEX "orders_branch_id_status_idx" ON "orders" USING btree ("branch_id","status");--> statement-breakpoint
CREATE INDEX "orders_owner_id_idx" ON "orders" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "orders_variant_id_idx" ON "orders" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "orders_department_id_idx" ON "orders" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "orders_company_id_idx" ON "orders" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "orders_created_by_idx" ON "orders" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "orders_submitted_at_idx" ON "orders" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX "stock_balances_variant_id_idx" ON "stock_balances" USING btree ("variant_id");--> statement-breakpoint
-- Written by hand below (decisions 0.2, style 13). The guard of an order (plan of 2.4, decisions 2
-- and 4, Look first): a number never changes (05-order-request-form.md, Order number 3); the
-- branch locks once the order has a number (05 field 1); the plan, with its cached total, changes
-- only while the row's status before the write is DRAFT or RETURNED, except the payment type at
-- PENDING_FINANCE (06-approval-workflow.md rules 1 and 6; CLAUDE.md rule 12); and only a draft
-- that was never submitted is deleted (developer-rules.md rule 11). Refuses with check_violation
-- and names itself as the constraint.
CREATE FUNCTION "orders_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		IF OLD."number" IS NOT NULL THEN
			RAISE EXCEPTION 'Only a draft that was never submitted is deleted.'
				USING ERRCODE = 'check_violation',
					CONSTRAINT = 'orders_delete_draft_only',
					TABLE = 'orders';
		END IF;
		RETURN OLD;
	END IF;
	IF OLD."number" IS NOT NULL AND NEW."number" IS DISTINCT FROM OLD."number" THEN
		RAISE EXCEPTION 'An order number never changes.'
			USING ERRCODE = 'check_violation',
				CONSTRAINT = 'orders_number_fixed',
				TABLE = 'orders';
	END IF;
	IF OLD."number" IS NOT NULL AND NEW."branch_id" <> OLD."branch_id" THEN
		RAISE EXCEPTION 'The branch of a submitted order never changes.'
			USING ERRCODE = 'check_violation',
				CONSTRAINT = 'orders_branch_fixed',
				TABLE = 'orders';
	END IF;
	IF OLD."status" NOT IN ('DRAFT', 'RETURNED') AND (
		NEW."variant_id" IS DISTINCT FROM OLD."variant_id"
		OR NEW."company_id" IS DISTINCT FROM OLD."company_id"
		OR NEW."department_id" IS DISTINCT FROM OLD."department_id"
		OR NEW."requester_name" IS DISTINCT FROM OLD."requester_name"
		OR NEW."needed_by" IS DISTINCT FROM OLD."needed_by"
		OR NEW."planned_qty" IS DISTINCT FROM OLD."planned_qty"
		OR NEW."planned_price" IS DISTINCT FROM OLD."planned_price"
		OR NEW."priority" IS DISTINCT FROM OLD."priority"
		OR NEW."urgent_reason" IS DISTINCT FROM OLD."urgent_reason"
		OR NEW."comment" IS DISTINCT FROM OLD."comment"
		OR NEW."reference_photo_file_id" IS DISTINCT FROM OLD."reference_photo_file_id"
		OR NEW."planned_total" IS DISTINCT FROM OLD."planned_total"
		OR (NEW."payment_type" IS DISTINCT FROM OLD."payment_type" AND OLD."status" <> 'PENDING_FINANCE')
	) THEN
		RAISE EXCEPTION 'The plan of an order changes only while it is a draft or sent back.'
			USING ERRCODE = 'check_violation',
				CONSTRAINT = 'orders_plan_frozen',
				TABLE = 'orders';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "orders_guard"
	BEFORE UPDATE OR DELETE ON "orders"
	FOR EACH ROW EXECUTE FUNCTION "orders_guard"();--> statement-breakpoint
-- The extra costs are part of the plan: written only while their order is DRAFT or RETURNED. An
-- order that is not found is the cascade of a deleted never-submitted draft, whose row is already
-- gone (review of the plan of 2.4, correction 3); the foreign key stops any other missing order.
CREATE FUNCTION "order_extras_guard_of"("checked_order" uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
	"order_status" "request_status";
BEGIN
	SELECT "status" INTO "order_status" FROM "orders" WHERE "id" = "checked_order";
	IF FOUND AND "order_status" NOT IN ('DRAFT', 'RETURNED') THEN
		RAISE EXCEPTION 'The extra costs of an order change only while it is a draft or sent back.'
			USING ERRCODE = 'check_violation',
				CONSTRAINT = 'order_extras_plan_frozen',
				TABLE = 'order_extras';
	END IF;
END;
$$;--> statement-breakpoint
CREATE FUNCTION "order_extras_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP IN ('UPDATE', 'DELETE') THEN
		PERFORM "order_extras_guard_of"(OLD."order_id");
	END IF;
	IF TG_OP IN ('INSERT', 'UPDATE') THEN
		PERFORM "order_extras_guard_of"(NEW."order_id");
		RETURN NEW;
	END IF;
	RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "order_extras_guard"
	BEFORE INSERT OR UPDATE OR DELETE ON "order_extras"
	FOR EACH ROW EXECUTE FUNCTION "order_extras_guard"();--> statement-breakpoint
-- Order actions, events and revisions are history: UPDATE, DELETE and TRUNCATE are refused, as on
-- audit_log and price_history (developer-rules.md rule 7). A correction is a new row.
CREATE FUNCTION "orders_history_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'Order history is append-only: % is refused.', TG_OP
		USING ERRCODE = 'check_violation',
			CONSTRAINT = TG_TABLE_NAME || '_append_only',
			TABLE = TG_TABLE_NAME;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "order_actions_append_only"
	BEFORE UPDATE OR DELETE ON "order_actions"
	FOR EACH ROW EXECUTE FUNCTION "orders_history_append_only"();--> statement-breakpoint
CREATE TRIGGER "order_events_append_only"
	BEFORE UPDATE OR DELETE ON "order_events"
	FOR EACH ROW EXECUTE FUNCTION "orders_history_append_only"();--> statement-breakpoint
CREATE TRIGGER "order_revisions_append_only"
	BEFORE UPDATE OR DELETE ON "order_revisions"
	FOR EACH ROW EXECUTE FUNCTION "orders_history_append_only"();--> statement-breakpoint
CREATE TRIGGER "order_actions_append_only_truncate"
	BEFORE TRUNCATE ON "order_actions"
	FOR EACH STATEMENT EXECUTE FUNCTION "orders_history_append_only"();--> statement-breakpoint
CREATE TRIGGER "order_events_append_only_truncate"
	BEFORE TRUNCATE ON "order_events"
	FOR EACH STATEMENT EXECUTE FUNCTION "orders_history_append_only"();--> statement-breakpoint
CREATE TRIGGER "order_revisions_append_only_truncate"
	BEFORE TRUNCATE ON "order_revisions"
	FOR EACH STATEMENT EXECUTE FUNCTION "orders_history_append_only"();
