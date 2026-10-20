DROP INDEX "analytics_cancelled_order_id_idx";--> statement-breakpoint
DROP INDEX "analytics_money_order_id_idx";--> statement-breakpoint
DROP INDEX "analytics_money_department_id_idx";--> statement-breakpoint
DROP INDEX "analytics_orders_department_id_idx";--> statement-breakpoint
DROP INDEX "analytics_settlements_department_id_idx";--> statement-breakpoint
DROP INDEX "analytics_stock_moves_document_id_idx";--> statement-breakpoint
DROP INDEX "analytics_stock_moves_department_id_idx";--> statement-breakpoint
DROP INDEX "orders_department_id_idx";--> statement-breakpoint
DROP INDEX "purchases_trip_id_idx";--> statement-breakpoint
DROP INDEX "purchases_order_id_idx";--> statement-breakpoint
DROP INDEX "stock_documents_department_id_idx";--> statement-breakpoint
DROP INDEX "stock_movements_purchase_id_idx";--> statement-breakpoint
DROP INDEX "stock_movements_document_line_id_idx";--> statement-breakpoint
CREATE INDEX "analytics_cancelled_order_id_branch_id_idx" ON "analytics_cancelled" USING btree ("order_id","branch_id");--> statement-breakpoint
CREATE INDEX "analytics_money_order_id_branch_id_idx" ON "analytics_money" USING btree ("order_id","branch_id");--> statement-breakpoint
CREATE INDEX "analytics_money_department_id_branch_id_idx" ON "analytics_money" USING btree ("department_id","branch_id");--> statement-breakpoint
CREATE INDEX "analytics_orders_department_id_branch_id_idx" ON "analytics_orders" USING btree ("department_id","branch_id");--> statement-breakpoint
CREATE INDEX "analytics_settlements_department_id_branch_id_idx" ON "analytics_settlements" USING btree ("department_id","branch_id");--> statement-breakpoint
CREATE INDEX "analytics_settlements_order_id_branch_id_idx" ON "analytics_settlements" USING btree ("order_id","branch_id");--> statement-breakpoint
CREATE INDEX "analytics_stock_moves_document_id_branch_id_idx" ON "analytics_stock_moves" USING btree ("document_id","branch_id");--> statement-breakpoint
CREATE INDEX "analytics_stock_moves_department_id_branch_id_idx" ON "analytics_stock_moves" USING btree ("department_id","branch_id");--> statement-breakpoint
CREATE INDEX "categories_name_idx" ON "categories" USING btree ("name");--> statement-breakpoint
CREATE INDEX "companies_name_idx" ON "companies" USING btree ("name");--> statement-breakpoint
CREATE INDEX "extra_cost_types_name_idx" ON "extra_cost_types" USING btree ("name");--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("name");--> statement-breakpoint
CREATE INDEX "units_name_idx" ON "units" USING btree ("name");--> statement-breakpoint
CREATE INDEX "orders_department_id_branch_id_idx" ON "orders" USING btree ("department_id","branch_id");--> statement-breakpoint
CREATE INDEX "orders_branch_id_needed_by_idx" ON "orders" USING btree ("branch_id","needed_by");--> statement-breakpoint
CREATE INDEX "branches_name_idx" ON "branches" USING btree ("name");--> statement-breakpoint
CREATE INDEX "user_branches_user_id_user_role_user_is_active_idx" ON "user_branches" USING btree ("user_id","user_role","user_is_active");--> statement-breakpoint
CREATE INDEX "purchases_trip_id_branch_id_idx" ON "purchases" USING btree ("trip_id","branch_id");--> statement-breakpoint
CREATE INDEX "purchases_order_id_branch_id_idx" ON "purchases" USING btree ("order_id","branch_id");--> statement-breakpoint
CREATE INDEX "users_full_name_idx" ON "users" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "stock_documents_branch_id_created_at_idx" ON "stock_documents" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_documents_department_id_branch_id_idx" ON "stock_documents" USING btree ("department_id","branch_id");--> statement-breakpoint
CREATE INDEX "stock_movements_purchase_id_branch_id_variant_id_idx" ON "stock_movements" USING btree ("purchase_id","branch_id","variant_id");--> statement-breakpoint
CREATE INDEX "stock_movements_document_line_id_variant_id_idx" ON "stock_movements" USING btree ("document_line_id","variant_id");