-- Task 3.5: the buying actions on an Open order (07-purchasing.md, Order progress) are writes that
-- move no status, named in the order's history (ORDER_EVENT_TYPES of src/domain/order-moves.ts).
-- No statement of this migration uses the new values, so ADD VALUE may run inside the migration's
-- transaction. The two CHECKs meet no old row: every order so far is at progress OPEN with no
-- finish reason (plan of 3.5, decided item 5, Look first).
ALTER TYPE "public"."order_action_type" ADD VALUE 'FINISH_ORDER';--> statement-breakpoint
ALTER TYPE "public"."order_action_type" ADD VALUE 'MARK_NOT_BOUGHT';--> statement-breakpoint
ALTER TYPE "public"."order_action_type" ADD VALUE 'REOPEN_BUYING';--> statement-breakpoint
ALTER TYPE "public"."order_event_type" ADD VALUE 'FINISH_ORDER';--> statement-breakpoint
ALTER TYPE "public"."order_event_type" ADD VALUE 'MARK_NOT_BOUGHT';--> statement-breakpoint
ALTER TYPE "public"."order_event_type" ADD VALUE 'REOPEN_BUYING';--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_finish_reason_check" CHECK (("orders"."progress" IN ('DONE_SHORT', 'NOT_BOUGHT')) = ("orders"."finish_reason" IS NOT NULL) AND ("orders"."finish_reason" IS NULL OR char_length("orders"."finish_reason") BETWEEN 5 AND 500));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_progress_status_check" CHECK ("orders"."progress" = 'OPEN' OR "orders"."status" IN ('PURCHASING', 'SETTLEMENT', 'CLOSED'));