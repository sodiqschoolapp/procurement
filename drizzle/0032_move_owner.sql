-- Task 4.10: the Head moves ticked orders to another Manager of the same branch at a cash count of 0
-- (03-roles-and-permissions.md rule 7), a write that moves no status, named in each order's history
-- (ORDER_EVENT_TYPES of src/domain/order-moves.ts). The new owner is orders.owner_id; the event's
-- payload holds the old and the new owner. No statement of this migration uses the new value, so ADD
-- VALUE may run inside the migration's transaction, as in 0031.
ALTER TYPE "public"."order_action_type" ADD VALUE 'MOVE_OWNER';--> statement-breakpoint
ALTER TYPE "public"."order_event_type" ADD VALUE 'MOVE_OWNER';