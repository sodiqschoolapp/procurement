-- Task 7.4c: a transfer In transit can be cancelled, and a refusal carries a reason (09 Other
-- documents; 14-data-model.md, stock_documents). No statement of this migration uses the new
-- values (the check compares status::text), so ADD VALUE may run inside the migration's
-- transaction. The check is added NOT VALID: write-offs and counts refused before this task have
-- no reason, and none is invented for them; every new insert and update is checked (plan of 7.4c,
-- decided item 4, Look first).
ALTER TYPE "public"."notification_type" ADD VALUE 'TRANSFER_CANCELLED';--> statement-breakpoint
ALTER TYPE "public"."stock_document_status" ADD VALUE 'CANCELLED';--> statement-breakpoint
ALTER TABLE "stock_documents" ADD COLUMN "decision_reason" text;--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_decision_reason_check" CHECK (CASE WHEN "stock_documents"."status"::text IN ('REJECTED', 'CANCELLED')
        THEN COALESCE(btrim("stock_documents"."decision_reason"), '') <> ''
        ELSE "stock_documents"."decision_reason" IS NULL
      END) NOT VALID;
