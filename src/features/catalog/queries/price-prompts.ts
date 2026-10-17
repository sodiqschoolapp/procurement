import { sql } from "drizzle-orm";

import { type BusinessDate, businessDate } from "@/domain/business-date";
import {
  type PricePrompt,
  RECENT_PURCHASE_COUNT,
  pricePrompt,
  recentPurchaseSince,
} from "@/domain/prices";
import { type Executor, authorize } from "@/server/authorize";
import { now } from "@/server/clock";

// The price prompts (04-catalogs.md rule 4: "When recent purchases differ from the reference price
// by more than 20%, the Head sees a prompt to update it in one click"; open question 8, Decided
// ahead 2; plan of 3.10). One SQL picks the recent records, for the list on /prices and for the
// PRICE_DIFFERS notice of the purchase actions (src/features/purchasing/price-prompts.ts):
// per branch and subtype bought (decided items 5 and 7), records not cancelled and above 0 so'm
// (decided item 4, Look first) whose trip is dated on or after recentPurchaseSince(today)
// (decided item 6), newest trip date first, then the newest record, the newest 3. Inactive
// subtypes and products are left out (decided item 12). pricePrompt() of the domain decides.
// Under "Manage catalogs, users, branches, settings": catalog.manage, Head only, as every price
// read (plan of 1.9, decision 4); the Head sees every branch, so no branch filter.

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

const size = (percent: bigint) => (percent < 0n ? -percent : percent);

/**
 * Every prompt now, the largest difference first, then by product, subtype and branch code
 * (decided item 14). No paging: at most one row per subtype and branch.
 */
export async function getPricePrompts(userId: string): Promise<PricePromptRow[]> {
  await authorize(userId, "catalog.manage");
  // Loaded here, not at the top: `next build` has no DATABASE_URL (progress 0.6).
  const { db } = await import("@/server/db/client");
  const rows = promptsOf(await recentPurchasePrices(db, { today: businessDate(now()) }));
  return rows.sort(
    (a, b) =>
      (size(b.percent) > size(a.percent) ? 1 : size(b.percent) < size(a.percent) ? -1 : 0) ||
      a.productName.localeCompare(b.productName) ||
      (a.subtypeName ?? "").localeCompare(b.subtypeName ?? "") ||
      a.branchCode.localeCompare(b.branchCode),
  );
}
