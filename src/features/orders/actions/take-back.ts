import type * as z from "zod";

import { type MoveActionInput, orderMoveAction } from "@/server/order-moves";
import { ordersInput } from "@/server/order-action";

// Take back of ticked orders by their owner (06-approval-workflow.md, Allowed moves: "Waiting for
// Head | Take back | Owner | Draft | Only before the Head decides. The number is kept."; rule 8;
// decisions 2.3 items 1 and 5; plan of 2.11). The order becomes a Draft with its number, revision
// and first submit date; it stands in the drafts grid as "Taken back" (05 Drafts 5) and is
// submitted again with Submit, keeping its revision (decided item 1, Look first). Nobody is told
// (decided item 5).

const input = ordersInput({}) as z.ZodType<MoveActionInput>;

export const takeBackOrders = orderMoveAction<MoveActionInput>({
  name: "takeBackOrders",
  action: "TAKE_BACK",
  input,
});
