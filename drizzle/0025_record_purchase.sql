-- Task 3.3: recording a purchase is a write on an Open order that moves no status, named in the
-- order's history as RECORD_PURCHASE (ORDER_EVENT_TYPES of src/domain/order-moves.ts). No statement
-- of this migration uses the new value, so ADD VALUE may run inside the migration's transaction.
ALTER TYPE "public"."order_action_type" ADD VALUE 'RECORD_PURCHASE';--> statement-breakpoint
ALTER TYPE "public"."order_event_type" ADD VALUE 'RECORD_PURCHASE';