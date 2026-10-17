-- Task 4.7: the Head's "Acknowledge overspend" (08-money-and-settlement.md, Overspend guard), a
-- write that moves no status, named in each order's history (ORDER_EVENT_TYPES of
-- src/domain/order-moves.ts). The columns and the two notice types exist (0004, 0028). No
-- statement of this migration uses the new value, so ADD VALUE may run inside the migration's
-- transaction, as in 0030.
ALTER TYPE "public"."order_action_type" ADD VALUE 'ACKNOWLEDGE_OVERSPEND';--> statement-breakpoint
ALTER TYPE "public"."order_event_type" ADD VALUE 'ACKNOWLEDGE_OVERSPEND';