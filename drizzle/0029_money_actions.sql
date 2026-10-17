-- Task 4.3: Finance records money actions of the six kinds on Open orders and cancels a wrong one
-- whole (08-money-and-settlement.md, Money ledger), writes that move no status, named in each
-- order's history (ORDER_EVENT_TYPES of src/domain/order-moves.ts). No statement of this migration
-- uses the new values, so ADD VALUE may run inside the migration's transaction, as in 0027.
ALTER TYPE "public"."order_action_type" ADD VALUE 'RECORD_MONEY';--> statement-breakpoint
ALTER TYPE "public"."order_action_type" ADD VALUE 'CANCEL_MONEY';--> statement-breakpoint
ALTER TYPE "public"."order_event_type" ADD VALUE 'RECORD_MONEY';--> statement-breakpoint
ALTER TYPE "public"."order_event_type" ADD VALUE 'CANCEL_MONEY';