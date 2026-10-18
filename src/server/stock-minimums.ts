import { sql } from "drizzle-orm";

import { minimumStep } from "@/domain/stock";

import type { Executor } from "./authorize";
import { now } from "./clock";
import { notify } from "./notify";

// The low-stock notice (10-notifications-analytics-reports.md, Notifications: "Item reached its
// minimum stock | Managers of the branch, once per item until restocked"; 09-warehouse.md, Low
// stock; plan of 5.10). checkMinimum() runs after every change of a branch's stock of a subtype
// (postMovement() of ./stock-ledger.ts, after its balance update) and after every change of the
// minimum (setStockMinimum), inside the caller's transaction, with the balance row already held
// FOR UPDATE by the caller. It takes the minimum row FOR UPDATE after that balance, so every path
// locks balance then minimum, item by item (plan of 5.10, decided item 11 and correction 2).
//
// It sends from the ledger's write step rather than from each action's notify step: one place
// covers every movement that lowers stock, now and in 5.11, 7.2 and 7.4 (decided item 3, Look
// first). It checks no permission: who may move stock or set a minimum is the caller's.

/** The quantity of `variantId` in `branchId` as the caller holds it under the balance lock. */
export type HeldStock = { branchId: string; variantId: string; qty: string };

/**
 * Sends "Item reached its minimum stock" when the item is Low and not yet told, and clears the mark
 * when it is not Low (minimumStep() of src/domain/stock.ts). No minimum row: nothing.
 */
export async function checkMinimum(tx: Executor, stock: HeldStock): Promise<void> {
  const held = await tx.execute<{ min_qty: string | null; notified: boolean }>(sql`
    select min_qty::text as min_qty, low_notified_at is not null as notified
    from stock_minimums
    where branch_id = ${stock.branchId} and variant_id = ${stock.variantId}
    for update`);
  const minimum = held.rows[0];
  if (!minimum) return;

  const step = minimumStep(stock.qty, minimum.min_qty, minimum.notified);
  if (step === "none") return;
  const moment = now();
  await tx.execute(sql`
    update stock_minimums set low_notified_at = ${step === "send" ? moment : null}
    where branch_id = ${stock.branchId} and variant_id = ${stock.variantId}`);
  if (step === "clear") return;

  const found = await tx.execute<{ code: string; product: string; subtype: string | null }>(sql`
    select b.code, p.name as product, case when v.is_default then null else v.name end as subtype
    from branches b, product_variants v join products p on p.id = v.product_id
    where b.id = ${stock.branchId} and v.id = ${stock.variantId}`);
  const item = found.rows[0]!;
  // "Managers of the branch": the active Managers assigned to it, whatever their rights (decided
  // item 4, Look first).
  const managers = await tx.execute<{ user_id: string }>(sql`
    select user_id from user_branches
    where branch_id = ${stock.branchId} and user_role = 'MANAGER' and user_is_active
    order by user_id`);
  // `userId: null` on purpose: the Manager whose movement made the item Low is told too. The
  // 0.11 rule "nobody is told of their own act" (header of ./notify.ts; plan of 0.11, decision 5)
  // fits an act, not an item's state: left out, the branch's only Manager would use up the one
  // notice on nobody (plan of 5.10, decided item 4, Look first; review of the plan, correction 3).
  await notify(
    { tx, userId: null },
    {
      to: managers.rows.map((row) => row.user_id),
      type: "MINIMUM_STOCK_REACHED",
      params: {
        item: item.subtype === null ? item.product : `${item.product} — ${item.subtype}`,
        branch: item.code,
      },
      branchId: stock.branchId,
      link: `/warehouse/items/${stock.variantId}?branch=${stock.branchId}`,
      at: moment,
    },
  );
}
