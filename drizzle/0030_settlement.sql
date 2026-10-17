-- Task 4.5: the settlement action and the confirmations of Finance's settlement screen
-- (08-money-and-settlement.md, Closing 2), writes that move no status, named in each order's history
-- (ORDER_EVENT_TYPES of src/domain/order-moves.ts); the owner's notice of a settlement action and
-- the notice of Send back for correction (NOTIFICATION_TYPES of src/domain/notifications.ts). No
-- statement of this migration uses the new values, so ADD VALUE may run inside the migration's
-- transaction, as in 0027.
ALTER TYPE "public"."order_action_type" ADD VALUE 'SETTLE_CASH';--> statement-breakpoint
ALTER TYPE "public"."order_action_type" ADD VALUE 'CONFIRM_SETTLEMENT';--> statement-breakpoint
ALTER TYPE "public"."order_event_type" ADD VALUE 'SETTLE_CASH';--> statement-breakpoint
ALTER TYPE "public"."order_event_type" ADD VALUE 'CONFIRM_SETTLEMENT';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'CASH_SETTLED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'REQUEST_SENT_BACK_FOR_CORRECTION';