import { type BusinessDate, isBusinessDate } from "./business-date";
import { Exact, priceHintPercent } from "./order-totals";

// Prices (04-catalogs.md rule 4: "Each subtype has one reference price, set by the Head. When a
// price changes, the Head adds the new price with a short note, and older prices stay in the price
// history"; 02-assumptions.md A14: one price per subtype for the whole school; build-plan 1.9).
// Pure: the action of src/features/catalog/actions/prices.ts and the form read these, and the
// database holds the enum, the price CHECK, the blank-note CHECK, the append-only trigger and the
// deferred check that the current price is the newest HEAD row as its last defence (migration
// 0014). An amount is read by parseSom() of ./money.

/** 14-data-model.md, price_history.source: [HEAD|PURCHASE]. PURCHASE rows come with 3.2. */
export const PRICE_SOURCES = ["HEAD", "PURCHASE"] as const;
export type PriceSource = (typeof PRICE_SOURCES)[number];

export function isPriceSource(value: unknown): value is PriceSource {
  return typeof value === "string" && (PRICE_SOURCES as readonly string[]).includes(value);
}

/** "A short note" (04 rule 4): at most 200 code points (plan of 1.9, decision 8). */
export const PRICE_NOTE_MAX = 200;

/** A note as it is stored: trimmed at both ends. */
export function priceNote(value: string): string {
  return value.trim();
}

/** A stored note of a new price: required, trimmed, 1 to 200 code points. */
export function isPriceNote(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value) return false;
  const length = Array.from(value).length;
  return length >= 1 && length <= PRICE_NOTE_MAX;
}

// The price prompt (04 rule 4: "When recent purchases differ from the reference price by more
// than 20%, the Head sees a prompt to update it in one click"; 10 Notifications; open question 8,
// Decided ahead 2: "the last 3 purchase records of that subtype in that branch within the last 90
// days, at least 2 of them"; plan of 3.10). The SQL of src/features/catalog/queries/price-prompts.ts
// picks the records with these numbers; this decides the prompt.

/** "More than 20%" (04 rule 4; 10): fixed, not the order's price hint setting (decided item 3, Look first). */
export const PRICE_PROMPT_PERCENT = 20;
/** "The last 3 purchase records" (Decided ahead 2). */
export const RECENT_PURCHASE_COUNT = 3;
/** "At least 2 of them": fewer, no prompt (Decided ahead 2). */
export const RECENT_PURCHASE_MIN = 2;
/** "Within the last 90 days" (Decided ahead 2), today included (decided item 6). */
export const RECENT_PURCHASE_DAYS = 90;

/** The first trip date inside the window: today − 89 days, so 90 days with today (decided item 6). */
export function recentPurchaseSince(today: BusinessDate): BusinessDate {
  if (!isBusinessDate(today)) {
    throw new Error(`Refused: "${today}" is not a business date (YYYY-MM-DD, a day that exists).`);
  }
  const [year, month, day] = today.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day - (RECENT_PURCHASE_DAYS - 1)))
    .toISOString()
    .slice(0, 10);
}

export type PricePrompt = {
  /** The mean of the recent unit prices, rounded half up to whole so'm: what the click sets. */
  average: bigint;
  /** The signed whole percent of the mean against the reference price (as the price hint). */
  percent: bigint;
  /** How many records the mean is of: 2 or 3. */
  count: number;
};

/**
 * The prompt of one subtype in one branch, or null: from its reference price and the unit prices
 * of its purchase records, newest first. A gift (0 so'm) is no real purchase price and is not
 * counted (decided item 4, Look first); only the newest 3 count, and fewer than 2 give none. The
 * mean is plain, not weighted by quantity (decided item 1, Look first). "More than 20%" is
 * compared exactly on the unrounded mean by priceHintPercent(): |sum − n × reference| × 100 >
 * 20 × n × reference (decided item 2, Look first; CLAUDE.md rules 1 and 6).
 */
export function pricePrompt(
  reference: bigint | null,
  prices: readonly bigint[],
): PricePrompt | null {
  if (reference === null) return null;
  const recent = prices.filter((price) => price > 0n).slice(0, RECENT_PURCHASE_COUNT);
  if (recent.length < RECENT_PURCHASE_MIN) return null;
  const count = BigInt(recent.length);
  const sum = recent.reduce((total, price) => total + price, 0n);
  const percent = priceHintPercent(sum, count * reference, PRICE_PROMPT_PERCENT);
  if (percent === null) return null;
  const average = BigInt(
    new Exact(sum.toString())
      .dividedBy(count.toString())
      .toDecimalPlaces(0, Exact.ROUND_HALF_UP)
      .toFixed(0),
  );
  return { average, percent, count: recent.length };
}
