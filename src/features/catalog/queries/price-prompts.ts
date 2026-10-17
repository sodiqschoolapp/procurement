import { businessDate } from "@/domain/business-date";
import { authorize } from "@/server/authorize";
import { now } from "@/server/clock";

import {
  type PricePromptRow,
  promptsOf,
  recentPurchasePrices,
} from "../../purchasing/price-prompts";

// The price prompts on /prices (04-catalogs.md rule 4: "When recent purchases differ from the
// reference price by more than 20%, the Head sees a prompt to update it in one click"; open
// question 8, Decided ahead 2; plan of 3.10), read by the one SQL that the PRICE_DIFFERS notice of
// the purchase actions reads too (src/features/purchasing/price-prompts.ts). Under "Manage catalogs, users, branches, settings": catalog.manage, Head only, as every price
// read (plan of 1.9, decision 4); the Head sees every branch, so no branch filter.

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
