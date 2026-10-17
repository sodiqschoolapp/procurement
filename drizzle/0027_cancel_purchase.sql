-- Task 3.7: a purchase record or a whole trip is cancelled on an Open order (07-purchasing.md,
-- Fixing a mistake), a write that moves no status, named in the order's history
-- (ORDER_EVENT_TYPES of src/domain/order-moves.ts). No statement of this migration uses the new
-- value, so ADD VALUE may run inside the migration's transaction. The cancel itself is the one
-- update the trigger purchases_cancel_only of 0024 allows (Decided ahead, question 3).
ALTER TYPE "public"."order_action_type" ADD VALUE 'CANCEL_PURCHASE';--> statement-breakpoint
ALTER TYPE "public"."order_event_type" ADD VALUE 'CANCEL_PURCHASE';