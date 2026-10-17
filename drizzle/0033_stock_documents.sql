CREATE TYPE "public"."stock_document_reason" AS ENUM('EXISTING_STOCK', 'GIFT', 'DAMAGED', 'EXPIRED', 'LOST', 'RETURNED_TO_SUPPLIER', 'LOST_IN_TRANSFER', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."stock_document_status" AS ENUM('PENDING_APPROVAL', 'POSTED', 'IN_TRANSIT', 'RECEIVED', 'REJECTED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."stock_document_type" AS ENUM('ISSUE', 'RETURN', 'TRANSFER', 'WRITE_OFF', 'COUNT', 'DIRECT_ENTRY');--> statement-breakpoint
CREATE TABLE "stock_document_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"counted_qty" numeric(14, 3),
	"received_qty" numeric(14, 3),
	"unit_cost" bigint,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "stock_document_lines_document_id_variant_id_key" UNIQUE("document_id","variant_id"),
	CONSTRAINT "stock_document_lines_id_variant_id_key" UNIQUE("id","variant_id"),
	CONSTRAINT "stock_document_lines_qty_check" CHECK ("stock_document_lines"."qty" >= 0),
	CONSTRAINT "stock_document_lines_counted_qty_check" CHECK ("stock_document_lines"."counted_qty" >= 0),
	CONSTRAINT "stock_document_lines_received_qty_check" CHECK ("stock_document_lines"."received_qty" >= 0),
	CONSTRAINT "stock_document_lines_unit_cost_check" CHECK ("stock_document_lines"."unit_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"type" "stock_document_type" NOT NULL,
	"branch_id" uuid NOT NULL,
	"to_branch_id" uuid,
	"department_id" uuid,
	"received_by_name" text,
	"doc_date" date NOT NULL,
	"status" "stock_document_status" NOT NULL,
	"reason" "stock_document_reason",
	"comment" text,
	"client_key" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"reversed_by" uuid,
	"reversed_at" timestamp with time zone,
	"reverse_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "stock_documents_number_key" UNIQUE("number"),
	CONSTRAINT "stock_documents_client_key_key" UNIQUE("client_key"),
	CONSTRAINT "stock_documents_number_check" CHECK ("stock_documents"."number" ~ ('^' || CASE "stock_documents"."type"
        WHEN 'ISSUE' THEN 'ISS' WHEN 'RETURN' THEN 'RET' WHEN 'TRANSFER' THEN 'TRF'
        WHEN 'WRITE_OFF' THEN 'WOF' WHEN 'COUNT' THEN 'CNT' WHEN 'DIRECT_ENTRY' THEN 'ENT'
      END || '-[A-Z]{2,4}-[0-9]{2}-[0-9]{4,}$')),
	CONSTRAINT "stock_documents_to_branch_check" CHECK (("stock_documents"."type" = 'TRANSFER') = ("stock_documents"."to_branch_id" IS NOT NULL)
        AND "stock_documents"."to_branch_id" IS DISTINCT FROM "stock_documents"."branch_id"),
	CONSTRAINT "stock_documents_department_check" CHECK (("stock_documents"."type" IN ('ISSUE', 'RETURN')) = ("stock_documents"."department_id" IS NOT NULL)),
	CONSTRAINT "stock_documents_reason_check" CHECK (COALESCE(CASE "stock_documents"."type"
        WHEN 'DIRECT_ENTRY' THEN "stock_documents"."reason" IN ('EXISTING_STOCK', 'GIFT', 'OTHER')
        WHEN 'WRITE_OFF' THEN "stock_documents"."reason" IN ('DAMAGED', 'EXPIRED', 'LOST',
          'RETURNED_TO_SUPPLIER', 'LOST_IN_TRANSFER', 'OTHER')
        ELSE "stock_documents"."reason" IS NULL
      END, false)),
	CONSTRAINT "stock_documents_decided_check" CHECK (("stock_documents"."decided_by" IS NULL) = ("stock_documents"."decided_at" IS NULL)),
	CONSTRAINT "stock_documents_reversed_check" CHECK (CASE WHEN "stock_documents"."status" = 'REVERSED'
        THEN "stock_documents"."reversed_by" IS NOT NULL AND "stock_documents"."reversed_at" IS NOT NULL
          AND COALESCE(btrim("stock_documents"."reverse_reason"), '') <> ''
        ELSE "stock_documents"."reversed_by" IS NULL AND "stock_documents"."reversed_at" IS NULL
          AND "stock_documents"."reverse_reason" IS NULL
      END)
);
--> statement-breakpoint
DROP INDEX "stock_movements_reverses_movement_id_idx";--> statement-breakpoint
ALTER TABLE "stock_document_lines" ADD CONSTRAINT "stock_document_lines_document_id_stock_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."stock_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_document_lines" ADD CONSTRAINT "stock_document_lines_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_to_branch_id_branches_id_fk" FOREIGN KEY ("to_branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_reversed_by_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_department_branch_fk" FOREIGN KEY ("department_id","branch_id") REFERENCES "public"."departments"("id","branch_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_document_lines_variant_id_idx" ON "stock_document_lines" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "stock_documents_branch_id_doc_date_idx" ON "stock_documents" USING btree ("branch_id","doc_date");--> statement-breakpoint
CREATE INDEX "stock_documents_type_idx" ON "stock_documents" USING btree ("type");--> statement-breakpoint
CREATE INDEX "stock_documents_status_idx" ON "stock_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stock_documents_department_id_idx" ON "stock_documents" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "stock_documents_to_branch_id_idx" ON "stock_documents" USING btree ("to_branch_id");--> statement-breakpoint
CREATE INDEX "stock_documents_created_by_idx" ON "stock_documents" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "stock_documents_decided_by_idx" ON "stock_documents" USING btree ("decided_by");--> statement-breakpoint
CREATE INDEX "stock_documents_reversed_by_idx" ON "stock_documents" USING btree ("reversed_by");--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_document_line_fk" FOREIGN KEY ("document_line_id","variant_id") REFERENCES "public"."stock_document_lines"("id","variant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stock_movements_reverses_movement_id_key" ON "stock_movements" USING btree ("reverses_movement_id");--> statement-breakpoint
CREATE INDEX "stock_movements_document_line_id_idx" ON "stock_movements" USING btree ("document_line_id");