CREATE TABLE "order_draft_adds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_key" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"added_qty" numeric(14, 3) NOT NULL,
	"qty_after" numeric(14, 3) NOT NULL,
	"version_after" integer NOT NULL,
	"total_after" bigint,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "order_draft_adds_client_key_key" UNIQUE("client_key"),
	CONSTRAINT "order_draft_adds_added_qty_check" CHECK ("order_draft_adds"."added_qty" > 0),
	CONSTRAINT "order_draft_adds_qty_after_check" CHECK ("order_draft_adds"."qty_after" > 0),
	CONSTRAINT "order_draft_adds_version_after_check" CHECK ("order_draft_adds"."version_after" > 0),
	CONSTRAINT "order_draft_adds_total_after_check" CHECK ("order_draft_adds"."total_after" >= 0)
);
--> statement-breakpoint
ALTER TABLE "order_draft_adds" ADD CONSTRAINT "order_draft_adds_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_draft_adds" ADD CONSTRAINT "order_draft_adds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_draft_adds_order_id_idx" ON "order_draft_adds" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_draft_adds_user_id_idx" ON "order_draft_adds" USING btree ("user_id");