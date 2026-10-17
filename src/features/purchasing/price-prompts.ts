import { sql } from "drizzle-orm";

import { businessDate } from "@/domain/business-date";
import { now } from "@/server/clock";
import { notify } from "@/server/notify";
import type { Transaction } from "@/server/order-action";

import { promptsOf, recentPurchasePrices } from "../catalog/queries/price-prompts";
import { ownersAndHeads } from "../orders/actions/notices";

// The PRICE_DIFFERS notice of a purchase action (10 Notifications: "Recent purchases differ from
// the reference price by more than 20%" → Head; plan of 3.10, decided item 8, Look first): sent
// when the action made a prompt appear for a subtype and branch, once per action, its count the
// subtypes newly prompting. Run from the notify step of recordPurchase and of the cancels, in their
// transaction: the records of the action are named by its history events, and the state before
// it is read in the same transaction as if the trip's records were absent (a trip) or the cancelled
// ones live (a cancel). Both actions hold the subtypes bought FOR UPDATE since their write step,
// so two actions on one subtype at the same moment run one after the other: exactly one of them
// sees the prompt appear.

export async function noticePriceDiffers(
  context: { tx: Transaction; userId: string },
  actionId: string,
  change: "recorded" | "cancelled",
): Promise<void> {
  const { tx, userId } = context;
  const found = await tx.execute<{ id: string; branch_id: string; variant_id: string }>(sql`
    select p.id, p.branch_id, p.variant_id from order_events e
    join purchases p on p.id = (e.payload -> 'purchase' ->> 'id')::uuid
    where e.action_id = ${actionId}`);
  if (found.rows.length === 0) return;
  // One branch per action: a trip is one branch (3.4), and a cancel is of one trip's records.
  const branchId = found.rows[0]!.branch_id;
  const recordIds = found.rows.map((row) => row.id);
  const variantIds = [...new Set(found.rows.map((row) => row.variant_id))];
  const today = businessDate(now());
  const read = (asBefore: boolean) =>
    recentPurchasePrices(tx, {
      today,
      branchId,
      variantIds,
      ...(asBefore ? (change === "recorded" ? { absent: recordIds } : { live: recordIds }) : {}),
    });
  const before = new Set(promptsOf(await read(true)).map((row) => row.variantId));
  const appeared = promptsOf(await read(false)).filter((row) => !before.has(row.variantId));
  if (appeared.length === 0) return;
  await notify(
    { tx, userId },
    {
      to: await ownersAndHeads(tx, []),
      type: "PRICE_DIFFERS",
      params: { count: appeared.length, branch: appeared[0]!.branchCode },
      branchId,
      link: "/prices",
      at: now(),
    },
  );
}
