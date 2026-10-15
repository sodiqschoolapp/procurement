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
