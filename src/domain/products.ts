import { isNote } from "./catalogs";

// Products and services (04-catalogs.md, Catalogs table: "Name, type (product or service; product
// is the default), category, measure, photo, default brand or company, reference price,
// description, active"; "Type and measure lock after first use"; A7; build-plan 1.7). Pure: the
// actions of src/features/catalog/actions/products.ts and the form read these, and the database
// holds the enum, the unique name and the price CHECK as its last defence (migration 0012).

/** 14-data-model.md, products.type: [GOODS|SERVICE]. On screen "Product" and "Service". */
export const PRODUCT_TYPES = ["GOODS", "SERVICE"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

/** "Product is the default" (04 Catalogs table; A7): a new item is GOODS unless SERVICE is chosen. */
export const DEFAULT_PRODUCT_TYPE: ProductType = "GOODS";

export function isProductType(value: unknown): value is ProductType {
  return typeof value === "string" && (PRODUCT_TYPES as readonly string[]).includes(value);
}

/** A product's description: the rule of a company's note, trimmed, 1 to 1000 code points. */
export const isDescription = isNote;

/** The fields of a product that lock after first use (04 Catalogs table). */
export const PRODUCT_LOCKED_AFTER_USE = ["type", "unitId"] as const;

/**
 * A measure's "Allows decimals" locks once a product uses the measure (plan of 1.5, decision 2,
 * Look first; wired in 1.7): a quantity already written in it would otherwise change its meaning.
 */
export const MEASURE_LOCKED_AFTER_USE = ["allowDecimal"] as const;

/**
 * The fields of `changed` that may not change because the record is in use: those of `locked`
 * when `inUse`, none otherwise. "First use" is any row that holds a quantity of one of the
 * product's subtypes (plan review of 1.7, correction 1); the server finds it, this decides.
 */
export function lockedChanges<Field extends string>(
  locked: readonly Field[],
  changed: readonly string[],
  inUse: boolean,
): Field[] {
  if (!inUse) return [];
  return locked.filter((field) => changed.includes(field));
}

/**
 * The name of a product's hidden subtype (04-catalogs.md rule 1: "A product without subtypes gets
 * one hidden subtype called 'default'"). No screen shows it.
 */
export const DEFAULT_SUBTYPE_NAME = "default";

/**
 * Whether the price sent with a product's first real subtype must be refused: the first subtype is
 * the hidden default made real (plan of 1.8, decision 1, Look first), and a price it already holds
 * changes only as a new price with a note (04 rule 4; decision 2, Look first). With none held, the
 * sent price is the subtype's first; with none sent, the held one stays.
 */
export function firstSubtypePriceRefused(held: bigint | null, sent: bigint | null): boolean {
  return held !== null && sent !== null;
}

/** The price the first real subtype keeps: the one held, else the one sent (decision 2). */
export function firstSubtypePrice(held: bigint | null, sent: bigint | null): bigint | null {
  return held ?? sent;
}
