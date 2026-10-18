ALTER TYPE "public"."import_kind" ADD VALUE 'STOCK';--> statement-breakpoint
ALTER TABLE "catalog_imports" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_documents" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "catalog_imports" ADD CONSTRAINT "catalog_imports_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_import_id_catalog_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."catalog_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_imports_branch_id_idx" ON "catalog_imports" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "stock_documents_import_id_idx" ON "stock_documents" USING btree ("import_id");--> statement-breakpoint
ALTER TABLE "catalog_imports" ADD CONSTRAINT "catalog_imports_branch_check" CHECK (("catalog_imports"."kind"::text = 'STOCK') = ("catalog_imports"."branch_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "stock_documents" ADD CONSTRAINT "stock_documents_import_check" CHECK ("stock_documents"."import_id" IS NULL OR "stock_documents"."type" = 'DIRECT_ENTRY');