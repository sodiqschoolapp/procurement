import { sql } from "drizzle-orm";

import { type BusinessDate, businessDate } from "@/domain/business-date";
import {
  type PricePrompt,
  RECENT_PURCHASE_COUNT,
  pricePrompt,
  recentPurchaseSince,
} from "@/domain/prices";
import type { Executor } from "@/server/authorize";
import { now } from "@/server/clock";
import { notify } from "@/server/notify";
import type { Transaction } from "@/server/order-action";

import { ownersAndHeads } from "../orders/actions/notices";

// The recent purchases of the price prompt (04-catalogs.md rule 4; open question 8, Decided ahead
// 2; plan of 3.10): one SQL, read by the list on /prices (getPricePrompts() of
// src/features/catalog/queries/price-prompts.ts, which authorizes) and by the notice below. Per
// branch and subtype bought (decided items 5 and 7), records not cancelled and above 0 so'm
// (decided item 4, Look first) whose trip is dated on or after recentPurchaseSince(today)
// (decided item 6), newest trip date first, then the newest record, the newest 3. Inactive
// subtypes and products are left out (decided item 12). pricePrompt() of the domain decides.
//
// The PRICE_DIFFERS notice of a purchase action (10 Notifications: "Recent purchases differ from
// the reference price by more than 20%" → Head; plan of 3.10, decided item 8, Look first): sent
// when the action made a prompt appear for a subtype and branch, once per action, its count the
// subtypes newly prompting. Run from the notify step of recordPurchase and of the cancels, in their
// transaction: the records of the action are named by its history events, and the state before
// it is read in the same transaction as if the trip's records were absent (a trip) or the cancelled
// ones live (a cancel). Both actions hold the subtypes bought FOR UPDATE since their write step,
// so two actions on one subtype at the same moment run one after the other: exactly one of them
// sees the prompt appear.

export type RecentPrices = {
  branchId: string;
  branchCode: string;
  variantId: string;
  productId: string;
  productName: string;
  /** null for the hidden default of a product without subtypes. */
  subtypeName: string | null;
  /** `product_variants.reference_price`: the price addPrice writes (review correction 3). */
  referencePrice: bigint | null;
  /** Newest first, at most 3. */
  prices: bigint[];
};

/** A list of ids as one bound PostgreSQL array: an empty list stays a valid statement. */
const ids = (values: readonly string[]) => sql`${`{${values.join(",")}}`}::uuid[]`;

/**
 * The recent unit prices per branch and subtype. `branchId` and `variantIds` narrow it (the
 * purchase actions); `absent` reads as if those records did not exist, `live` as if those were not
 * cancelled: how the actions read the state before them in their own transaction.
 */
export async function recentPurchasePrices(
  executor: Executor,
  options: {
    today: BusinessDate;
    branchId?: string;
    variantIds?: readonly string[];
    absent?: readonly string[];
    live?: readonly string[];
  },
): Promise<RecentPrices[]> {
  const since = recentPurchaseSince(options.today);
  const found = await executor.execute<{
    branch_id: string;
    branch_code: string;
    variant_id: string;
    product_id: string;
    product_name: string;
    subtype_name: string | null;
    reference_price: string | null;
    prices: string[];
  }>(sql`
    with recent as (
      select p.branch_id, p.variant_id, p.unit_price,
        row_number() over (
          partition by p.branch_id, p.variant_id
          order by t.purchased_on desc, p.created_at desc, p.id desc) as n
      from purchases p
      join purchase_trips t on t.id = p.trip_id
      where t.purchased_on >= ${since}::date
        and p.unit_price > 0
        and (not p.is_cancelled or p.id = any(${ids(options.live ?? [])}))
        and not p.id = any(${ids(options.absent ?? [])})
        ${options.branchId === undefined ? sql`` : sql`and p.branch_id = ${options.branchId}`}
        ${options.variantIds === undefined ? sql`` : sql`and p.variant_id = any(${ids(options.variantIds)})`}
    )
    select r.branch_id, b.code as branch_code, r.variant_id, v.product_id,
      pr.name as product_name,
      case when v.is_default then null else v.name end as subtype_name,
      v.reference_price::text as reference_price,
      array_agg(r.unit_price::text order by r.n) as prices
    from recent r
    join branches b on b.id = r.branch_id
    join product_variants v on v.id = r.variant_id
    join products pr on pr.id = v.product_id
    where r.n <= ${RECENT_PURCHASE_COUNT} and v.is_active and pr.is_active
    group by r.branch_id, b.code, r.variant_id, v.product_id, pr.name, v.is_default, v.name,
      v.reference_price`);
  return found.rows.map((row) => ({
    branchId: row.branch_id,
    branchCode: row.branch_code,
    variantId: row.variant_id,
    productId: row.product_id,
    productName: row.product_name,
    subtypeName: row.subtype_name,
    referencePrice: row.reference_price === null ? null : BigInt(row.reference_price),
    prices: row.prices.map((price) => BigInt(price)),
  }));
}

export type PricePromptRow = Omit<RecentPrices, "prices"> & PricePrompt;

/** The rows that prompt, from recentPurchasePrices(). */
export function promptsOf(rows: readonly RecentPrices[]): PricePromptRow[] {
  return rows.flatMap(({ prices, ...row }) => {
    const prompt = pricePrompt(row.referencePrice, prices);
    return prompt ? [{ ...row, ...prompt }] : [];
  });
}

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
