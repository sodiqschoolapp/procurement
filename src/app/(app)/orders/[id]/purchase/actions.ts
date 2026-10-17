"use server";

import { revalidatePath } from "next/cache";

import { recordPurchase } from "@/features/purchasing/actions/record-purchase";
import type { ActionResult } from "@/server/action-result";
import { type OrdersResult, ordersServerAction } from "@/server/order-action";

// The page action of the purchase form (plan of 3.3). The definition's own wrapper checks
// everything again: lock, `purchase.record`, version, status, the fields.

const record = ordersServerAction(recordPurchase);

/** Records a purchase for one Open order, a trip of one (07-purchasing.md, Purchase record). */
export async function recordPurchaseAction(input: unknown): Promise<ActionResult<OrdersResult>> {
  const result = await record(input);
  if (result.ok) revalidatePath("/orders");
  return result;
}
